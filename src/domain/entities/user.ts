export type Role = "ADMIN" | "MANAGER" | "CASHIER";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  role: Role;
  createdAt: number;
  updatedAt: number;
}
