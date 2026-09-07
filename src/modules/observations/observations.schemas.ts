import { z } from 'zod';

const automaticNumber = z.union([z.number().finite(), z.literal('automatic')]);

export const observationPhotoMetadataSchema = z.object({
  title: z.string().trim().min(1).max(160),
  notes: z.string().max(4_000).default(''),
  capturedAt: z.iso.datetime({ offset: true }),
  astronomicalEventId: z.uuid().nullable().optional(),
  celestialObjectName: z.string().trim().min(1).max(160).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  device: z.object({ id: z.string().min(1).max(160), name: z.string().min(1).max(160) }),
  parameters: z.object({
    focusMode: z.enum(['center-metering', 'automatic']),
    exposureMode: z.enum(['manual', 'automatic-metering', 'automatic']),
    exposureCompensationEv: z.number().finite(),
    iso: automaticNumber,
    exposureTimeSeconds: automaticNumber,
    fallbacks: z
      .array(z.enum(['focus-metering', 'manual-exposure', 'exposure-compensation']))
      .max(3),
  }),
});

export const observationPhotoParamsSchema = z.object({
  observationId: z.uuid(),
  photoId: z.uuid(),
});

export type ObservationPhotoMetadata = z.infer<typeof observationPhotoMetadataSchema>;
