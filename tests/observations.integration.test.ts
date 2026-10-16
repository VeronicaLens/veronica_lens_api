import type { RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { ObservationsModelPort } from '../src/modules/observations/index.js';
import { AppError } from '../src/shared/errors/app-error.js';

const authenticate: RequestHandler = (req, _res, next) => {
  req.auth = { accessToken: 'token', userId: 'user-id', role: 'user', supabase: {} as never };
  next();
};

const metadata = {
  title: 'Astrofoto da Lua',
  notes: '',
  capturedAt: '2026-10-04T01:00:00.000Z',
  celestialObjectName: 'Lua',
  latitude: -23.55,
  longitude: -46.63,
  device: { id: 'back-wide', name: 'Back camera' },
  parameters: {
    focusMode: 'center-metering',
    exposureMode: 'automatic-metering',
    exposureCompensationEv: 0.7,
    iso: 'automatic',
    exposureTimeSeconds: 'automatic',
    fallbacks: [],
  },
};

describe('observation photo routes', () => {
  it('lists only the authenticated user observation history', async () => {
    const list = vi.fn<ObservationsModelPort['list']>().mockResolvedValue({
      data: [
        {
          id: '71000000-0000-4000-8000-000000000001',
          title: 'Astrofoto da Lua',
          notes: 'Céu limpo',
          celestialObjectName: 'Lua',
          observedAt: metadata.capturedAt,
          latitude: -23.55,
          longitude: -46.63,
          photos: [
            {
              id: '71000000-0000-4000-8000-000000000002',
              storagePath: 'user-id/observation/photo.jpg',
              capturedAt: metadata.capturedAt,
              thumbnailUrl: 'https://storage.example/photo.jpg',
              capture: {
                deviceName: 'Back camera',
                iso: 800,
                exposureTimeSeconds: 0.5,
                exposureCompensationEv: 0,
                focusMode: 'manual',
                focusLensPosition: 1,
                whiteBalanceKelvin: null,
              },
            },
          ],
        },
      ],
      page: 2,
      pageSize: 10,
      hasMore: true,
    });
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        observationsModel: {
          list,
          savePhoto: vi.fn(),
          deletePhoto: vi.fn(),
          deleteObservation: vi.fn(),
        },
      }),
    ).get('/api/v1/observations?page=2&pageSize=10');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: [expect.objectContaining({ id: '71000000-0000-4000-8000-000000000001' })],
      page: 2,
      pageSize: 10,
      hasMore: true,
    });
    expect(list).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-id',
      page: 2,
      pageSize: 10,
    });
  });

  it('passes authenticated binary photos and capture metadata to storage', async () => {
    const savePhoto = vi.fn<ObservationsModelPort['savePhoto']>().mockResolvedValue({
      observationId: '71000000-0000-4000-8000-000000000001',
      photoId: '71000000-0000-4000-8000-000000000002',
      storagePath: 'user-id/observation/photo.jpg',
      capturedAt: metadata.capturedAt,
    });
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        observationsModel: {
          list: vi.fn(),
          savePhoto,
          deletePhoto: vi.fn(),
          deleteObservation: vi.fn(),
        },
      }),
    )
      .put(
        '/api/v1/observations/71000000-0000-4000-8000-000000000001/photos/71000000-0000-4000-8000-000000000002',
      )
      .set('content-type', 'image/jpeg')
      .set('x-veronica-observation', encodeURIComponent(JSON.stringify(metadata)))
      .send(Buffer.from('photo'));

    expect(response.status).toBe(200);
    expect(savePhoto).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'user-id', contentType: 'image/jpeg', metadata }),
    );
  });

  it('accepts manual focus and white balance capture parameters', async () => {
    const savePhoto = vi.fn<ObservationsModelPort['savePhoto']>().mockResolvedValue({
      observationId: '71000000-0000-4000-8000-000000000001',
      photoId: '71000000-0000-4000-8000-000000000002',
      storagePath: 'user-id/observation/photo.jpg',
      capturedAt: metadata.capturedAt,
    });
    const manualMetadata = {
      ...metadata,
      parameters: {
        ...metadata.parameters,
        focusMode: 'manual',
        exposureMode: 'manual',
        iso: 800,
        exposureTimeSeconds: 0.5,
        focusLensPosition: 1,
        whiteBalanceKelvin: 4_000,
        fallbacks: ['white-balance'],
      },
    };

    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        observationsModel: {
          list: vi.fn(),
          savePhoto,
          deletePhoto: vi.fn(),
          deleteObservation: vi.fn(),
        },
      }),
    )
      .put(
        '/api/v1/observations/71000000-0000-4000-8000-000000000001/photos/71000000-0000-4000-8000-000000000002',
      )
      .set('content-type', 'image/jpeg')
      .set('x-veronica-observation', encodeURIComponent(JSON.stringify(manualMetadata)))
      .send(Buffer.from('photo'));

    expect(response.status).toBe(200);
    expect(savePhoto).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ metadata: manualMetadata }),
    );
  });

  it('rejects missing metadata and empty photos', async () => {
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        observationsModel: {
          list: vi.fn(),
          savePhoto: vi.fn(),
          deletePhoto: vi.fn(),
          deleteObservation: vi.fn(),
        },
      }),
    )
      .put(
        '/api/v1/observations/71000000-0000-4000-8000-000000000001/photos/71000000-0000-4000-8000-000000000002',
      )
      .set('content-type', 'image/jpeg')
      .send(Buffer.alloc(0));
    expect(response.status).toBe(400);
  });

  it('deletes an authenticated user photo and reports when the observation was removed', async () => {
    const deletePhoto = vi
      .fn<ObservationsModelPort['deletePhoto']>()
      .mockResolvedValue({ observationDeleted: true });
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        observationsModel: {
          list: vi.fn(),
          savePhoto: vi.fn(),
          deletePhoto,
          deleteObservation: vi.fn(),
        },
      }),
    ).delete(
      '/api/v1/observations/71000000-0000-4000-8000-000000000001/photos/71000000-0000-4000-8000-000000000002',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { observationDeleted: true } });
    expect(deletePhoto).toHaveBeenCalledWith(expect.anything(), {
      observationId: '71000000-0000-4000-8000-000000000001',
      photoId: '71000000-0000-4000-8000-000000000002',
      userId: 'user-id',
    });
  });

  it('deletes an authenticated user observation', async () => {
    const deleteObservation = vi
      .fn<ObservationsModelPort['deleteObservation']>()
      .mockResolvedValue(undefined);
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        observationsModel: {
          list: vi.fn(),
          savePhoto: vi.fn(),
          deletePhoto: vi.fn(),
          deleteObservation,
        },
      }),
    ).delete('/api/v1/observations/71000000-0000-4000-8000-000000000001');

    expect(response.status).toBe(204);
    expect(deleteObservation).toHaveBeenCalledWith(expect.anything(), {
      observationId: '71000000-0000-4000-8000-000000000001',
      userId: 'user-id',
    });
  });

  it('rejects invalid identifiers and propagates missing photos', async () => {
    const deletePhoto = vi
      .fn<ObservationsModelPort['deletePhoto']>()
      .mockRejectedValue(new AppError(404, 'OBSERVATION_NOT_FOUND', 'Astrophoto was not found'));
    const app = createApp({
      enableLogger: false,
      authenticateHandler: authenticate,
      observationsModel: {
        list: vi.fn(),
        savePhoto: vi.fn(),
        deletePhoto,
        deleteObservation: vi.fn(),
      },
    });

    const invalid = await request(app).delete('/api/v1/observations/not-a-uuid/photos/also-not');
    const missing = await request(app).delete(
      '/api/v1/observations/71000000-0000-4000-8000-000000000001/photos/71000000-0000-4000-8000-000000000009',
    );

    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ error: { code: 'OBSERVATION_NOT_FOUND' } });
  });
});
