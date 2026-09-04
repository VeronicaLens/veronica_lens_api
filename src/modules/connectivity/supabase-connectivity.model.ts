import type { SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConnectivitySnapshot {
  status: string;
}

export class SupabaseConnectivityModel {
  constructor(private readonly clientFactory: () => SupabaseClient) {}

  async readStatus(): Promise<SupabaseConnectivitySnapshot> {
    const { data, error } = await this.clientFactory()
      .from('system_status')
      .select('status')
      .eq('id', 'supabase')
      .single();

    if (error || !data || typeof data.status !== 'string') {
      throw new Error('SUPABASE_CONNECTIVITY_FAILED');
    }

    return { status: data.status };
  }
}
