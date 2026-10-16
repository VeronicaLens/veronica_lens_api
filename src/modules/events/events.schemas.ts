import { z } from 'zod';

export const upcomingEventsSchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    type: z.enum(['rise', 'transit', 'set']).optional(),
    latitudeDegrees: z.coerce.number().min(-90).max(90),
    longitudeDegrees: z.coerce.number().min(-180).max(180),
    elevationMeters: z.coerce.number().min(-500).max(10_000).default(0),
  })
  .refine((value) => new Date(value.to) > new Date(value.from), { path: ['to'] })
  .refine(
    (value) => new Date(value.to).getTime() - new Date(value.from).getTime() <= 31 * 86_400_000,
    { path: ['to'] },
  );
