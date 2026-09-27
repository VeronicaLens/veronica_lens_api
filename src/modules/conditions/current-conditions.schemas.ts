import { z } from 'zod';

export const currentConditionsSchema = z.object({
  latitudeDegrees: z.coerce.number().min(-90).max(90),
  longitudeDegrees: z.coerce.number().min(-180).max(180),
  elevationMeters: z.coerce.number().min(-500).max(10_000).default(0),
});

export type CurrentConditionsRequest = z.infer<typeof currentConditionsSchema>;
