export interface UserRow {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  role: string;
  createdAt: number;
  updatedAt: number;
}

export interface CategoryRow {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  priceCents: number;
  stockQuantity: number;
  categoryId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SaleRow {
  id: string;
  customerId: string | null;
  userId: string;
  totalCents: number;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface SaleItemRow {
  id: string;
  saleId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

export interface InventoryMovementRow {
  id: string;
  productId: string;
  type: string;
  quantity: number;
  reason: string | null;
  createdAt: number;
}
