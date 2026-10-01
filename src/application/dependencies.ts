import type { CategoryRepository } from "./ports/category-repository.js";
import type { CustomerRepository } from "./ports/customer-repository.js";
import type { OidcProvider } from "./ports/oidc-provider.js";
import type { ProductRepository } from "./ports/product-repository.js";
import type { UserRepository } from "./ports/user-repository.js";

/**
 * Aggregated persistence ports handed to the HTTP layer. Extended as new
 * modules gain repositories.
 */
export interface Dependencies {
  products: ProductRepository;
  categories: CategoryRepository;
  customers: CustomerRepository;
  users: UserRepository;
  /** OIDC client; fails closed with AUTH_NOT_CONFIGURED when unconfigured. */
  oidc: OidcProvider;
}
