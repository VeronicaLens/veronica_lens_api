import { describe, expect, it } from 'vitest';

import { selectNotificationCandidates } from '../src/modules/notifications/notification-dispatch.persistence.js';

const now = new Date('2026-10-16T01:00:00.000Z');

function event(id: string, type: string, minutesFromNow: number) {
  return {
    id,
    event_type: type,
    title: `Evento ${id}`,
    description: 'Descrição',
    starts_at: new Date(now.getTime() + minutesFromNow * 60_000).toISOString(),
  };
}

const devices = [
  { id: 'device-a', user_id: 'user-a', token: 'ExponentPushToken[a]' },
  { id: 'device-b', user_id: 'user-b', token: 'ExponentPushToken[b]' },
];

describe('selectNotificationCandidates', () => {
  it('applies the app default preferences to users who never saved any', () => {
    const candidates = selectNotificationCandidates({
      now,
      events: [event('rise-soon', 'rise', 20), event('set-later', 'set', 90)],
      preferences: [],
      devices,
      enabledUserIds: new Set(['user-a']),
    });

    expect(candidates.map(({ eventId, deviceId }) => [eventId, deviceId])).toEqual([
      ['rise-soon', 'device-a'],
    ]);
  });

  it('respects saved preferences, disabled types and custom lead times', () => {
    const candidates = selectNotificationCandidates({
      now,
      events: [
        event('rise-soon', 'rise', 20),
        event('transit-hour', 'transit', 50),
        event('set-soon', 'set', 10),
      ],
      preferences: [
        { user_id: 'user-a', event_type: 'rise', lead_minutes: 30, enabled: true },
        { user_id: 'user-a', event_type: 'transit', lead_minutes: 60, enabled: true },
        { user_id: 'user-a', event_type: 'set', lead_minutes: 30, enabled: false },
      ],
      devices,
      enabledUserIds: new Set(['user-a']),
    });

    expect(candidates.map(({ eventId }) => eventId).sort()).toEqual(['rise-soon', 'transit-hour']);
  });

  it('skips users with alerts disabled, past events and users without devices', () => {
    const candidates = selectNotificationCandidates({
      now,
      events: [event('past', 'rise', -5), event('rise-soon', 'rise', 15)],
      preferences: [],
      devices,
      enabledUserIds: new Set(['user-c']),
    });

    expect(candidates).toEqual([]);
  });
});
