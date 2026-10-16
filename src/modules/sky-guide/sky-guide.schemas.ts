import { z } from 'zod';

export const skyGuidePositionsSchema = z
  .object({
    objectIds: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
    observedAt: z.iso.datetime({ offset: true }),
    observer: z
      .object({
        latitudeDegrees: z.number().min(-90).max(90),
        longitudeDegrees: z.number().min(-180).max(180),
        elevationMeters: z.number().min(-500).max(10_000).default(0),
      })
      .strict(),
  })
  .strict();

export type SkyGuidePositionsRequest = z.infer<typeof skyGuidePositionsSchema>;
