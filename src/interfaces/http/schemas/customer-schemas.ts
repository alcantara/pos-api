import { z } from "zod";

export const createCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.email().max(254).nullable().optional(),
    phone: z.string().trim().min(1).max(40).nullable().optional(),
  })
  .strict();

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(["name", "createdAt"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
});

export const customerIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateCustomerBody = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerBody = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CustomerIdParams = z.infer<typeof customerIdParamsSchema>;
