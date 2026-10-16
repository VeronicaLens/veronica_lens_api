import type { Request, Response } from 'express';

import type { SupabaseConnectivityService } from './supabase-connectivity.service.js';

export class SupabaseConnectivityController {
  constructor(private readonly connectivityService: SupabaseConnectivityService) {}

  check = async (_request: Request, response: Response): Promise<void> => {
    response.status(200).json({ data: await this.connectivityService.check() });
  };
}
