import type { User } from "../../domain/entities/user.js";

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  insert(user: User): Promise<void>;
  update(user: User): Promise<void>;
}
