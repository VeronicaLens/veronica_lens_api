import { describe, expect, it, vi } from 'vitest';

import { ExpoPushProvider } from '../src/modules/notifications/expo-push.provider.js';
import type { NotificationCandidate } from '../src/modules/notifications/notification-dispatch.persistence.js';

const candidate: NotificationCandidate = {
  eventId: 'event-123',
  eventType: 'rise',
  eventTitle: 'Lua nasce',
  eventDescription: 'A Lua estará visível.',
  eventStartsAt: '2026-10-04T01:00:00.000Z',
  userId: 'user-123',
  deviceId: 'device-123',
  token: 'ExponentPushToken[token]',
};

describe('ExpoPushProvider', () => {
  it('sends event data and a deep link for notification navigation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { status: 'ok', id: 'ticket-123' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await expect(new ExpoPushProvider().send(candidate)).resolves.toEqual({
        ticketId: 'ticket-123',
      });
      const request = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(request[0]).toBe('https://exp.host/--/api/v2/push/send');
      if (typeof request[1].body !== 'string') throw new Error('Expected a JSON push payload');
      expect(JSON.parse(request[1].body)).toMatchObject({
        to: candidate.token,
        data: {
          eventId: candidate.eventId,
          eventType: candidate.eventType,
          url: 'veronicalens://events/event-123',
        },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
