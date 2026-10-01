import { eq } from "drizzle-orm";
import type { UserRepository } from "../../application/ports/user-repository.js";
import type { Role, User } from "../../domain/entities/user.js";
import type { SqliteContext } from "../database/sqlite.js";
import { users } from "../database/schema/sqlite.js";
import { toConflictError } from "./db-errors.js";

/** The CHECK constraint guarantees these; mapped without unsafe casts. */
function mapRow(row: typeof users.$inferSelect): User {
  const { role, ...rest } = row;
  if (role !== "ADMIN" && role !== "MANAGER" && role !== "CASHIER") {
    throw new Error(`Unexpected users.role value: ${role}`);
  }
  return { ...rest, role: role satisfies Role };
}

export class SqliteUserRepository implements UserRepository {
  constructor(private readonly ctx: SqliteContext) {}

  async findById(id: string): Promise<User | null> {
    const rows = await this.ctx.guard(async () =>
      this.ctx.db.select().from(users).where(eq(users.id, id)).limit(1),
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.ctx.guard(async () =>
      this.ctx.db.select().from(users).where(eq(users.email, email)).limit(1),
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async insert(user: User): Promise<void> {
    try {
      await this.ctx.guard(async () => {
        await this.ctx.db.insert(users).values(user);
      });
    } catch (error) {
      throw (
        toConflictError(error, {
          unique: `A user with email "${user.email}" already exists`,
        }) ?? error
      );
    }
  }

  async update(user: User): Promise<void> {
    try {
      await this.ctx.guard(async () => {
        await this.ctx.db
          .update(users)
          .set({
            email: user.email,
            name: user.name,
            passwordHash: user.passwordHash,
            role: user.role,
            updatedAt: user.updatedAt,
          })
          .where(eq(users.id, user.id));
      });
    } catch (error) {
      throw (
        toConflictError(error, {
          unique: `A user with email "${user.email}" already exists`,
        }) ?? error
      );
    }
  }
}
