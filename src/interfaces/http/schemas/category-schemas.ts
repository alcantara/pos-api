import { z } from "zod";

/**
 * Request validation runs once, at the HTTP boundary. Schemas are `strict`:
 * unknown fields are rejected instead of silently ignored, so a typo'd PATCH
 * field cannot masquerade as a successful update.
 */

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .strict();

export const updateCategorySchema = createCategorySchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const listCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(["name", "createdAt"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
});

export const categoryIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateCategoryBody = z.infer<typeof createCategorySchema>;
export type UpdateCategoryBody = z.infer<typeof updateCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
export type CategoryIdParams = z.infer<typeof categoryIdParamsSchema>;
