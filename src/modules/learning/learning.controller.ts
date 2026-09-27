import type { Request, Response } from 'express';

import { AppError } from '../../shared/errors/app-error.js';
import type { LearningModelPort } from './learning.model.js';
import {
  lessonProgressParamsSchema,
  trackParamsSchema,
  upsertLessonProgressSchema,
} from './learning.schemas.js';

export class LearningController {
  constructor(private readonly model: LearningModelPort) {}

  listTracks = async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
    const data = await this.model.listTracks(request.auth.supabase);
    response.status(200).json({ data });
  };

  listLessons = async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
    const params = trackParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Track identifier is invalid');
    }
    const data = await this.model.listLessons(request.auth.supabase, params.data.trackId);
    response.status(200).json({ data });
  };

  listProgress = async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
    const data = await this.model.listProgress(request.auth.supabase, request.auth.userId);
    response.status(200).json({ data });
  };

  upsertProgress = async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
    const params = lessonProgressParamsSchema.safeParse(request.params);
    const body = upsertLessonProgressSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Lesson progress request is invalid', {
        fields: body.success ? [] : body.error.issues.map((issue) => issue.path.join('.')),
      });
    }
    const data = await this.model.upsertProgress(request.auth.supabase, request.auth.userId, {
      lessonId: params.data.lessonId,
      status: body.data.status,
      progressPercent: body.data.progressPercent,
    });
    response.status(200).json({ data });
  };
}
