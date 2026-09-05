import { Router, type RequestHandler } from 'express';

import { authenticate } from '../../shared/auth/authenticate.middleware.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { ProfileController } from './profile.controller.js';
import { SupabaseProfileModel, type ProfileModelPort } from './profile.model.js';
import { ProfileService } from './profile.service.js';

export function createProfileRouter(
  model: ProfileModelPort = new SupabaseProfileModel(),
  authenticateHandler: RequestHandler = authenticate,
): Router {
  const controller = new ProfileController(new ProfileService(model));
  const router = Router();
  router.get('/', authenticateHandler, asyncHandler(controller.get));
  router.patch('/', authenticateHandler, asyncHandler(controller.update));
  return router;
}
