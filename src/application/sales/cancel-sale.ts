import {
  SaleAlreadyCancelledError,
  SaleNotFoundError,
} from "../../domain/entities/sale.js";
import type { SaleWithItems } from "../../domain/entities/sale.js";
import type { SaleRepository } from "../ports/sale-repository.js";

export async function cancelSale(
  sales: SaleRepository,
  id: string,
  now = Date.now(),
): Promise<SaleWithItems> {
  return sales.transaction(async (ctx) => {
    const sale = await ctx.findSaleForUpdate(id);
    if (!sale) {
      throw new SaleNotFoundError(id);
    }
    if (sale.status === "CANCELLED") {
      throw new SaleAlreadyCancelledError(id);
    }

    await ctx.applyStockChanges(
      sale.items.map((item) => ({ productId: item.productId, delta: item.quantity })),
    );
    await ctx.recordMovements(
      sale.items.map((item) => ({
        productId: item.productId,
        type: "CANCELLATION" as const,
        quantity: item.quantity,
        reason: `Sale ${sale.id} cancelled`,
        createdAt: now,
      })),
    );

    const cancelled: SaleWithItems = { ...sale, status: "CANCELLED", updatedAt: now };
    await ctx.updateSale(cancelled);
    return cancelled;
  });
}
