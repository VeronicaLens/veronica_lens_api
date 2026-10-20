import type { SupabaseClient } from '@supabase/supabase-js';

import { getEnv } from '../../config/env.js';
import { createAdminClient } from '../../config/supabase.js';
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
  /** Removes the user's stored files and then the account; related rows cascade from auth.users. */
  deleteAccount(userId: string): Promise<void>;
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

  async deleteAccount(userId: string): Promise<void> {
    const admin = createAdminClient(getEnv());

    const mediaPaths: string[] = [];
    for (let from = 0; ; from += DELETE_PAGE_SIZE) {
      const { data, error } = await admin
        .from('observation_media')
        .select('storage_path')
        .eq('user_id', userId)
        .order('id')
        .range(from, from + DELETE_PAGE_SIZE - 1);
      if (error) throw accountDeletionError();
      const rows = (data ?? []) as unknown as { storage_path: string }[];
      mediaPaths.push(...rows.map((row) => row.storage_path));
      if (rows.length < DELETE_PAGE_SIZE) break;
    }
    await removeStoredFiles(admin, 'observations', mediaPaths);

    const { data: avatarFiles, error: avatarListError } = await admin.storage
      .from('avatars')
      .list(userId, { limit: DELETE_PAGE_SIZE });
    if (avatarListError) throw accountDeletionError();
    await removeStoredFiles(
      admin,
      'avatars',
      (avatarFiles ?? []).map((file) => `${userId}/${file.name}`),
    );

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && error.code !== 'user_not_found') throw accountDeletionError();
  }
}

const DELETE_PAGE_SIZE = 100;

function accountDeletionError(): AppError {
  return new AppError(503, 'ACCOUNT_DELETION_UNAVAILABLE', 'Account could not be deleted');
}

async function removeStoredFiles(
  client: SupabaseClient,
  bucket: string,
  paths: readonly string[],
): Promise<void> {
  for (let index = 0; index < paths.length; index += DELETE_PAGE_SIZE) {
    const { error } = await client.storage
      .from(bucket)
      .remove(paths.slice(index, index + DELETE_PAGE_SIZE));
    if (error) throw accountDeletionError();
  }
}

function extension(contentType: string): string {
  return (
    ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[
      contentType
    ] ?? 'jpg'
  );
}
