import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  notifications_enabled: boolean;
  measurement_unit: 'metric' | 'imperial';
  language: 'pt-BR' | 'en';
  created_at: string;
  updated_at: string;
}

export interface ProfileQueryResult {
  data: ProfileRow | null;
  error: { code?: string; message: string } | null;
}

export interface ProfileModelPort {
  findByUserId(client: SupabaseClient, userId: string): Promise<ProfileQueryResult>;
  updateByUserId(
    client: SupabaseClient,
    userId: string,
    values: Record<string, unknown>,
  ): Promise<ProfileQueryResult>;
}

const profileColumns =
  'id, display_name, avatar_url, location_name, latitude, longitude, notifications_enabled, measurement_unit, language, created_at, updated_at';

export class SupabaseProfileModel implements ProfileModelPort {
  async findByUserId(client: SupabaseClient, userId: string): Promise<ProfileQueryResult> {
    return await client.from('profiles').select(profileColumns).eq('id', userId).single();
  }

  async updateByUserId(
    client: SupabaseClient,
    userId: string,
    values: Record<string, unknown>,
  ): Promise<ProfileQueryResult> {
    return await client
      .from('profiles')
      .update(values)
      .eq('id', userId)
      .select(profileColumns)
      .single();
  }
}
