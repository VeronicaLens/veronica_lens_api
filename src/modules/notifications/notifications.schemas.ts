import { z } from 'zod';

const eventPreferenceSchema = z.object({
  eventType: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  leadMinutes: z.number().int().min(0).max(43_200),
});

export const updateNotificationPreferencesSchema = z
  .object({ preferences: z.array(eventPreferenceSchema).min(1).max(20) })
  .strict();

export const registerPushDeviceSchema = z
  .object({
    token: z.string().trim().min(1).max(512),
    platform: z.enum(['android', 'ios']),
  })
  .strict();

export const unregisterPushDeviceSchema = z
  .object({ token: z.string().trim().min(1).max(512) })
  .strict();

export type EventPreferenceInput = z.infer<typeof eventPreferenceSchema>;
