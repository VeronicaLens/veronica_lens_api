import type { RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { ObservationsModelPort } from '../src/modules/observations/index.js';

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
    const list = vi.fn<ObservationsModelPort['list']>().mockResolvedValue([
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
          },
        ],
      },
    ]);
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        observationsModel: { list, savePhoto: vi.fn() },
      }),
    ).get('/api/v1/observations');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: [expect.objectContaining({ id: '71000000-0000-4000-8000-000000000001' })],
    });
    expect(list).toHaveBeenCalledWith(expect.anything(), 'user-id');
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
        observationsModel: { list: vi.fn(), savePhoto },
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

  it('rejects missing metadata and empty photos', async () => {
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        observationsModel: { list: vi.fn(), savePhoto: vi.fn() },
      }),
    )
      .put(
        '/api/v1/observations/71000000-0000-4000-8000-000000000001/photos/71000000-0000-4000-8000-000000000002',
      )
      .set('content-type', 'image/jpeg')
      .send(Buffer.alloc(0));
    expect(response.status).toBe(400);
  });
});
