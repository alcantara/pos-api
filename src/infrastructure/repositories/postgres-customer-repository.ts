import { asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import type {
  CustomerRepository,
  ListCustomersParams,
  PagedCustomers,
} from "../../application/ports/customer-repository.js";
import type { Customer } from "../../domain/entities/customer.js";
import type { PgContext } from "../database/postgres.js";
import { customers } from "../database/schema/postgres.js";
import { toConflictError } from "./db-errors.js";
import { containsPattern } from "./like.js";

export class PostgresCustomerRepository implements CustomerRepository {
  constructor(private readonly ctx: PgContext) {}

  async findById(id: string): Promise<Customer | null> {
    const rows = await this.ctx.db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<Customer | null> {
    const rows = await this.ctx.db
      .select()
      .from(customers)
      .where(eq(customers.email, email))
      .limit(1);
    return rows[0] ?? null;
  }

  async insert(customer: Customer): Promise<void> {
    try {
      await this.ctx.db.insert(customers).values(customer);
    } catch (error) {
      throw (
        toConflictError(error, {
          unique: `A customer with email "${customer.email}" already exists`,
        }) ?? error
      );
    }
  }

  async update(customer: Customer): Promise<void> {
    try {
      await this.ctx.db
        .update(customers)
        .set({
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          updatedAt: customer.updatedAt,
        })
        .where(eq(customers.id, customer.id));
    } catch (error) {
      throw (
        toConflictError(error, {
          unique: `A customer with email "${customer.email}" already exists`,
        }) ?? error
      );
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.ctx.db.delete(customers).where(eq(customers.id, id));
    } catch (error) {
      throw (
        toConflictError(error, {
          foreignKey: "The customer cannot be deleted while sales reference them",
        }) ?? error
      );
    }
  }

  async list(params: ListCustomersParams): Promise<PagedCustomers> {
    const where = buildSearchFilter(params.search);
    const order = buildOrder(params);
    const offset = (params.page - 1) * params.limit;

    const [rows, counts] = await Promise.all([
      this.ctx.db
        .select()
        .from(customers)
        .where(where)
        .orderBy(...order)
        .limit(params.limit)
        .offset(offset),
      this.ctx.db.select({ total: count() }).from(customers).where(where),
    ]);

    return { rows, total: counts[0]?.total ?? 0 };
  }
}

/** PostgreSQL `ILIKE` is case-insensitive; wildcards are escaped. */
function buildSearchFilter(search: string | undefined): SQL | undefined {
  if (!search) return undefined;
  const pattern = containsPattern(search);
  return sql`(${customers.name} ilike ${pattern} escape '\\' or ${customers.email} ilike ${pattern} escape '\\' or ${customers.phone} ilike ${pattern} escape '\\')`;
}

function buildOrder(params: ListCustomersParams): [SQL, SQL] {
  const column = params.sort === "name" ? customers.name : customers.createdAt;
  const primary = params.order === "asc" ? asc(column) : desc(column);
  return [primary, asc(customers.id)];
}
