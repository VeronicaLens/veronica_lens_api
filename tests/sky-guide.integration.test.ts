import type { RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { SkyGuideModelPort } from '../src/modules/sky-guide/sky-guide.model.js';

const authenticate: RequestHandler = (req, _res, next) => {
  req.auth = {
    accessToken: 'access-token',
    userId: '40000000-0000-4000-8000-000000000001',
    role: 'user',
    supabase: {} as SupabaseClient,
  };
  next();
};

const body = {
  objectIds: ['jupiter'],
  observedAt: '2026-09-06T00:00:00.000Z',
  observer: {
    latitudeDegrees: -23.5505,
    longitudeDegrees: -46.6333,
    elevationMeters: 760,
  },
};

describe('sky guide routes', () => {
  it('returns authenticated horizontal positions and availability metadata', async () => {
    const getPositions = vi.fn<SkyGuideModelPort['getPositions']>().mockResolvedValue({
      positions: [
        {
          id: 'jupiter',
          name: 'Júpiter',
          type: 'planet',
          magnitude: -2.1,
          observedAt: body.observedAt,
          horizontal: { altitudeDegrees: 42, azimuthDegrees: 315 },
        },
      ],
      unavailableObjectIds: ['moon'],
    });

    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        skyGuideModel: { getPositions },
      }),
    )
      .post('/api/v1/sky-guide/positions')
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [
        {
          id: 'jupiter',
          name: 'Júpiter',
          type: 'planet',
          magnitude: -2.1,
          observedAt: body.observedAt,
          horizontal: { altitudeDegrees: 42, azimuthDegrees: 315 },
        },
      ],
      meta: { count: 1, unavailableObjectIds: ['moon'] },
    });
    expect(getPositions).toHaveBeenCalledWith({
      objectIds: ['jupiter'],
      observedAt: new Date(body.observedAt),
      observer: body.observer,
    });
  });

  it('validates coordinates and requires authentication', async () => {
    const invalid = await request(
      createApp({ enableLogger: false, authenticateHandler: authenticate }),
    )
      .post('/api/v1/sky-guide/positions')
      .send({ ...body, observer: { ...body.observer, latitudeDegrees: 91 } });
    const unauthenticated = await request(createApp({ enableLogger: false }))
      .post('/api/v1/sky-guide/positions')
      .send(body);

    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(unauthenticated.status).toBe(401);
  });
});
