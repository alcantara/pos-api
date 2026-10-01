import { createHash } from "node:crypto";
import {
  IdempotencyKeyConflictError,
  IdempotencyKeyTakenError,
} from "../../domain/entities/idempotency.js";
import type { SaleWithItems } from "../../domain/entities/sale.js";
import type {
  IdempotencyScope,
  IdempotencyStore,
} from "../ports/idempotency-repository.js";
import type { SaleRepository } from "../ports/sale-repository.js";
import { createSale, type CreateSaleInput } from "./create-sale.js";
import { getSale } from "./get-sale.js";

export interface IdempotentSaleOutcome {
  sale: SaleWithItems;
  replayed: boolean;
}

/**
 * Stable hash of the request body. Two logically identical bodies must hash
 * equally regardless of key order, so the payload is serialized with sorted
 * keys before hashing.
 */
export function requestFingerprint(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

async function replayExisting(
  sales: SaleRepository,
  store: IdempotencyStore,
  scope: IdempotencyScope,
  requestHash: string,
): Promise<SaleWithItems | null> {
  const existing = await store.find(scope);
  if (!existing) return null;

  if (existing.requestHash !== requestHash) {
    throw new IdempotencyKeyConflictError();
  }
  return getSale(sales, existing.resourceId);
}

/**
 * Creates a sale at most once per idempotency key.
 *
 * Without a key this is exactly `createSale`. With one, the key is claimed
 * inside the sale transaction, so a retried or concurrent request can never
 * produce a second sale: the loser replays the winner's response instead of
 * charging the customer twice.
 */
export async function createSaleIdempotently(
  sales: SaleRepository,
  store: IdempotencyStore,
  input: CreateSaleInput,
  options: { idempotencyKey?: string } = {},
  now = Date.now(),
): Promise<IdempotentSaleOutcome> {
  const key = options.idempotencyKey;
  if (!key) {
    return { sale: await createSale(sales, input, now), replayed: false };
  }

  const scope: IdempotencyScope = { userId: input.userId, key };
  const requestHash = requestFingerprint({
    customerId: input.customerId ?? null,
    items: input.items,
  });

  const replayed = await replayExisting(sales, store, scope, requestHash);
  if (replayed) return { sale: replayed, replayed: true };

  try {
    const sale = await createSale(
      sales,
      { ...input, claim: { key, requestHash } },
      now,
    );
    return { sale, replayed: false };
  } catch (error) {
    if (!(error instanceof IdempotencyKeyTakenError)) throw error;

    // Lost the race: the winner has committed, so its record is readable now.
    const existing = await replayExisting(sales, store, scope, requestHash);
    if (!existing) throw error;
    return { sale: existing, replayed: true };
  }
}
