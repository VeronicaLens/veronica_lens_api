import type { RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { EventsModelPort } from '../src/modules/events/events.model.js';

const authenticate: RequestHandler = (req, _res, next) => {
  req.auth = { accessToken: 'token', userId: 'user-id', role: 'user', supabase: {} as never };
  next();
};

describe('events routes', () => {
  it('returns filtered events with cache metadata', async () => {
    const findUpcoming = vi.fn<EventsModelPort['findUpcoming']>().mockResolvedValue({
      events: [
        {
          id: 'moon:rise:2026-10-04T04:25:00.000Z',
          type: 'rise',
          objectIds: ['moon'],
          startsAt: '2026-10-04T04:25:00.000Z',
          title: 'Nascer de Lua',
          description: 'A Lua surge acima do horizonte.',
        },
      ],
      source: 'cache',
      stale: true,
      updatedAt: '2026-10-04T01:00:00.000Z',
    });
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        eventsModel: { findUpcoming },
      }),
    ).get(
      '/api/v1/events?from=2026-10-04T00%3A00%3A00.000Z&to=2026-10-11T00%3A00%3A00.000Z&type=rise&latitudeDegrees=-23.55&longitudeDegrees=-46.63&elevationMeters=760',
    );

    expect(response.status).toBe(200);
    const responseBody = response.body as { meta: Record<string, unknown> };
    expect(responseBody.meta).toEqual({
      count: 1,
      source: 'cache',
      stale: true,
      updatedAt: '2026-10-04T01:00:00.000Z',
    });
    const receivedQuery = findUpcoming.mock.calls[0]?.[0];
    expect(receivedQuery?.type).toBe('rise');
    expect(receivedQuery?.observer.elevationMeters).toBe(760);
  });

  it('validates periods and requires authentication', async () => {
    const invalid = await request(
      createApp({ enableLogger: false, authenticateHandler: authenticate }),
    ).get(
      '/api/v1/events?from=2026-10-11T00%3A00%3A00.000Z&to=2026-10-04T00%3A00%3A00.000Z&latitudeDegrees=0&longitudeDegrees=0',
    );
    const unauthenticated = await request(createApp({ enableLogger: false })).get(
      '/api/v1/events?from=2026-10-04T00%3A00%3A00.000Z&to=2026-10-11T00%3A00%3A00.000Z&latitudeDegrees=0&longitudeDegrees=0',
    );
    expect(invalid.status).toBe(400);
    expect(unauthenticated.status).toBe(401);
  });

  it('returns a typed unavailable response when no cache exists', async () => {
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        eventsModel: { findUpcoming: vi.fn().mockRejectedValue(new Error('offline')) },
      }),
    ).get(
      '/api/v1/events?from=2026-10-04T00%3A00%3A00.000Z&to=2026-10-11T00%3A00%3A00.000Z&latitudeDegrees=0&longitudeDegrees=0',
    );

    expect(response.status).toBe(503);
    const responseBody = response.body as { error?: { code?: string } };
    expect(responseBody).toMatchObject({ error: { code: 'ASTRONOMY_EVENTS_UNAVAILABLE' } });
  });
});
