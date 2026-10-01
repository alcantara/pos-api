import type { InventoryMovement } from "../../../domain/entities/sale.js";
import { API_PREFIX } from "../hateoas.js";

export function movementRepresentation(movement: InventoryMovement) {
  return {
    id: movement.id,
    productId: movement.productId,
    type: movement.type,
    quantity: movement.quantity,
    reason: movement.reason,
    createdAt: new Date(movement.createdAt).toISOString(),
    _links: {
      product: { href: `${API_PREFIX}/products/${movement.productId}` },
      movements: {
        href: `${API_PREFIX}/inventory/movements?productId=${movement.productId}`,
      },
    },
  };
}
