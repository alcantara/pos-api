import { z } from "zod";

/**
 * Request validation runs once, at the HTTP boundary. Schemas are `strict`:
 * unknown fields are rejected instead of silently ignored, so a typo'd PATCH
 * field cannot masquerade as a successful update.
 */

export const createProductSchema = z
  .object({
    sku: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    priceCents: z.number().int().min(0),
    stockQuantity: z.number().int().min(0).optional(),
    categoryId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const updateProductSchema = createProductSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(["name", "price", "createdAt"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
});

export const productIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateProductBody = z.infer<typeof createProductSchema>;
export type UpdateProductBody = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type ProductIdParams = z.infer<typeof productIdParamsSchema>;
