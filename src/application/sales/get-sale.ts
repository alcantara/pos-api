import { SaleNotFoundError } from "../../domain/entities/sale.js";
import type { SaleWithItems } from "../../domain/entities/sale.js";
import type { SaleRepository } from "../ports/sale-repository.js";

export async function getSale(
  repository: SaleRepository,
  id: string,
): Promise<SaleWithItems> {
  const sale = await repository.findById(id);
  if (!sale) {
    throw new SaleNotFoundError(id);
  }
  return sale;
}
