import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  CustomerRepository,
  ListCustomersParams,
  PagedCustomers,
} from "../ports/customer-repository.js";
import type { Customer } from "../../domain/entities/customer.js";
import { CustomerNotFoundError } from "../../domain/entities/customer.js";
import { ConflictError } from "../../domain/errors/domain-error.js";
import { createCustomer } from "./create-customer.js";
import { deleteCustomer } from "./delete-customer.js";
import { getCustomer } from "./get-customer.js";
import { listCustomers } from "./list-customers.js";
import { updateCustomer } from "./update-customer.js";

class InMemoryCustomerRepository implements CustomerRepository {
  private readonly rows = new Map<string, Customer>();

  findById(id: string): Promise<Customer | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findByEmail(email: string): Promise<Customer | null> {
    for (const row of this.rows.values()) {
      if (row.email === email) return Promise.resolve(row);
    }
    return Promise.resolve(null);
  }

  insert(customer: Customer): Promise<void> {
    this.rows.set(customer.id, customer);
    return Promise.resolve();
  }

  update(customer: Customer): Promise<void> {
    this.rows.set(customer.id, customer);
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  list(params: ListCustomersParams): Promise<PagedCustomers> {
    let rows = [...this.rows.values()];
    if (params.search) {
      const needle = params.search.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.name.toLowerCase().includes(needle) ||
          (row.email?.toLowerCase().includes(needle) ?? false) ||
          (row.phone?.toLowerCase().includes(needle) ?? false),
      );
    }
    rows.sort((a, b) =>
      params.sort === "name" ? a.name.localeCompare(b.name) : a.createdAt - b.createdAt,
    );
    if (params.order === "desc") rows.reverse();
    const total = rows.length;
    const offset = (params.page - 1) * params.limit;
    return Promise.resolve({
      rows: rows.slice(offset, offset + params.limit),
      total,
    });
  }
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  const now = Date.now();
  return {
    id: randomUUID(),
    name: "Ana Silva",
    email: null,
    phone: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("createCustomer", () => {
  it("generates id/timestamps and applies defaults", async () => {
    const repository = new InMemoryCustomerRepository();
    const customer = await createCustomer(repository, { name: "Ana Silva" });

    expect(customer.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(customer.email).toBeNull();
    expect(customer.phone).toBeNull();
    expect(customer.createdAt).toBe(customer.updatedAt);
    expect(await repository.findById(customer.id)).toEqual(customer);
  });

  it("stores email and phone when provided", async () => {
    const repository = new InMemoryCustomerRepository();
    const customer = await createCustomer(repository, {
      name: "Ana Silva",
      email: "ana@example.com",
      phone: "+5511999990000",
    });

    expect(customer.email).toBe("ana@example.com");
    expect(customer.phone).toBe("+5511999990000");
  });

  it("rejects a duplicate email with ConflictError", async () => {
    const repository = new InMemoryCustomerRepository();
    await repository.insert(makeCustomer({ email: "taken@example.com" }));

    await expect(
      createCustomer(repository, {
        name: "Other",
        email: "taken@example.com",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows multiple customers without email", async () => {
    const repository = new InMemoryCustomerRepository();
    const first = await createCustomer(repository, { name: "Walk-in 1" });
    const second = await createCustomer(repository, { name: "Walk-in 2" });

    expect(first.id).not.toBe(second.id);
    expect(await repository.findById(second.id)).not.toBeNull();
  });
});

describe("getCustomer", () => {
  it("returns the customer when found", async () => {
    const repository = new InMemoryCustomerRepository();
    const customer = makeCustomer({ email: "ana@example.com" });
    await repository.insert(customer);

    expect(await getCustomer(repository, customer.id)).toEqual(customer);
  });

  it("throws CUSTOMER_NOT_FOUND when missing", async () => {
    const repository = new InMemoryCustomerRepository();
    const error = await getCustomer(repository, randomUUID()).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(CustomerNotFoundError);
    expect((error as CustomerNotFoundError).code).toBe("CUSTOMER_NOT_FOUND");
  });
});

describe("listCustomers", () => {
  it("paginates and computes totalPages", async () => {
    const repository = new InMemoryCustomerRepository();
    for (let i = 0; i < 5; i += 1) {
      await repository.insert(makeCustomer({ name: `Customer ${i}` }));
    }

    const page = await listCustomers(repository, {
      page: 2,
      limit: 2,
      sort: "name",
      order: "asc",
    });

    expect(page.total).toBe(5);
    expect(page.totalPages).toBe(3);
    expect(page.customers).toHaveLength(2);
    expect(page.customers[0]?.name).toBe("Customer 2");
  });

  it("searches name, email and phone", async () => {
    const repository = new InMemoryCustomerRepository();
    await repository.insert(makeCustomer({ name: "Ana", email: "ana@example.com" }));
    await repository.insert(makeCustomer({ name: "Bruno", phone: "+5511888880000" }));
    await repository.insert(makeCustomer({ name: "Carla" }));

    const byEmail = await listCustomers(repository, {
      page: 1,
      limit: 10,
      search: "ANA@EXAMPLE",
      sort: "name",
      order: "asc",
    });
    expect(byEmail.total).toBe(1);
    expect(byEmail.customers[0]?.name).toBe("Ana");

    const byPhone = await listCustomers(repository, {
      page: 1,
      limit: 10,
      search: "88888",
      sort: "name",
      order: "asc",
    });
    expect(byPhone.total).toBe(1);
    expect(byPhone.customers[0]?.name).toBe("Bruno");
  });
});

describe("updateCustomer", () => {
  it("applies partial changes and preserves contact fields", async () => {
    const repository = new InMemoryCustomerRepository();
    const customer = makeCustomer({ email: "ana@example.com" });
    await repository.insert(customer);

    const updated = await updateCustomer(repository, {
      id: customer.id,
      changes: { name: "Ana Souza" },
    });

    expect(updated.name).toBe("Ana Souza");
    expect(updated.email).toBe("ana@example.com");
    expect(updated.updatedAt).toBeGreaterThanOrEqual(customer.updatedAt);
  });

  it("sets and clears email with null", async () => {
    const repository = new InMemoryCustomerRepository();
    const customer = makeCustomer();
    await repository.insert(customer);

    const withEmail = await updateCustomer(repository, {
      id: customer.id,
      changes: { email: "new@example.com" },
    });
    expect(withEmail.email).toBe("new@example.com");

    const cleared = await updateCustomer(repository, {
      id: customer.id,
      changes: { email: null },
    });
    expect(cleared.email).toBeNull();
  });

  it("rejects changing the email to one that already exists", async () => {
    const repository = new InMemoryCustomerRepository();
    await repository.insert(makeCustomer({ email: "taken@example.com" }));
    const customer = makeCustomer();
    await repository.insert(customer);

    await expect(
      updateCustomer(repository, {
        id: customer.id,
        changes: { email: "taken@example.com" },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("throws CUSTOMER_NOT_FOUND for a missing customer", async () => {
    const repository = new InMemoryCustomerRepository();
    await expect(
      updateCustomer(repository, { id: randomUUID(), changes: { name: "x" } }),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);
  });
});

describe("deleteCustomer", () => {
  it("removes the customer", async () => {
    const repository = new InMemoryCustomerRepository();
    const customer = makeCustomer();
    await repository.insert(customer);

    await deleteCustomer(repository, customer.id);

    expect(await repository.findById(customer.id)).toBeNull();
  });

  it("throws CUSTOMER_NOT_FOUND for a missing customer", async () => {
    const repository = new InMemoryCustomerRepository();
    await expect(deleteCustomer(repository, randomUUID())).rejects.toBeInstanceOf(
      CustomerNotFoundError,
    );
  });
});
