import { z } from 'zod';

const nullableTrimmedString = (maximum: number) =>
  z.union([z.string().trim().min(1).max(maximum), z.null()]);

export const updateProfileSchema = z
  .object({
    displayName: nullableTrimmedString(100).optional(),
    avatarUrl: z.union([z.url(), z.null()]).optional(),
    locationName: nullableTrimmedString(120).optional(),
    latitude: z.union([z.number().min(-90).max(90), z.null()]).optional(),
    longitude: z.union([z.number().min(-180).max(180), z.null()]).optional(),
    notificationsEnabled: z.boolean().optional(),
    measurementUnit: z.enum(['metric', 'imperial']).optional(),
    language: z.enum(['pt-BR', 'en']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' })
  .refine(
    (value) =>
      (value.latitude === undefined && value.longitude === undefined) ||
      (value.latitude !== undefined && value.longitude !== undefined),
    { message: 'Latitude and longitude must be updated together' },
  );

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
