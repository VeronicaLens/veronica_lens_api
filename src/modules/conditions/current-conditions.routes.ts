import { Router, type RequestHandler } from 'express';

import { authenticate } from '../../shared/auth/authenticate.middleware.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { CurrentConditionsController } from './current-conditions.controller.js';
import type { CurrentConditionsPort } from './current-conditions.service.js';

export function createCurrentConditionsRouter(
  service: CurrentConditionsPort,
  authenticateHandler: RequestHandler = authenticate,
): Router {
  const controller = new CurrentConditionsController(service);
  const router = Router();
  router.get('/forecast', authenticateHandler, asyncHandler(controller.forecast));
  router.get('/current', authenticateHandler, asyncHandler(controller.current));
  return router;
}
