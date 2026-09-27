import type { SupabaseClient } from '@supabase/supabase-js';

import { AppError } from '../../shared/errors/app-error.js';
import type { ProfileModelPort, ProfileRow } from './profile.model.js';
import type { UpdateProfileInput } from './profile.schemas.js';

function toProfile(row: ProfileRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    locationName: row.location_name,
    latitude: row.latitude,
    longitude: row.longitude,
    notificationsEnabled: row.notifications_enabled,
    measurementUnit: row.measurement_unit,
    language: row.language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDatabaseValues(input: UpdateProfileInput): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (input.displayName !== undefined) values.display_name = input.displayName;
  if (input.avatarUrl !== undefined) values.avatar_url = input.avatarUrl;
  if (input.locationName !== undefined) values.location_name = input.locationName;
  if (input.latitude !== undefined) values.latitude = input.latitude;
  if (input.longitude !== undefined) values.longitude = input.longitude;
  if (input.notificationsEnabled !== undefined)
    values.notifications_enabled = input.notificationsEnabled;
  if (input.measurementUnit !== undefined) values.measurement_unit = input.measurementUnit;
  if (input.language !== undefined) values.language = input.language;
  return values;
}

function requireProfile(result: Awaited<ReturnType<ProfileModelPort['findByUserId']>>) {
  if (result.error?.code === 'PGRST116') {
    throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile was not found');
  }
  if (result.error)
    throw new AppError(502, 'PROFILE_PROVIDER_ERROR', 'Profile could not be loaded');
  if (!result.data) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile was not found');
  return toProfile(result.data);
}

export class ProfileService {
  constructor(private readonly model: ProfileModelPort) {}

  async get(client: SupabaseClient, userId: string) {
    return requireProfile(await this.model.findByUserId(client, userId));
  }

  async update(client: SupabaseClient, userId: string, input: UpdateProfileInput) {
    return requireProfile(await this.model.updateByUserId(client, userId, toDatabaseValues(input)));
  }

  async uploadAvatar(
    client: SupabaseClient,
    userId: string,
    contentType: string,
    bytes: Buffer,
  ) {
    const avatarUrl = await this.model.uploadAvatar(client, { userId, contentType, bytes });
    return requireProfile(
      await this.model.updateByUserId(client, userId, { avatar_url: avatarUrl }),
    );
  }
}
