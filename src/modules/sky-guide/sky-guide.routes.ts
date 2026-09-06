import { Router, type RequestHandler } from 'express';

import { authenticate } from '../../shared/auth/authenticate.middleware.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { SkyGuideController } from './sky-guide.controller.js';
import type { SkyGuideModelPort } from './sky-guide.model.js';
import { SkyGuideService } from './sky-guide.service.js';

export function createSkyGuideRouter(
  model: SkyGuideModelPort,
  authenticateHandler: RequestHandler = authenticate,
): Router {
  const controller = new SkyGuideController(new SkyGuideService(model));
  const router = Router();
  router.post('/positions', authenticateHandler, asyncHandler(controller.positions));
  return router;
}
