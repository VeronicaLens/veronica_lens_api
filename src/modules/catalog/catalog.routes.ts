import { Router, type RequestHandler } from 'express';

import { authenticate } from '../../shared/auth/authenticate.middleware.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { CatalogController } from './catalog.controller.js';
import { LocalCatalogModel, type CatalogModelPort } from './catalog.model.js';
import { CatalogService } from './catalog.service.js';

export function createCatalogRouter(
  model: CatalogModelPort = new LocalCatalogModel(),
  authenticateHandler: RequestHandler = authenticate,
): Router {
  const controller = new CatalogController(new CatalogService(model));
  const router = Router();
  router.get('/celestial-objects', authenticateHandler, asyncHandler(controller.search));
  return router;
}
