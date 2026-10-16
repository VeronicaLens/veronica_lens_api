import type { SupabaseClient } from '@supabase/supabase-js';

import { AppError } from '../../shared/errors/app-error.js';

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

export interface UploadAvatarInput {
  userId: string;
  contentType: string;
  bytes: Buffer;
}

export interface ProfileModelPort {
  findByUserId(client: SupabaseClient, userId: string): Promise<ProfileQueryResult>;
  updateByUserId(
    client: SupabaseClient,
    userId: string,
    values: Record<string, unknown>,
  ): Promise<ProfileQueryResult>;
  uploadAvatar(client: SupabaseClient, input: UploadAvatarInput): Promise<string>;
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

  async uploadAvatar(client: SupabaseClient, input: UploadAvatarInput): Promise<string> {
    const path = `${input.userId}/avatar.${extension(input.contentType)}`;
    const { error } = await client.storage.from('avatars').upload(path, input.bytes, {
      contentType: input.contentType,
      upsert: true,
    });
    if (error) throw new AppError(503, 'AVATAR_STORAGE_UNAVAILABLE', 'Avatar could not be uploaded');

    const { data } = client.storage.from('avatars').getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  }
}

function extension(contentType: string): string {
  return (
    ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[
      contentType
    ] ?? 'jpg'
  );
}
