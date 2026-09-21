import type { SupabaseClient } from '@supabase/supabase-js';

export interface NotificationCandidate {
  eventId: string;
  eventType: string;
  eventTitle: string;
  eventDescription: string;
  eventStartsAt: string;
  userId: string;
  deviceId: string;
  token: string;
}

export interface NotificationDispatchPersistencePort {
  findEligible(now: Date): Promise<NotificationCandidate[]>;
  claimDelivery(candidate: NotificationCandidate): Promise<string | null>;
  markSent(deliveryId: string, ticketId: string | null): Promise<void>;
  markFailed(deliveryId: string, code: string, message: string): Promise<void>;
}

interface EventRow {
  id: string;
  event_type: string;
  title: string;
  description: string;
  starts_at: string;
}

interface PreferenceRow {
  user_id: string;
  event_type: string;
  lead_minutes: number;
}

interface DeviceRow {
  id: string;
  user_id: string;
  token: string;
}

interface ProfileRow {
  id: string;
}

export class SupabaseNotificationDispatchPersistence implements NotificationDispatchPersistencePort {
  constructor(private readonly clientFactory: () => SupabaseClient) {}

  async findEligible(now: Date): Promise<NotificationCandidate[]> {
    const client = this.clientFactory();
    const latestEligibleStart = new Date(now.getTime() + 43_200 * 60_000).toISOString();
    const [eventsResult, preferencesResult, devicesResult, profilesResult] = await Promise.all([
      client
        .from('astronomical_events')
        .select('id, event_type, title, description, starts_at')
        .eq('published', true)
        .gt('starts_at', now.toISOString())
        .lte('starts_at', latestEligibleStart),
      client
        .from('event_preferences')
        .select('user_id, event_type, lead_minutes')
        .eq('enabled', true),
      client.from('device_push_tokens').select('id, user_id, token').eq('active', true),
      client.from('profiles').select('id').eq('notifications_enabled', true),
    ]);
    if (eventsResult.error) throw new NotificationDispatchPersistenceError('Could not read events');
    if (preferencesResult.error)
      throw new NotificationDispatchPersistenceError('Could not read notification preferences');
    if (devicesResult.error)
      throw new NotificationDispatchPersistenceError('Could not read push devices');
    if (profilesResult.error)
      throw new NotificationDispatchPersistenceError('Could not read profiles');

    const events = (eventsResult.data ?? []) as unknown as EventRow[];
    const preferences = (preferencesResult.data ?? []) as unknown as PreferenceRow[];
    const devices = (devicesResult.data ?? []) as unknown as DeviceRow[];
    const enabledUsers = new Set(
      ((profilesResult.data ?? []) as unknown as ProfileRow[]).map((profile) => profile.id),
    );
    const devicesByUser = new Map<string, DeviceRow[]>();
    for (const device of devices) {
      const userDevices = devicesByUser.get(device.user_id) ?? [];
      userDevices.push(device);
      devicesByUser.set(device.user_id, userDevices);
    }

    return preferences.flatMap((preference) => {
      if (!enabledUsers.has(preference.user_id)) return [];
      const latestStart = now.getTime() + preference.lead_minutes * 60_000;
      const matchingEvents = events.filter(
        (event) =>
          event.event_type === preference.event_type &&
          new Date(event.starts_at).getTime() <= latestStart,
      );
      return matchingEvents.flatMap((event) =>
        (devicesByUser.get(preference.user_id) ?? []).map((device) => ({
          eventId: event.id,
          eventType: event.event_type,
          eventTitle: event.title,
          eventDescription: event.description,
          eventStartsAt: event.starts_at,
          userId: preference.user_id,
          deviceId: device.id,
          token: device.token,
        })),
      );
    });
  }

  async claimDelivery(candidate: NotificationCandidate): Promise<string | null> {
    const { data, error } = await this.clientFactory()
      .from('notification_deliveries')
      .insert({
        astronomical_event_id: candidate.eventId,
        device_push_token_id: candidate.deviceId,
        user_id: candidate.userId,
        status: 'pending',
      })
      .select('id')
      .maybeSingle();
    if (error?.code === '23505') return null;
    if (error)
      throw new NotificationDispatchPersistenceError('Could not reserve notification delivery');
    const delivery = data as unknown as { id?: unknown } | null;
    return typeof delivery?.id === 'string' ? delivery.id : null;
  }

  async markSent(deliveryId: string, ticketId: string | null): Promise<void> {
    const { error } = await this.clientFactory()
      .from('notification_deliveries')
      .update({
        status: 'sent',
        provider_ticket_id: ticketId,
        delivered_at: new Date().toISOString(),
        failed_at: null,
        error_code: null,
        error_message: null,
      })
      .eq('id', deliveryId);
    if (error) throw new NotificationDispatchPersistenceError('Could not record sent notification');
  }

  async markFailed(deliveryId: string, code: string, message: string): Promise<void> {
    const { error } = await this.clientFactory()
      .from('notification_deliveries')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        delivered_at: null,
        error_code: code.slice(0, 100),
        error_message: message.slice(0, 500),
      })
      .eq('id', deliveryId);
    if (error)
      throw new NotificationDispatchPersistenceError('Could not record failed notification');
  }
}

export class NotificationDispatchPersistenceError extends Error {}
