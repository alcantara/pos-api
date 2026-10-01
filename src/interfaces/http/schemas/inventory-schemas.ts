import { z } from "zod";

export const adjustStockSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(-1_000_000).max(1_000_000),
    type: z.enum(["PURCHASE", "ADJUSTMENT", "RETURN"]),
    reason: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict()
  .refine((value) => value.quantity !== 0, {
    message: "Quantity must not be zero",
    path: ["quantity"],
  });

export const listMovementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  productId: z.string().uuid().optional(),
  type: z.enum(["SALE", "PURCHASE", "ADJUSTMENT", "RETURN", "CANCELLATION"]).optional(),
  sort: z.enum(["createdAt", "quantity"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type AdjustStockBody = z.infer<typeof adjustStockSchema>;
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;
