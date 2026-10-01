import type { CategoryRepository } from "./ports/category-repository.js";
import type { CustomerRepository } from "./ports/customer-repository.js";
import type { IdempotencyStore } from "./ports/idempotency-repository.js";
import type { InventoryRepository } from "./ports/inventory-repository.js";
import type { OidcProvider } from "./ports/oidc-provider.js";
import type { ProductRepository } from "./ports/product-repository.js";
import type { SaleRepository } from "./ports/sale-repository.js";
import type { UserRepository } from "./ports/user-repository.js";

export interface Dependencies {
  products: ProductRepository;
  categories: CategoryRepository;
  customers: CustomerRepository;
  sales: SaleRepository;
  inventory: InventoryRepository;
  idempotency: IdempotencyStore;
  users: UserRepository;
  oidc: OidcProvider;
}
