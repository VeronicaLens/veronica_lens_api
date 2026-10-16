import type { SupabaseClient } from '@supabase/supabase-js';

import { AppError } from '../../shared/errors/app-error.js';
import type { ObservationPhotoMetadata } from './observations.schemas.js';

// Long enough for a gallery browsing session; the history request issues fresh URLs.
const SIGNED_PHOTO_URL_TTL_SECONDS = 60 * 60;

export interface SaveObservationPhotoInput {
  observationId: string;
  photoId: string;
  userId: string;
  contentType: string;
  bytes: Buffer;
  metadata: ObservationPhotoMetadata;
}

export interface ObservationPhotoResult {
  observationId: string;
  photoId: string;
  storagePath: string;
  capturedAt: string;
}

export interface ObservationCaptureSummary {
  deviceName: string | null;
  iso: number | null;
  exposureTimeSeconds: number | null;
  exposureCompensationEv: number | null;
  focusMode: string | null;
  focusLensPosition: number | null;
  whiteBalanceKelvin: number | null;
}

export interface ObservationHistoryItem {
  id: string;
  title: string;
  notes: string;
  celestialObjectName: string | null;
  observedAt: string;
  latitude: number | null;
  longitude: number | null;
  photos: Array<{
    id: string;
    storagePath: string;
    capturedAt: string | null;
    thumbnailUrl: string | null;
    capture: ObservationCaptureSummary | null;
  }>;
}

export interface ObservationHistoryPage {
  data: ObservationHistoryItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ListObservationHistoryInput {
  userId: string;
  page: number;
  pageSize: number;
}

interface ObservationHistoryRow {
  id: string;
  title: string;
  notes: string;
  celestial_object_name: string | null;
  observed_at: string;
  latitude: number | string | null;
  longitude: number | string | null;
  observation_media: Array<{
    id: string;
    storage_path: string;
    captured_at: string | null;
    capture_metadata?: unknown;
  }> | null;
}

export interface DeleteObservationPhotoInput {
  observationId: string;
  photoId: string;
  userId: string;
}

export interface DeleteObservationInput {
  observationId: string;
  userId: string;
}

export interface DeleteObservationPhotoResult {
  observationDeleted: boolean;
}

export interface ObservationsModelPort {
  list(client: SupabaseClient, input: ListObservationHistoryInput): Promise<ObservationHistoryPage>;
  savePhoto(
    client: SupabaseClient,
    input: SaveObservationPhotoInput,
  ): Promise<ObservationPhotoResult>;
  deletePhoto(
    client: SupabaseClient,
    input: DeleteObservationPhotoInput,
  ): Promise<DeleteObservationPhotoResult>;
  deleteObservation(client: SupabaseClient, input: DeleteObservationInput): Promise<void>;
}

export class SupabaseObservationsModel implements ObservationsModelPort {
  /**
   * Removes the stored file before the database row, so a failed attempt can be retried and
   * never leaves an orphaned file. An observation left without media is removed as well.
   */
  async deletePhoto(
    client: SupabaseClient,
    input: DeleteObservationPhotoInput,
  ): Promise<DeleteObservationPhotoResult> {
    const { data: media, error } = await client
      .from('observation_media')
      .select('id, storage_path')
      .eq('id', input.photoId)
      .eq('observation_id', input.observationId)
      .eq('user_id', input.userId)
      .maybeSingle();
    if (error) throw providerError('Astrophoto could not be deleted');
    if (!media) throw notFound('Astrophoto was not found');

    const { error: storageError } = await client.storage
      .from('observations')
      .remove([(media as { storage_path: string }).storage_path]);
    if (storageError) throw providerError('Astrophoto could not be deleted');

    const { error: mediaError } = await client
      .from('observation_media')
      .delete()
      .eq('id', input.photoId)
      .eq('user_id', input.userId);
    if (mediaError) throw providerError('Astrophoto could not be deleted');

    const { count, error: countError } = await client
      .from('observation_media')
      .select('id', { count: 'exact', head: true })
      .eq('observation_id', input.observationId)
      .eq('user_id', input.userId);
    if (countError || (count ?? 0) > 0) return { observationDeleted: false };

    const { error: observationError } = await client
      .from('observations')
      .delete()
      .eq('id', input.observationId)
      .eq('user_id', input.userId);
    return { observationDeleted: !observationError };
  }

  async deleteObservation(client: SupabaseClient, input: DeleteObservationInput): Promise<void> {
    const { data: observation, error } = await client
      .from('observations')
      .select('id, observation_media(storage_path)')
      .eq('id', input.observationId)
      .eq('user_id', input.userId)
      .maybeSingle();
    if (error) throw providerError('Observation could not be deleted');
    if (!observation) throw notFound('Observation was not found');

    const paths = (
      (observation as { observation_media: Array<{ storage_path: string }> | null })
        .observation_media ?? []
    ).map((media) => media.storage_path);
    if (paths.length > 0) {
      const { error: storageError } = await client.storage.from('observations').remove(paths);
      if (storageError) throw providerError('Observation could not be deleted');
    }

    const { error: deleteError } = await client
      .from('observations')
      .delete()
      .eq('id', input.observationId)
      .eq('user_id', input.userId);
    if (deleteError) throw providerError('Observation could not be deleted');
  }
  async list(
    client: SupabaseClient,
    input: ListObservationHistoryInput,
  ): Promise<ObservationHistoryPage> {
    const start = (input.page - 1) * input.pageSize;
    const { data, error } = await client
      .from('observations')
      .select(
        'id, title, notes, celestial_object_name, observed_at, latitude, longitude, observation_media(id, storage_path, captured_at, capture_metadata)',
      )
      .eq('user_id', input.userId)
      .order('observed_at', { ascending: false })
      .range(start, start + input.pageSize);
    if (error) throw providerError('Observation history could not be loaded');
    const observations = (data ?? []) as unknown as ObservationHistoryRow[];
    const items = observations.slice(0, input.pageSize);
    const storagePaths = items.flatMap((observation) =>
      (observation.observation_media ?? []).map((photo) => photo.storage_path),
    );
    const thumbnailUrlByPath = new Map<string, string>();
    if (storagePaths.length > 0) {
      const { data: signedPhotos, error: signError } = await client.storage
        .from('observations')
        .createSignedUrls(storagePaths, SIGNED_PHOTO_URL_TTL_SECONDS);
      if (signError) throw providerError('Observation photos could not be accessed');
      for (const photo of signedPhotos ?? []) {
        if (photo.path && photo.signedUrl) thumbnailUrlByPath.set(photo.path, photo.signedUrl);
      }
    }

    return {
      data: items.map((observation) => ({
        id: observation.id,
        title: observation.title,
        notes: observation.notes,
        celestialObjectName: observation.celestial_object_name,
        observedAt: observation.observed_at,
        latitude: observation.latitude === null ? null : Number(observation.latitude),
        longitude: observation.longitude === null ? null : Number(observation.longitude),
        photos: (observation.observation_media ?? []).map((photo) => ({
          id: photo.id,
          storagePath: photo.storage_path,
          capturedAt: photo.captured_at,
          thumbnailUrl: thumbnailUrlByPath.get(photo.storage_path) ?? null,
          capture: summarizeCaptureMetadata(photo.capture_metadata),
        })),
      })),
      page: input.page,
      pageSize: input.pageSize,
      hasMore: observations.length > input.pageSize,
    };
  }

  async savePhoto(
    client: SupabaseClient,
    input: SaveObservationPhotoInput,
  ): Promise<ObservationPhotoResult> {
    const path = `${input.userId}/${input.observationId}/${input.photoId}.${extension(input.contentType)}`;
    const observation = {
      id: input.observationId,
      user_id: input.userId,
      astronomical_event_id: input.metadata.astronomicalEventId ?? null,
      title: input.metadata.title,
      notes: input.metadata.notes,
      celestial_object_name: input.metadata.celestialObjectName ?? null,
      observed_at: input.metadata.capturedAt,
      latitude: input.metadata.latitude ?? null,
      longitude: input.metadata.longitude ?? null,
    };
    const { error: observationError } = await client
      .from('observations')
      .upsert(observation, { onConflict: 'id' });
    if (observationError) throw providerError('Observation metadata could not be saved');

    const { error: uploadError } = await client.storage
      .from('observations')
      .upload(path, input.bytes, {
        contentType: input.contentType,
        upsert: true,
      });
    if (uploadError) throw providerError('Astrophoto could not be uploaded');

    const { error: mediaError } = await client.from('observation_media').upsert(
      {
        id: input.photoId,
        observation_id: input.observationId,
        user_id: input.userId,
        storage_path: path,
        media_type: 'image',
        captured_at: input.metadata.capturedAt,
        capture_metadata: {
          device: input.metadata.device,
          parameters: input.metadata.parameters,
        },
      },
      { onConflict: 'id' },
    );
    if (mediaError) {
      await client.storage.from('observations').remove([path]);
      throw providerError('Astrophoto metadata could not be saved');
    }

    return {
      observationId: input.observationId,
      photoId: input.photoId,
      storagePath: path,
      capturedAt: input.metadata.capturedAt,
    };
  }
}

/**
 * Converts the stored capture metadata JSON into a stable summary. Automatic values and
 * unknown or malformed fields become null, so older records remain readable.
 */
export function summarizeCaptureMetadata(metadata: unknown): ObservationCaptureSummary | null {
  if (!isRecord(metadata)) return null;
  const device = isRecord(metadata.device) ? metadata.device : {};
  const parameters = isRecord(metadata.parameters) ? metadata.parameters : {};
  const summary: ObservationCaptureSummary = {
    deviceName: typeof device.name === 'string' && device.name ? device.name : null,
    iso: finiteNumber(parameters.iso),
    exposureTimeSeconds: finiteNumber(parameters.exposureTimeSeconds),
    exposureCompensationEv: finiteNumber(parameters.exposureCompensationEv),
    focusMode: typeof parameters.focusMode === 'string' ? parameters.focusMode : null,
    focusLensPosition: finiteNumber(parameters.focusLensPosition),
    whiteBalanceKelvin: finiteNumber(parameters.whiteBalanceKelvin),
  };
  return Object.values(summary).every((value) => value === null) ? null : summary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function extension(contentType: string): string {
  return (
    (
      {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/heic': 'heic',
        'image/heif': 'heif',
      } as Record<string, string>
    )[contentType] ?? 'jpg'
  );
}

function providerError(message: string): AppError {
  return new AppError(503, 'OBSERVATION_STORAGE_UNAVAILABLE', message);
}

function notFound(message: string): AppError {
  return new AppError(404, 'OBSERVATION_NOT_FOUND', message);
}
