import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  SupabaseObservationsModel,
  summarizeCaptureMetadata,
} from '../src/modules/observations/index.js';

interface FakeOptions {
  media?: { id: string; storage_path: string } | null;
  observation?: { id: string; observation_media: Array<{ storage_path: string }> } | null;
  remainingPhotos?: number;
  storageFails?: boolean;
}

function fakeClient(options: FakeOptions) {
  const calls: string[] = [];
  const from = (table: string) => {
    let operation = 'select';
    let headCount = false;
    const chain = {
      select(_columns: string, config?: { head?: boolean }) {
        headCount = config?.head === true;
        return chain;
      },
      delete() {
        operation = 'delete';
        return chain;
      },
      eq() {
        return chain;
      },
      maybeSingle: () =>
        Promise.resolve({
          data:
            table === 'observation_media' ? (options.media ?? null) : (options.observation ?? null),
          error: null,
        }),
      then(resolve: (value: unknown) => unknown) {
        calls.push(`${operation}:${table}${headCount ? ':count' : ''}`);
        return Promise.resolve(
          headCount ? { count: options.remainingPhotos ?? 0, error: null } : { error: null },
        ).then(resolve);
      },
    };
    return chain;
  };
  const client = {
    from,
    storage: {
      from: () => ({
        remove: (paths: string[]) => {
          calls.push(`remove:${paths.join(',')}`);
          return Promise.resolve({ error: options.storageFails ? new Error('storage') : null });
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const photoInput = { observationId: 'observation-1', photoId: 'photo-1', userId: 'user-1' };

describe('SupabaseObservationsModel deletion', () => {
  it('removes the file before the row and deletes the observation left without photos', async () => {
    const { client, calls } = fakeClient({
      media: { id: 'photo-1', storage_path: 'user-1/observation-1/photo-1.jpg' },
    });

    const result = await new SupabaseObservationsModel().deletePhoto(client, photoInput);

    expect(result).toEqual({ observationDeleted: true });
    expect(calls).toEqual([
      'remove:user-1/observation-1/photo-1.jpg',
      'delete:observation_media',
      'select:observation_media:count',
      'delete:observations',
    ]);
  });

  it('keeps the observation while other photos remain', async () => {
    const { client, calls } = fakeClient({
      media: { id: 'photo-1', storage_path: 'user-1/observation-1/photo-1.jpg' },
      remainingPhotos: 2,
    });

    const result = await new SupabaseObservationsModel().deletePhoto(client, photoInput);

    expect(result).toEqual({ observationDeleted: false });
    expect(calls).not.toContain('delete:observations');
  });

  it('reports missing photos and keeps rows when the file cannot be removed', async () => {
    const model = new SupabaseObservationsModel();
    const missing = fakeClient({ media: null });
    const storageFailure = fakeClient({
      media: { id: 'photo-1', storage_path: 'user-1/observation-1/photo-1.jpg' },
      storageFails: true,
    });

    await expect(model.deletePhoto(missing.client, photoInput)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(model.deletePhoto(storageFailure.client, photoInput)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(storageFailure.calls).not.toContain('delete:observation_media');
  });

  it('deletes every file of an observation before removing it', async () => {
    const { client, calls } = fakeClient({
      observation: {
        id: 'observation-1',
        observation_media: [
          { storage_path: 'user-1/observation-1/a.jpg' },
          { storage_path: 'user-1/observation-1/b.jpg' },
        ],
      },
    });

    await new SupabaseObservationsModel().deleteObservation(client, {
      observationId: 'observation-1',
      userId: 'user-1',
    });

    expect(calls).toEqual([
      'remove:user-1/observation-1/a.jpg,user-1/observation-1/b.jpg',
      'delete:observations',
    ]);
  });
});

describe('summarizeCaptureMetadata', () => {
  it('summarizes manual capture parameters and the device name', () => {
    expect(
      summarizeCaptureMetadata({
        device: { id: 'back', name: 'Back Camera' },
        parameters: {
          focusMode: 'manual',
          exposureMode: 'manual',
          exposureCompensationEv: 0,
          iso: 1600,
          exposureTimeSeconds: 0.25,
          focusLensPosition: 1,
          whiteBalanceKelvin: 4000,
          fallbacks: [],
        },
      }),
    ).toEqual({
      deviceName: 'Back Camera',
      iso: 1600,
      exposureTimeSeconds: 0.25,
      exposureCompensationEv: 0,
      focusMode: 'manual',
      focusLensPosition: 1,
      whiteBalanceKelvin: 4000,
    });
  });

  it('maps automatic and missing values to null', () => {
    expect(
      summarizeCaptureMetadata({
        device: { id: 'back', name: 'Back Camera' },
        parameters: { iso: 'automatic', exposureTimeSeconds: 'automatic', focusMode: 'automatic' },
      }),
    ).toMatchObject({ iso: null, exposureTimeSeconds: null, whiteBalanceKelvin: null });
  });

  it('returns null for empty or malformed metadata', () => {
    expect(summarizeCaptureMetadata({})).toBeNull();
    expect(summarizeCaptureMetadata(null)).toBeNull();
    expect(summarizeCaptureMetadata('invalid')).toBeNull();
  });
});
