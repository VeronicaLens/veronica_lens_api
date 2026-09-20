import type { SupabaseClient } from '@supabase/supabase-js';

import { AppError } from '../../shared/errors/app-error.js';
import type { ObservationPhotoMetadata } from './observations.schemas.js';

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
  }>;
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
  }> | null;
}

export interface ObservationsModelPort {
  list(client: SupabaseClient, userId: string): Promise<ObservationHistoryItem[]>;
  savePhoto(
    client: SupabaseClient,
    input: SaveObservationPhotoInput,
  ): Promise<ObservationPhotoResult>;
}

export class SupabaseObservationsModel implements ObservationsModelPort {
  async list(client: SupabaseClient, userId: string): Promise<ObservationHistoryItem[]> {
    const { data, error } = await client
      .from('observations')
      .select(
        'id, title, notes, celestial_object_name, observed_at, latitude, longitude, observation_media(id, storage_path, captured_at)',
      )
      .eq('user_id', userId)
      .order('observed_at', { ascending: false });
    if (error) throw providerError('Observation history could not be loaded');
    const observations = (data ?? []) as unknown as ObservationHistoryRow[];

    return observations.map((observation) => ({
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
      })),
    }));
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
