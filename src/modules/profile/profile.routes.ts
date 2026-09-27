import express, { Router, type RequestHandler } from 'express';

import { authenticate } from '../../shared/auth/authenticate.middleware.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { ProfileController } from './profile.controller.js';
import { SupabaseProfileModel, type ProfileModelPort } from './profile.model.js';
import { ProfileService } from './profile.service.js';

const avatarTypes = ['image/jpeg', 'image/png', 'image/webp'];

export function createProfileRouter(
  model: ProfileModelPort = new SupabaseProfileModel(),
  authenticateHandler: RequestHandler = authenticate,
): Router {
  const controller = new ProfileController(new ProfileService(model));
  const router = Router();
  router.get('/', authenticateHandler, asyncHandler(controller.get));
  router.patch('/', authenticateHandler, asyncHandler(controller.update));
  router.put(
    '/avatar',
    authenticateHandler,
    express.raw({ type: avatarTypes, limit: '5mb' }),
    asyncHandler(controller.uploadAvatar),
  );
  return router;
}
