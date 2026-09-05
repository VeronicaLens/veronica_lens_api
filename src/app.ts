import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getEnv } from './config/env.js';
import { createAdminClient, createAuthClient } from './config/supabase.js';
import { SupabaseAuthModel, type AuthModelPort } from './modules/auth/auth.model.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createSupabaseConnectivityRouter } from './modules/connectivity/supabase-connectivity.routes.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { errorHandler } from './shared/http/error-handler.js';
import { notFoundHandler } from './shared/http/not-found.js';

export interface AppOptions {
  corsOrigin?: string;
  enableLogger?: boolean;
  supabaseClientFactory?: () => SupabaseClient;
  authModel?: AuthModelPort;
  authenticateHandler?: express.RequestHandler;
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

  app.use(['/health', '/api/v1/health'], createHealthRouter());
  const authModel =
    options.authModel ??
    new SupabaseAuthModel(
      () => createAuthClient(getEnv()),
      () => createAdminClient(getEnv()),
      () => getEnv().PASSWORD_RESET_REDIRECT_URL,
    );
  app.use('/api/v1/auth', createAuthRouter(authModel, options.authenticateHandler));
  app.use(
    '/api/v1/connectivity/supabase',
    createSupabaseConnectivityRouter(
      options.supabaseClientFactory ?? (() => createAuthClient(getEnv())),
    ),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
