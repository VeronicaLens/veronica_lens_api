import type { RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { ObservationRecommendationPort } from '../src/modules/planning/index.js';

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
  objectId: 'sirius',
  windowFrom: '2026-10-12T22:00:00.000Z',
  windowTo: '2026-10-13T02:00:00.000Z',
  observer: {
    latitudeDegrees: -23.5505,
    longitudeDegrees: -46.6333,
    elevationMeters: 760,
  },
  minimumAltitudeDegrees: 30,
};

describe('observation recommendation route', () => {
  it('returns an authenticated recommendation and its supporting factors', async () => {
    const recommend = vi.fn<ObservationRecommendationPort['recommend']>().mockResolvedValue({
      objectId: 'sirius',
      objectName: 'Sirius',
      status: 'recommended',
      recommendedWindow: {
        from: '2026-10-13T00:00:00.000Z',
        to: '2026-10-13T02:00:00.000Z',
        consideredAt: '2026-10-13T00:00:00.000Z',
      },
      factors: [{ code: 'altitude', status: 'favorable', summary: 'Altitude 55°.' }],
      summary: 'Janela favorável encontrada.',
      meta: { evaluatedSamples: 3, sampleIntervalMinutes: 120, weatherAvailable: true },
    });

    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        observationRecommendationService: { recommend },
      }),
    )
      .post('/api/v1/planning/observation-window')
      .send(body);

    const responseBody = response.body as {
      data: { status: string; recommendedWindow: unknown };
    };
    expect(response.status).toBe(200);
    expect(responseBody.data.status).toBe('recommended');
    expect(responseBody.data.recommendedWindow).not.toBeNull();
    expect(recommend).toHaveBeenCalledWith({
      ...body,
      windowFrom: new Date(body.windowFrom),
      windowTo: new Date(body.windowTo),
    });
  });

  it('validates the window and requires authentication', async () => {
    const invalid = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        observationRecommendationService: { recommend: vi.fn() },
      }),
    )
      .post('/api/v1/planning/observation-window')
      .send({ ...body, windowTo: body.windowFrom });
    const unauthenticated = await request(createApp({ enableLogger: false }))
      .post('/api/v1/planning/observation-window')
      .send(body);

    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(unauthenticated.status).toBe(401);
  });
});
