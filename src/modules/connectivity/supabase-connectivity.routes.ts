import type { SupabaseClient } from '@supabase/supabase-js';
import { Router } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.js';
import { SupabaseConnectivityController } from './supabase-connectivity.controller.js';
import { SupabaseConnectivityModel } from './supabase-connectivity.model.js';
import { SupabaseConnectivityService } from './supabase-connectivity.service.js';

export function createSupabaseConnectivityRouter(clientFactory: () => SupabaseClient): Router {
  const model = new SupabaseConnectivityModel(clientFactory);
  const service = new SupabaseConnectivityService(model);
  const controller = new SupabaseConnectivityController(service);
  const router = Router();

  router.get('/', asyncHandler(controller.check));

  return router;
}
