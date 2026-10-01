import type { SaleWithItems } from "../../../domain/entities/sale.js";
import { saleLinks } from "../hateoas.js";

export function saleRepresentation(sale: SaleWithItems) {
  return {
    id: sale.id,
    customerId: sale.customerId,
    userId: sale.userId,
    status: sale.status,
    totalCents: sale.totalCents,
    itemCount: sale.items.length,
    items: sale.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      subtotalCents: item.subtotalCents,
    })),
    createdAt: new Date(sale.createdAt).toISOString(),
    updatedAt: new Date(sale.updatedAt).toISOString(),
    _links: saleLinks(sale.id, sale.status),
  };
}
