import type { SupabaseClient } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

function clientReturning(result: unknown): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve(result),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('GET /api/v1/connectivity/supabase', () => {
  it('returns the controlled technical status', async () => {
    const response = await request(
      createApp({
        enableLogger: false,
        supabaseClientFactory: () =>
          clientReturning({ data: { status: 'available' }, error: null }),
      }),
    ).get('/api/v1/connectivity/supabase');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { provider: 'supabase', status: 'available' } });
  });

  it('returns a safe error without upstream details', async () => {
    const response = await request(
      createApp({
        enableLogger: false,
        supabaseClientFactory: () =>
          clientReturning({ data: null, error: { message: 'sensitive provider detail' } }),
      }),
    ).get('/api/v1/connectivity/supabase');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: 'SUPABASE_UNAVAILABLE',
        message: 'Supabase connectivity is temporarily unavailable',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive provider detail');
  });
});
