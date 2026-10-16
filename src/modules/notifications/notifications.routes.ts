import { Router, type RequestHandler } from 'express';

import { authenticate } from '../../shared/auth/authenticate.middleware.js';
import { AppError } from '../../shared/errors/app-error.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { SupabaseNotificationsModel, type NotificationsModelPort } from './notifications.model.js';
import {
  registerPushDeviceSchema,
  unregisterPushDeviceSchema,
  updateNotificationPreferencesSchema,
} from './notifications.schemas.js';

export function createNotificationsRouter(
  model: NotificationsModelPort = new SupabaseNotificationsModel(),
  authenticateHandler: RequestHandler = authenticate,
): Router {
  const router = Router();

  router.get(
    '/preferences',
    authenticateHandler,
    asyncHandler(async (request, response) => {
      if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
      const data = await model.listPreferences(request.auth.supabase, request.auth.userId);
      response.status(200).json({ data });
    }),
  );

  router.put(
    '/preferences',
    authenticateHandler,
    asyncHandler(async (request, response) => {
      if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
      const body = updateNotificationPreferencesSchema.safeParse(request.body);
      if (!body.success)
        throw new AppError(400, 'VALIDATION_ERROR', 'Notification preferences are invalid');
      const data = await model.savePreferences(
        request.auth.supabase,
        request.auth.userId,
        body.data.preferences,
      );
      response.status(200).json({ data });
    }),
  );

  router.post(
    '/devices',
    authenticateHandler,
    asyncHandler(async (request, response) => {
      if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
      const body = registerPushDeviceSchema.safeParse(request.body);
      if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Push device is invalid');
      await model.registerDevice(
        request.auth.supabase,
        request.auth.userId,
        body.data.token,
        body.data.platform,
      );
      response.status(204).end();
    }),
  );

  router.delete(
    '/devices',
    authenticateHandler,
    asyncHandler(async (request, response) => {
      if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
      const body = unregisterPushDeviceSchema.safeParse(request.body);
      if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Push device is invalid');
      await model.deactivateDevice(request.auth.supabase, request.auth.userId, body.data.token);
      response.status(204).end();
    }),
  );

  return router;
}
