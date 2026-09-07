import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { SupabaseEventsPersistence } from '../src/modules/events/events.persistence.js';

describe('SupabaseEventsPersistence', () => {
  it('bulk upserts events by a deterministic provider key and completes the run', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn((table: string) =>
      table === 'astronomical_events' ? { upsert } : { update },
    );
    const persistence = new SupabaseEventsPersistence(
      () => ({ from }) as unknown as SupabaseClient,
    );
    const query = {
      from: new Date('2026-10-04T00:00:00.000Z'),
      to: new Date('2026-10-11T00:00:00.000Z'),
      observer: { latitudeDegrees: -23.55049, longitudeDegrees: -46.63331, elevationMeters: 760.4 },
    };
    const events = [
      {
        id: 'moon:rise:2026-10-04T04:25:00.000Z',
        type: 'rise' as const,
        objectIds: ['moon'],
        startsAt: '2026-10-04T04:25:00.000Z',
        title: 'Nascer da Lua',
        description: 'A Lua surge acima do horizonte.',
      },
    ];

    await persistence.completeSync('run-id', query, events, '2026-10-04T01:00:00.000Z');
    await persistence.completeSync('run-id-2', query, events, '2026-10-04T02:00:00.000Z');

    const firstRows = upsert.mock.calls[0]?.[0] as Record<string, unknown>[];
    const secondRows = upsert.mock.calls[1]?.[0] as Record<string, unknown>[];
    expect(upsert).toHaveBeenCalledWith(firstRows, {
      onConflict: 'provider,provider_event_key',
    });
    expect(firstRows[0]).toMatchObject({
      provider: 'jpl-horizons',
      celestial_object_id: 'moon',
      observer_latitude: -23.55,
      observer_longitude: -46.633,
      observer_elevation_meters: 760,
      published: true,
      synced_at: '2026-10-04T01:00:00.000Z',
    });
    expect(secondRows[0]?.provider_event_key).toBe(firstRows[0]?.provider_event_key);
    expect(secondRows[0]?.slug).toBe(firstRows[0]?.slug);
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'succeeded',
        event_count: 1,
        completed_at: '2026-10-04T02:00:00.000Z',
      }),
    );
    expect(eq).toHaveBeenLastCalledWith('id', 'run-id-2');
  });

  it('reads only events produced by the selected successful synchronization', async () => {
    const completedAt = '2026-10-04T02:00:00.000Z';
    const runQuery = fluentQuery({ id: 'run-id', completed_at: completedAt });
    const eventsQuery = fluentQuery([
      {
        provider_event_key: 'stable-key',
        celestial_object_id: 'moon',
        title: 'Nascer da Lua',
        description: 'A Lua surge acima do horizonte.',
        event_type: 'rise',
        starts_at: '2026-10-04T04:25:00.000Z',
        peaks_at: null,
        ends_at: null,
      },
    ]);
    eventsQuery.builder.order?.mockReset().mockResolvedValue(eventsQuery.result);
    const from = vi.fn((table: string) =>
      table === 'astronomical_event_sync_runs' ? runQuery.builder : eventsQuery.builder,
    );
    const persistence = new SupabaseEventsPersistence(
      () => ({ from }) as unknown as SupabaseClient,
    );

    const result = await persistence.findCached({
      from: new Date('2026-10-04T00:00:00.000Z'),
      to: new Date('2026-10-11T00:00:00.000Z'),
      observer: { latitudeDegrees: -23.55, longitudeDegrees: -46.633, elevationMeters: 760 },
    });

    expect(eventsQuery.eq).toHaveBeenCalledWith('synced_at', completedAt);
    expect(result).toMatchObject({
      source: 'cache',
      stale: false,
      updatedAt: completedAt,
      events: [{ id: 'moon:rise:2026-10-04T04:25:00.000Z' }],
    });
  });
});

function fluentQuery(data: unknown) {
  const result = { data, error: null };
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = () => builder;
  for (const method of ['select', 'eq', 'lte', 'gte', 'limit']) builder[method] = vi.fn(chain);
  builder.order = vi.fn().mockReturnValueOnce(builder).mockResolvedValueOnce(result);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  return { builder, eq: builder.eq, result };
}
