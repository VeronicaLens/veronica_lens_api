import { z } from 'zod';

export const trackParamsSchema = z.object({
  trackId: z.uuid(),
});

export const lessonProgressParamsSchema = z.object({
  lessonId: z.uuid(),
});

export const upsertLessonProgressSchema = z
  .object({
    status: z.enum(['not_started', 'in_progress', 'completed']),
    progressPercent: z.number().int().min(0).max(100),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.status === 'completed' && input.progressPercent !== 100) {
      context.addIssue({
        code: 'custom',
        path: ['progressPercent'],
        message: 'must be 100 when status is completed',
      });
    }
  });

export type UpsertLessonProgressRequest = z.infer<typeof upsertLessonProgressSchema>;
