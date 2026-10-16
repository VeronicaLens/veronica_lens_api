import type { RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

const authenticate: RequestHandler = (req, _res, next) => {
  req.auth = {
    accessToken: 'access-token',
    userId: '40000000-0000-4000-8000-000000000001',
    role: 'user',
    supabase: {} as SupabaseClient,
  };
  next();
};

describe('catalog routes', () => {
  it('lists the local minimum catalog without an external provider', async () => {
    const response = await request(
      createApp({ enableLogger: false, authenticateHandler: authenticate }),
    ).get('/api/v1/catalog/celestial-objects?limit=50');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ meta: { count: 24 } });
    expect(response.text).toContain('"id":"moon","name":"Lua","type":"moon"');
    expect(response.text).toContain('"id":"jupiter","name":"Júpiter","type":"planet"');
    expect(response.text).toContain('"id":"sirius","name":"Sirius","type":"star"');
    expect(response.text).toContain('"id":"crux","name":"Cruzeiro do Sul"');
  });

  it.each([
    ['jupiter', 'jupiter'],
    ['JÚPITER', 'jupiter'],
    ['cruz do sul', 'crux'],
    ['alpha cen', 'alpha-centauri'],
  ])('searches %s by normalized name or alias', async (term, expectedId) => {
    const response = await request(
      createApp({ enableLogger: false, authenticateHandler: authenticate }),
    ).get(`/api/v1/catalog/celestial-objects?q=${encodeURIComponent(term)}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: [expect.objectContaining({ id: expectedId })] });
  });

  it('filters by type and exposes the coordinate strategy', async () => {
    const response = await request(
      createApp({ enableLogger: false, authenticateHandler: authenticate }),
    ).get('/api/v1/catalog/celestial-objects?type=planet&limit=2');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      meta: { count: 2 },
      data: [
        {
          type: 'planet',
          coordinates: { kind: 'ephemeris', provider: 'jpl-horizons' },
        },
        {
          type: 'planet',
          coordinates: { kind: 'ephemeris', provider: 'jpl-horizons' },
        },
      ],
    });
  });

  it('rejects unsupported filters', async () => {
    const response = await request(
      createApp({ enableLogger: false, authenticateHandler: authenticate }),
    ).get('/api/v1/catalog/celestial-objects?type=galaxy&limit=100');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('requires authentication', async () => {
    const response = await request(createApp({ enableLogger: false })).get(
      '/api/v1/catalog/celestial-objects',
    );

    expect(response.status).toBe(401);
  });
});
