import { z } from "zod";

/**
 * The provider controls this redirect: extra query parameters (e.g.
 * `session_state`, `iss`) are tolerated, but a callback must carry either a
 * code+state pair or an error.
 */
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
