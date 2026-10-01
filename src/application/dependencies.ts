import type { CategoryRepository } from "./ports/category-repository.js";
import type { CustomerRepository } from "./ports/customer-repository.js";
import type { OidcProvider } from "./ports/oidc-provider.js";
import type { ProductRepository } from "./ports/product-repository.js";
import type { SaleRepository } from "./ports/sale-repository.js";
import type { UserRepository } from "./ports/user-repository.js";

export interface Dependencies {
  products: ProductRepository;
  categories: CategoryRepository;
  customers: CustomerRepository;
  sales: SaleRepository;
  users: UserRepository;
  oidc: OidcProvider;
}
