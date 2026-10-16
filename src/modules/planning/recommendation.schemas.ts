import { z } from 'zod';

const observerSchema = z
  .object({
    latitudeDegrees: z.number().min(-90).max(90),
    longitudeDegrees: z.number().min(-180).max(180),
    elevationMeters: z.number().min(-500).max(10_000).default(0),
  })
  .strict();

export const observationRecommendationSchema = z
  .object({
    objectId: z.string().trim().min(1).max(100),
    windowFrom: z.iso.datetime({ offset: true }),
    windowTo: z.iso.datetime({ offset: true }),
    observer: observerSchema,
    minimumAltitudeDegrees: z.number().min(0).max(90).default(30),
  })
  .strict()
  .superRefine((input, context) => {
    const from = Date.parse(input.windowFrom);
    const to = Date.parse(input.windowTo);
    if (to <= from) {
      context.addIssue({ code: 'custom', path: ['windowTo'], message: 'must be after windowFrom' });
    } else if (to - from > 24 * 60 * 60 * 1_000) {
      context.addIssue({
        code: 'custom',
        path: ['windowTo'],
        message: 'window cannot exceed 24 hours',
      });
    }
  });

export type ObservationRecommendationRequest = z.infer<typeof observationRecommendationSchema>;
