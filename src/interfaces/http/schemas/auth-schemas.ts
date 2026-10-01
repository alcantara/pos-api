import { z } from "zod";

export const callbackQuerySchema = z
  .object({
    code: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    error: z.string().min(1).optional(),
  })
  .refine(
    (query) =>
      query.error !== undefined ||
      (query.code !== undefined && query.state !== undefined),
    { message: "Expected either code and state, or error" },
  );

export type CallbackQuery = z.infer<typeof callbackQuerySchema>;
