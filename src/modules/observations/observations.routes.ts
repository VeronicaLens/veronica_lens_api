import express, { Router, type RequestHandler } from 'express';

import { authenticate } from '../../shared/auth/authenticate.middleware.js';
import { AppError } from '../../shared/errors/app-error.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { SupabaseObservationsModel, type ObservationsModelPort } from './observations.model.js';
import {
  observationPhotoMetadataSchema,
  observationPhotoParamsSchema,
} from './observations.schemas.js';

const photoTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export function createObservationsRouter(
  model: ObservationsModelPort = new SupabaseObservationsModel(),
  authenticateHandler: RequestHandler = authenticate,
): Router {
  const router = Router();
  router.get(
    '/',
    authenticateHandler,
    asyncHandler(async (request, response) => {
      if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
      const data = await model.list(request.auth.supabase, request.auth.userId);
      response.status(200).json({ data });
    }),
  );
  router.put(
    '/:observationId/photos/:photoId',
    authenticateHandler,
    express.raw({ type: photoTypes, limit: '50mb' }),
    asyncHandler(async (request, response) => {
      if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
      const params = observationPhotoParamsSchema.safeParse(request.params);
      const contentType = request.header('content-type')?.split(';')[0]?.trim().toLowerCase();
      const encodedMetadata = request.header('x-veronica-observation');
      let candidate: unknown;
      try {
        candidate = encodedMetadata ? JSON.parse(decodeURIComponent(encodedMetadata)) : null;
      } catch {
        candidate = null;
      }
      const metadata = observationPhotoMetadataSchema.safeParse(candidate);
      if (
        !params.success ||
        !metadata.success ||
        !contentType ||
        !photoTypes.includes(contentType) ||
        !Buffer.isBuffer(request.body) ||
        request.body.length === 0
      ) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Observation photo request is invalid');
      }
      const data = await model.savePhoto(request.auth.supabase, {
        ...params.data,
        userId: request.auth.userId,
        contentType,
        bytes: request.body,
        metadata: metadata.data,
      });
      response.status(200).json({ data });
    }),
  );
  return router;
}
