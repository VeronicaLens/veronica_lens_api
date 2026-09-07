import { describe, expect, it, vi } from 'vitest';

import { LocalCatalogModel } from '../src/modules/catalog/catalog.model.js';
import { CachedAstronomyEventsModel } from '../src/modules/events/events.model.js';
import type { EventsPersistencePort } from '../src/modules/events/events.persistence.js';

const query = {
  from: new Date('2026-10-04T00:00:00.000Z'),
  to: new Date('2026-10-11T00:00:00.000Z'),
  observer: { latitudeDegrees: -23.55, longitudeDegrees: -46.63, elevationMeters: 760 },
};

describe('CachedAstronomyEventsModel', () => {
  it('normalizes provider identifiers and filters event types', async () => {
    const getEvents = vi.fn().mockResolvedValue([
      {
        id: '301:rise:2026-10-04T04:25:00.000Z',
        type: 'rise',
        objectIds: ['301'],
        startsAt: '2026-10-04T04:25:00.000Z',
        title: '301 rise',
        description: 'provider description',
      },
    ]);
    const model = new CachedAstronomyEventsModel(new LocalCatalogModel(), { getEvents });

    const result = await model.findUpcoming({ ...query, type: 'rise' });

    expect(result.events[0]).toMatchObject({
      id: 'moon:rise:2026-10-04T04:25:00.000Z',
      objectIds: ['moon'],
      title: 'Nascer da Lua',
      description: 'A Lua surge acima do horizonte.',
    });
    expect(result).toMatchObject({ source: 'provider', stale: false });
  });

  it('serves stale cache when the provider later fails', async () => {
    let instant = new Date('2026-10-04T01:00:00.000Z');
    const getEvents = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: '599:set:2026-10-04T20:00:00.000Z',
          type: 'set',
          objectIds: ['599'],
          startsAt: '2026-10-04T20:00:00.000Z',
          title: '599 set',
          description: 'provider description',
        },
      ])
      .mockRejectedValueOnce(new Error('offline'));
    const model = new CachedAstronomyEventsModel(
      new LocalCatalogModel(),
      { getEvents },
      undefined,
      () => instant,
      1_000,
      86_400_000,
    );
    await model.findUpcoming(query);
    instant = new Date('2026-10-04T01:00:02.000Z');

    const fallback = await model.findUpcoming(query);

    expect(fallback).toMatchObject({ source: 'cache', stale: true });
    expect(fallback.events[0]?.title).toBe('Ocaso de Júpiter');
  });

  it('persists a successful forced synchronization under a tracked run', async () => {
    const persistence = persistenceMock();
    const getEvents = vi.fn().mockResolvedValue([
      {
        id: '301:rise:2026-10-04T04:25:00.000Z',
        type: 'rise',
        objectIds: ['301'],
        startsAt: '2026-10-04T04:25:00.000Z',
        title: 'provider title',
        description: 'provider description',
      },
    ]);
    const model = new CachedAstronomyEventsModel(
      new LocalCatalogModel(),
      { getEvents },
      persistence,
      () => new Date('2026-10-04T01:00:00.000Z'),
    );

    const result = await model.synchronize(query, true);

    expect(persistence.beginSync).toHaveBeenCalledWith(query);
    expect(persistence.completeSync).toHaveBeenCalledWith(
      'run-id',
      query,
      result.events,
      '2026-10-04T01:00:00.000Z',
    );
    expect(persistence.failSync).not.toHaveBeenCalled();
  });

  it('uses a persisted last valid result after provider failure', async () => {
    const persistence = persistenceMock();
    vi.mocked(persistence.findCached).mockResolvedValue({
      events: [
        {
          id: 'cached-event',
          type: 'set',
          objectIds: ['jupiter'],
          startsAt: '2026-10-04T20:00:00.000Z',
          title: 'Ocaso de Júpiter',
          description: 'O Júpiter desce abaixo do horizonte.',
        },
      ],
      source: 'cache',
      stale: false,
      updatedAt: '2026-10-04T00:30:00.000Z',
    });
    const model = new CachedAstronomyEventsModel(
      new LocalCatalogModel(),
      { getEvents: vi.fn().mockRejectedValue(new Error('offline')) },
      persistence,
      () => new Date('2026-10-04T01:00:00.000Z'),
      1_000,
      86_400_000,
    );

    const result = await model.findUpcoming(query);

    expect(result).toMatchObject({ source: 'cache', stale: true });
    expect(result.events[0]?.id).toBe('cached-event');
  });
});

function persistenceMock(): EventsPersistencePort {
  return {
    beginSync: vi.fn().mockResolvedValue('run-id'),
    completeSync: vi.fn().mockResolvedValue(undefined),
    failSync: vi.fn().mockResolvedValue(undefined),
    findCached: vi.fn().mockResolvedValue(null),
  };
}
