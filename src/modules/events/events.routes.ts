import { Router, type RequestHandler } from 'express';

import { authenticate } from '../../shared/auth/authenticate.middleware.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { EventsController } from './events.controller.js';
import type { EventsModelPort } from './events.model.js';
import { EventsService } from './events.service.js';

export function createEventsRouter(
  model: EventsModelPort,
  authenticateHandler: RequestHandler = authenticate,
): Router {
  const controller = new EventsController(new EventsService(model));
  const router = Router();
  router.get('/', authenticateHandler, asyncHandler(controller.upcoming));
  return router;
}
