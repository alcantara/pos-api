import type { InventoryMovement } from "../../domain/entities/sale.js";
import type {
  ListMovementsParams,
  InventoryRepository,
} from "../ports/inventory-repository.js";

export interface MovementPage {
  movements: InventoryMovement[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function listMovements(
  inventory: InventoryRepository,
  params: ListMovementsParams,
): Promise<MovementPage> {
  const { rows, total } = await inventory.movements.list(params);
  return {
    movements: rows,
    page: params.page,
    limit: params.limit,
    total,
    totalPages: Math.ceil(total / params.limit),
  };
}
