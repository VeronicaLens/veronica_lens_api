import { describe, expect, it, vi } from 'vitest';

import { LocalCatalogModel } from '../src/modules/catalog/catalog.model.js';
import { CachedAstronomyEventsModel } from '../src/modules/events/events.model.js';

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
});
