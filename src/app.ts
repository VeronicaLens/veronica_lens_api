import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getEnv } from './config/env.js';
import { createAdminClient, createAuthClient } from './config/supabase.js';
import { SupabaseAuthModel, type AuthModelPort } from './modules/auth/auth.model.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { LocalCatalogModel, type CatalogModelPort } from './modules/catalog/catalog.model.js';
import { createCatalogRouter } from './modules/catalog/catalog.routes.js';
import { JplHorizonsProvider } from './modules/astronomy/jpl-horizons.provider.js';
import { createSupabaseConnectivityRouter } from './modules/connectivity/supabase-connectivity.routes.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { CachedAstronomyEventsModel, type EventsModelPort } from './modules/events/events.model.js';
import { SupabaseEventsPersistence } from './modules/events/events.persistence.js';
import { createEventsRouter } from './modules/events/events.routes.js';
import type { ProfileModelPort } from './modules/profile/profile.model.js';
import { createProfileRouter } from './modules/profile/profile.routes.js';
import {
  createObservationsRouter,
  type ObservationsModelPort,
} from './modules/observations/index.js';
import {
  AstronomySkyGuideModel,
  type SkyGuideModelPort,
} from './modules/sky-guide/sky-guide.model.js';
import { createSkyGuideRouter } from './modules/sky-guide/sky-guide.routes.js';
import { errorHandler } from './shared/http/error-handler.js';
import { notFoundHandler } from './shared/http/not-found.js';

export interface AppOptions {
  corsOrigin?: string;
  enableLogger?: boolean;
  supabaseClientFactory?: () => SupabaseClient;
  authModel?: AuthModelPort;
  catalogModel?: CatalogModelPort;
  skyGuideModel?: SkyGuideModelPort;
  eventsModel?: EventsModelPort;
  authenticateHandler?: express.RequestHandler;
  profileModel?: ProfileModelPort;
  observationsModel?: ObservationsModelPort;
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
  const catalogModel = options.catalogModel ?? new LocalCatalogModel();
  const astronomyProvider = new JplHorizonsProvider();
  app.use('/api/v1/catalog', createCatalogRouter(catalogModel, options.authenticateHandler));
  app.use(
    '/api/v1/sky-guide',
    createSkyGuideRouter(
      options.skyGuideModel ?? new AstronomySkyGuideModel(catalogModel, astronomyProvider),
      options.authenticateHandler,
    ),
  );
  app.use(
    '/api/v1/events',
    createEventsRouter(
      options.eventsModel ??
        new CachedAstronomyEventsModel(
          catalogModel,
          astronomyProvider,
          new SupabaseEventsPersistence(() => createAdminClient(getEnv())),
        ),
      options.authenticateHandler,
    ),
  );
  app.use(
    '/api/v1/profile',
    createProfileRouter(options.profileModel, options.authenticateHandler),
  );
  app.use(
    '/api/v1/observations',
    createObservationsRouter(options.observationsModel, options.authenticateHandler),
  );
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
