import type { Sale } from "../../domain/entities/sale.js";
import type { ListSalesParams, SaleRepository } from "../ports/sale-repository.js";

export interface SalePage {
  sales: Sale[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function listSales(
  repository: SaleRepository,
  params: ListSalesParams,
): Promise<SalePage> {
  const { rows, total } = await repository.list(params);
  return {
    sales: rows,
    page: params.page,
    limit: params.limit,
    total,
    totalPages: Math.ceil(total / params.limit),
  };
}
