import { Router } from 'express';

import { HealthController } from './health.controller.js';
import { HealthModel } from './health.model.js';
import { HealthService } from './health.service.js';

export function createHealthRouter(): Router {
  const model = new HealthModel();
  const service = new HealthService(model);
  const controller = new HealthController(service);
  const router = Router();

  router.get('/', controller.check);

  return router;
}
