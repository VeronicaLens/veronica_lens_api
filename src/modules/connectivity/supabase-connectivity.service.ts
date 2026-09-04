import { AppError } from '../../shared/errors/app-error.js';
import type { SupabaseConnectivityModel } from './supabase-connectivity.model.js';

export class SupabaseConnectivityService {
  constructor(private readonly connectivityModel: SupabaseConnectivityModel) {}

  async check() {
    try {
      const snapshot = await this.connectivityModel.readStatus();

      return {
        provider: 'supabase' as const,
        status: snapshot.status,
      };
    } catch {
      throw new AppError(
        503,
        'SUPABASE_UNAVAILABLE',
        'Supabase connectivity is temporarily unavailable',
      );
    }
  }
}
