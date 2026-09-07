import { Router, type RequestHandler } from 'express';

import { authenticate } from '../../shared/auth/authenticate.middleware.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { ObservationRecommendationController } from './recommendation.controller.js';
import type { ObservationRecommendationPort } from './recommendation.service.js';

export function createObservationRecommendationRouter(
  service: ObservationRecommendationPort,
  authenticateHandler: RequestHandler = authenticate,
): Router {
  const controller = new ObservationRecommendationController(service);
  const router = Router();
  router.post('/observation-window', authenticateHandler, asyncHandler(controller.recommend));
  return router;
}
