import { z } from 'zod';

export const catalogQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(80).optional(),
    type: z.enum(['moon', 'planet', 'star', 'constellation']).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
