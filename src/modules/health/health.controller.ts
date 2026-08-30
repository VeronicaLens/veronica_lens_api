import type { RequestHandler } from 'express';

import type { HealthService } from './health.service.js';

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  check: RequestHandler = (_request, response) => {
    response.status(200).json({ data: this.healthService.check() });
  };
}
