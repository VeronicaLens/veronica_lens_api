import { Router, type RequestHandler } from 'express';

import { authenticate } from '../../shared/auth/authenticate.middleware.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { LearningController } from './learning.controller.js';
import type { LearningModelPort } from './learning.model.js';
import { SupabaseLearningModel } from './learning.model.js';

export function createLearningRouter(
  model: LearningModelPort = new SupabaseLearningModel(),
  authenticateHandler: RequestHandler = authenticate,
): Router {
  const controller = new LearningController(model);
  const router = Router();
  router.get('/tracks', authenticateHandler, asyncHandler(controller.listTracks));
  router.get('/tracks/:trackId/lessons', authenticateHandler, asyncHandler(controller.listLessons));
  router.get('/progress', authenticateHandler, asyncHandler(controller.listProgress));
  router.put(
    '/lessons/:lessonId/progress',
    authenticateHandler,
    asyncHandler(controller.upsertProgress),
  );
  return router;
}
