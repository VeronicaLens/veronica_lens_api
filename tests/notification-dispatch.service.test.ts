import { describe, expect, it, vi } from 'vitest';

import type {
  NotificationCandidate,
  NotificationDispatchPersistencePort,
} from '../src/modules/notifications/notification-dispatch.persistence.js';
import {
  NotificationDispatchService,
  type PushProviderPort,
} from '../src/modules/notifications/notification-dispatch.service.js';

const firstCandidate: NotificationCandidate = {
  eventId: 'event-one',
  eventType: 'rise',
  eventTitle: 'Lua nasce',
  eventDescription: 'A Lua estará visível.',
  eventStartsAt: '2026-10-04T01:00:00.000Z',
  userId: 'user-one',
  deviceId: 'device-one',
  token: 'ExponentPushToken[one]',
};

const secondCandidate: NotificationCandidate = {
  ...firstCandidate,
  eventId: 'event-two',
  deviceId: 'device-two',
  token: 'ExponentPushToken[two]',
};

function persistence(candidates: NotificationCandidate[]) {
  const findEligible = vi.fn().mockResolvedValue(candidates);
  const claimDelivery = vi
    .fn()
    .mockImplementation((candidate: NotificationCandidate) => Promise.resolve(candidate.eventId));
  const markSent = vi.fn().mockResolvedValue(undefined);
  const markFailed = vi.fn().mockResolvedValue(undefined);
  const repository: NotificationDispatchPersistencePort = {
    findEligible,
    claimDelivery,
    markSent,
    markFailed,
  };
  return { repository, claimDelivery, markSent, markFailed };
}

describe('notification dispatch service', () => {
  it('records a sent delivery and skips a previously claimed event/device pair', async () => {
    const { repository, claimDelivery, markSent } = persistence([firstCandidate, secondCandidate]);
    claimDelivery.mockResolvedValueOnce('delivery-one').mockResolvedValueOnce(null);
    const send = vi.fn().mockResolvedValue({ ticketId: 'ticket-one' });
    const provider: PushProviderPort = { send };

    const report = await new NotificationDispatchService(repository, provider).dispatch();

    expect(report).toEqual({ candidates: 2, sent: 1, failed: 0, duplicates: 1 });
    expect(markSent).toHaveBeenCalledWith('delivery-one', 'ticket-one');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('records a failed push and continues sending to subsequent recipients', async () => {
    const { repository, markFailed, markSent } = persistence([firstCandidate, secondCandidate]);
    const send = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('Token expired'), { code: 'DeviceNotRegistered' }),
      )
      .mockResolvedValueOnce({ ticketId: 'ticket-two' });
    const provider: PushProviderPort = { send };

    const report = await new NotificationDispatchService(repository, provider).dispatch();

    expect(report).toEqual({ candidates: 2, sent: 1, failed: 1, duplicates: 0 });
    expect(markFailed).toHaveBeenCalledWith('event-one', 'DeviceNotRegistered', 'Token expired');
    expect(markSent).toHaveBeenCalledWith('event-two', 'ticket-two');
  });
});
