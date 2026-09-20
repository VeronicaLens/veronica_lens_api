import type { SupabaseClient } from '@supabase/supabase-js';

export interface EventPreference {
  eventType: string;
  enabled: boolean;
  leadMinutes: number;
}

interface EventPreferenceRow {
  event_type: string;
  enabled: boolean;
  lead_minutes: number;
}

export interface NotificationsModelPort {
  listPreferences(client: SupabaseClient, userId: string): Promise<EventPreference[]>;
  savePreferences(
    client: SupabaseClient,
    userId: string,
    preferences: EventPreference[],
  ): Promise<EventPreference[]>;
  registerDevice(
    client: SupabaseClient,
    userId: string,
    token: string,
    platform: 'android' | 'ios',
  ): Promise<void>;
  deactivateDevice(client: SupabaseClient, userId: string, token: string): Promise<void>;
}

export class SupabaseNotificationsModel implements NotificationsModelPort {
  async listPreferences(client: SupabaseClient, userId: string): Promise<EventPreference[]> {
    const { data, error } = await client
      .from('event_preferences')
      .select('event_type, enabled, lead_minutes')
      .eq('user_id', userId)
      .order('event_type', { ascending: true });
    if (error) throw error;
    return toPreferences(data);
  }

  async savePreferences(
    client: SupabaseClient,
    userId: string,
    preferences: EventPreference[],
  ): Promise<EventPreference[]> {
    const { data, error } = await client
      .from('event_preferences')
      .upsert(
        preferences.map((preference) => ({
          user_id: userId,
          event_type: preference.eventType,
          enabled: preference.enabled,
          lead_minutes: preference.leadMinutes,
        })),
        { onConflict: 'user_id,event_type' },
      )
      .select('event_type, enabled, lead_minutes');
    if (error) throw error;
    return toPreferences(data);
  }

  async registerDevice(
    client: SupabaseClient,
    userId: string,
    token: string,
    platform: 'android' | 'ios',
  ): Promise<void> {
    const { error } = await client.from('device_push_tokens').upsert(
      {
        user_id: userId,
        token,
        platform,
        active: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    );
    if (error) throw error;
  }

  async deactivateDevice(client: SupabaseClient, userId: string, token: string): Promise<void> {
    const { error } = await client
      .from('device_push_tokens')
      .update({ active: false })
      .eq('user_id', userId)
      .eq('token', token);
    if (error) throw error;
  }
}

function toPreferences(data: unknown): EventPreference[] {
  const rows = (data ?? []) as EventPreferenceRow[];
  return rows.map((row) => ({
    eventType: row.event_type,
    enabled: row.enabled,
    leadMinutes: row.lead_minutes,
  }));
}
