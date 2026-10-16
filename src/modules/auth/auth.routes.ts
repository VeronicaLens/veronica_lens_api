import { Router, type RequestHandler } from 'express';

import { authenticate } from '../../shared/auth/authenticate.middleware.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { AuthController } from './auth.controller.js';
import type { AuthModelPort } from './auth.model.js';
import { AuthService } from './auth.service.js';

export function createAuthRouter(
  authModel: AuthModelPort,
  authenticateHandler: RequestHandler = authenticate,
): Router {
  const controller = new AuthController(new AuthService(authModel));
  const router = Router();

  router.post('/sign-up', asyncHandler(controller.signUp));
  router.post('/sign-in', asyncHandler(controller.signIn));
  router.post('/oauth/google', asyncHandler(controller.signInWithGoogle));
  router.post('/refresh', asyncHandler(controller.refresh));
  router.post('/password/recovery', asyncHandler(controller.requestPasswordRecovery));
  router.post('/sign-out', authenticateHandler, asyncHandler(controller.signOut));
  router.post('/password/update', authenticateHandler, asyncHandler(controller.updatePassword));

  return router;
}
