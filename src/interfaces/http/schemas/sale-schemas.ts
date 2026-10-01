import { z } from "zod";

const saleItemSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(1_000_000),
  })
  .strict();

export const createSaleSchema = z
  .object({
    customerId: z.string().uuid().nullable().optional(),
    items: z.array(saleItemSchema).min(1).max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [index, item] of value.items.entries()) {
      if (seen.has(item.productId)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "productId"],
          message: "Product appears more than once",
        });
      }
      seen.add(item.productId);
    }
  });

export const listSalesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["COMPLETED", "CANCELLED"]).optional(),
  customerId: z.string().uuid().optional(),
  sort: z.enum(["createdAt", "totalCents"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const saleIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateSaleBody = z.infer<typeof createSaleSchema>;
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;
export type SaleIdParams = z.infer<typeof saleIdParamsSchema>;
