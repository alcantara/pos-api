import { randomUUID } from "node:crypto";
import { ProductNotFoundError } from "../../domain/entities/product.js";
import { InsufficientStockError } from "../../domain/entities/sale.js";
import type { InventoryMovement } from "../../domain/entities/sale.js";
import type { InventoryRepository } from "../ports/inventory-repository.js";

export type AdjustmentType = "PURCHASE" | "ADJUSTMENT" | "RETURN";

export interface AdjustStockInput {
  productId: string;
  quantity: number;
  type: AdjustmentType;
  reason?: string | null;
}

export async function adjustStock(
  inventory: InventoryRepository,
  input: AdjustStockInput,
  now = Date.now(),
): Promise<InventoryMovement> {
  if (!Number.isInteger(input.quantity) || input.quantity === 0) {
    throw new InsufficientStockError(input.productId, Math.abs(input.quantity), 0);
  }

  return inventory.transaction(async (ctx) => {
    const [product] = await ctx.findProductsForUpdate([input.productId]);
    if (!product) {
      throw new ProductNotFoundError(input.productId);
    }
    if (input.quantity < 0 && product.stockQuantity + input.quantity < 0) {
      throw new InsufficientStockError(
        input.productId,
        Math.abs(input.quantity),
        product.stockQuantity,
      );
    }

    await ctx.applyStockChanges([
      { productId: input.productId, delta: input.quantity },
    ]);

    const movement: InventoryMovement = {
      id: randomUUID(),
      productId: input.productId,
      type: input.type,
      quantity: input.quantity,
      reason: input.reason ?? null,
      createdAt: now,
    };
    await ctx.recordMovements([
      {
        productId: movement.productId,
        type: movement.type,
        quantity: movement.quantity,
        reason: movement.reason,
        createdAt: movement.createdAt,
      },
    ]);

    return movement;
  });
}
