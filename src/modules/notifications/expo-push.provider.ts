import type { NotificationCandidate } from './notification-dispatch.persistence.js';
import type { PushProviderPort, PushSendResult } from './notification-dispatch.service.js';

const expoPushEndpoint = 'https://exp.host/--/api/v2/push/send';

export class ExpoPushProvider implements PushProviderPort {
  async send(candidate: NotificationCandidate): Promise<PushSendResult> {
    const response = await fetch(expoPushEndpoint, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: candidate.token,
        sound: 'default',
        title: candidate.eventTitle,
        body: candidate.eventDescription,
        data: {
          eventId: candidate.eventId,
          eventType: candidate.eventType,
          url: `veronicalens://events/${encodeURIComponent(candidate.eventId)}`,
        },
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new ExpoPushProviderError('EXPO_PUSH_HTTP_ERROR', 'Expo Push request failed');
    const ticket = readTicket(body);
    if (!ticket.ok) throw new ExpoPushProviderError(ticket.code, ticket.message);
    return { ticketId: ticket.id };
  }
}

class ExpoPushProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function readTicket(
  value: unknown,
): { ok: true; id: string | null } | { ok: false; code: string; message: string } {
  if (!value || typeof value !== 'object') {
    return {
      ok: false,
      code: 'EXPO_PUSH_INVALID_RESPONSE',
      message: 'Expo Push returned no ticket',
    };
  }
  const body = value as { data?: unknown };
  const ticket = firstTicket(body.data);
  if (!ticket || typeof ticket !== 'object') {
    return {
      ok: false,
      code: 'EXPO_PUSH_INVALID_RESPONSE',
      message: 'Expo Push returned no ticket',
    };
  }
  const candidate = ticket as {
    status?: unknown;
    id?: unknown;
    details?: { error?: unknown };
    message?: unknown;
  };
  if (candidate.status === 'ok') {
    return { ok: true, id: typeof candidate.id === 'string' ? candidate.id : null };
  }
  return {
    ok: false,
    code:
      typeof candidate.details?.error === 'string' ? candidate.details.error : 'EXPO_PUSH_REJECTED',
    message:
      typeof candidate.message === 'string'
        ? candidate.message
        : 'Expo Push rejected the notification',
  };
}

function firstTicket(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.length > 0 ? (value as unknown[])[0] : null;
}
