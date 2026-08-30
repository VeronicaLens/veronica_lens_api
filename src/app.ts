import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { createHealthRouter } from './modules/health/health.routes.js';
import { errorHandler } from './shared/http/error-handler.js';
import { notFoundHandler } from './shared/http/not-found.js';

export interface AppOptions {
  corsOrigin?: string;
  enableLogger?: boolean;
}

export function createApp(options: AppOptions = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: options.corsOrigin ?? false }));
  app.use(express.json({ limit: '1mb' }));

  if (options.enableLogger !== false) {
    app.use(pinoHttp());
  }

  app.use('/api/v1/health', createHealthRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
