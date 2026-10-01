import { randomUUID } from "node:crypto";
import { ValidationError } from "../../domain/errors/domain-error.js";
import { ProductNotFoundError } from "../../domain/entities/product.js";
import {
  InsufficientStockError,
  lineSubtotalCents,
  type Sale,
  type SaleItem,
  type SaleWithItems,
} from "../../domain/entities/sale.js";
import type { SaleRepository } from "../ports/sale-repository.js";

export interface CreateSaleItemInput {
  productId: string;
  quantity: number;
}

export interface SaleIdempotencyClaim {
  key: string;
  requestHash: string;
}

export interface CreateSaleInput {
  customerId?: string | null;
  userId: string;
  items: CreateSaleItemInput[];
  /**
   * Present when the request carries an `Idempotency-Key`. Claimed inside this
   * transaction so the key and the sale commit or roll back together.
   */
  claim?: SaleIdempotencyClaim;
}

function normalizeItems(items: CreateSaleItemInput[]): CreateSaleItemInput[] {
  if (items.length === 0) {
    throw new ValidationError("A sale must contain at least one item");
  }

  const seen = new Set<string>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new ValidationError("Item quantity must be a positive integer");
    }
    if (seen.has(item.productId)) {
      throw new ValidationError(`Product ${item.productId} appears more than once`);
    }
    seen.add(item.productId);
  }

  return items;
}

export async function createSale(
  sales: SaleRepository,
  input: CreateSaleInput,
  now = Date.now(),
): Promise<SaleWithItems> {
  const items = normalizeItems(input.items);
  const saleId = randomUUID();

  return sales.transaction(async (ctx) => {
    const products = await ctx.findProductsForUpdate(
      items.map((item) => item.productId),
    );
    const byId = new Map(products.map((product) => [product.id, product]));

    const saleItems: SaleItem[] = [];
    for (const item of items) {
      const product = byId.get(item.productId);
      if (!product) {
        throw new ProductNotFoundError(item.productId);
      }
      if (product.stockQuantity < item.quantity) {
        throw new InsufficientStockError(
          item.productId,
          item.quantity,
          product.stockQuantity,
        );
      }
      saleItems.push({
        id: randomUUID(),
        saleId,
        productId: product.id,
        quantity: item.quantity,
        unitPriceCents: product.priceCents,
        subtotalCents: lineSubtotalCents(item.quantity, product.priceCents),
      });
    }

    const sale: Sale = {
      id: saleId,
      customerId: input.customerId ?? null,
      userId: input.userId,
      totalCents: saleItems.reduce((sum, item) => sum + item.subtotalCents, 0),
      status: "COMPLETED",
      createdAt: now,
      updatedAt: now,
    };

    if (input.claim) {
      if (!ctx.claimIdempotency) {
        throw new Error("Repository does not support idempotency keys");
      }
      await ctx.claimIdempotency({
        key: input.claim.key,
        userId: input.userId,
        requestHash: input.claim.requestHash,
        resourceId: sale.id,
        createdAt: now,
      });
    }

    await ctx.insertSale(sale);
    await ctx.insertSaleItems(saleItems);
    await ctx.applyStockChanges(
      items.map((item) => ({ productId: item.productId, delta: -item.quantity })),
    );
    await ctx.recordMovements(
      saleItems.map((item) => ({
        productId: item.productId,
        type: "SALE" as const,
        quantity: -item.quantity,
        reason: `Sale ${sale.id}`,
        createdAt: now,
      })),
    );

    return { ...sale, items: saleItems };
  });
}
