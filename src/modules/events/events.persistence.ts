import { createHash } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { AstronomicalEventType } from '../astronomy/astronomy-provider.js';
import type { UpcomingEvent, UpcomingEventsQuery, UpcomingEventsResult } from './events.model.js';

interface SyncRunRow {
  id: string;
  completed_at: string | null;
}

interface EventRow {
  provider_event_key: string;
  celestial_object_id: string;
  title: string;
  description: string;
  event_type: AstronomicalEventType;
  starts_at: string;
  peaks_at: string | null;
  ends_at: string | null;
}

export interface EventsPersistencePort {
  beginSync: (query: UpcomingEventsQuery) => Promise<string>;
  completeSync: (
    runId: string,
    query: UpcomingEventsQuery,
    events: UpcomingEvent[],
    completedAt: string,
  ) => Promise<void>;
  failSync: (runId: string, error: unknown, completedAt: string) => Promise<void>;
  findCached: (query: UpcomingEventsQuery) => Promise<UpcomingEventsResult | null>;
}

export class SupabaseEventsPersistence implements EventsPersistencePort {
  constructor(
    private readonly clientFactory: () => SupabaseClient,
    private readonly provider = 'jpl-horizons',
  ) {}

  async beginSync(query: UpcomingEventsQuery): Promise<string> {
    const observer = normalizeObserver(query);
    const { data, error } = await this.clientFactory()
      .from('astronomical_event_sync_runs')
      .insert({
        provider: this.provider,
        status: 'running',
        covered_from: query.from.toISOString(),
        covered_to: query.to.toISOString(),
        ...observer,
      })
      .select('id')
      .single();
    if (error || typeof data?.id !== 'string') {
      throw new EventsPersistenceError('Could not start astronomical event synchronization', error);
    }
    return data.id;
  }

  async completeSync(
    runId: string,
    query: UpcomingEventsQuery,
    events: UpcomingEvent[],
    completedAt: string,
  ): Promise<void> {
    const observer = normalizeObserver(query);
    const rows = events.map((event) => {
      const providerEventKey = stableEventKey(this.provider, event, observer);
      return {
        slug: `${this.provider.replace(/[^a-z0-9]+/g, '-')}-${hash(providerEventKey)}`,
        provider: this.provider,
        provider_event_key: providerEventKey,
        celestial_object_id: event.objectIds[0] ?? null,
        title: event.title,
        description: event.description,
        event_type: event.type,
        celestial_object_name: event.title.replace(/^.*? (?:da|de) /, ''),
        starts_at: event.startsAt,
        peaks_at: event.peaksAt ?? null,
        ends_at: event.endsAt ?? null,
        published: true,
        synced_at: completedAt,
        ...observer,
      };
    });

    if (rows.length > 0) {
      const { error } = await this.clientFactory()
        .from('astronomical_events')
        .upsert(rows, { onConflict: 'provider,provider_event_key' });
      if (error) throw new EventsPersistenceError('Could not persist astronomical events', error);
    }

    const { error } = await this.clientFactory()
      .from('astronomical_event_sync_runs')
      .update({
        status: 'succeeded',
        event_count: events.length,
        completed_at: completedAt,
        error_code: null,
        error_message: null,
      })
      .eq('id', runId);
    if (error) throw new EventsPersistenceError('Could not complete event synchronization', error);
  }

  async failSync(runId: string, syncError: unknown, completedAt: string): Promise<void> {
    const { code, message } = describeError(syncError);
    const { error } = await this.clientFactory()
      .from('astronomical_event_sync_runs')
      .update({
        status: 'failed',
        error_code: code,
        error_message: message,
        completed_at: completedAt,
      })
      .eq('id', runId);
    if (error)
      throw new EventsPersistenceError('Could not record event synchronization failure', error);
  }

  async findCached(query: UpcomingEventsQuery): Promise<UpcomingEventsResult | null> {
    const client = this.clientFactory();
    const observer = normalizeObserver(query);
    const { data: run, error: runError } = await client
      .from('astronomical_event_sync_runs')
      .select('id, completed_at')
      .eq('provider', this.provider)
      .eq('status', 'succeeded')
      .eq('observer_latitude', observer.observer_latitude)
      .eq('observer_longitude', observer.observer_longitude)
      .eq('observer_elevation_meters', observer.observer_elevation_meters)
      .lte('covered_from', query.from.toISOString())
      .gte('covered_to', query.to.toISOString())
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle<SyncRunRow>();
    if (runError) throw new EventsPersistenceError('Could not read event cache metadata', runError);
    if (!run?.completed_at) return null;

    let eventQuery = client
      .from('astronomical_events')
      .select(
        'provider_event_key, celestial_object_id, title, description, event_type, starts_at, peaks_at, ends_at',
      )
      .eq('provider', this.provider)
      .eq('published', true)
      .eq('observer_latitude', observer.observer_latitude)
      .eq('observer_longitude', observer.observer_longitude)
      .eq('observer_elevation_meters', observer.observer_elevation_meters)
      .eq('synced_at', run.completed_at)
      .gte('starts_at', query.from.toISOString())
      .lte('starts_at', query.to.toISOString());
    if (query.type) eventQuery = eventQuery.eq('event_type', query.type);
    const { data, error } = await eventQuery.order('starts_at', { ascending: true });
    if (error) throw new EventsPersistenceError('Could not read cached astronomical events', error);

    return {
      events: ((data ?? []) as EventRow[]).map(mapEventRow),
      source: 'cache',
      stale: false,
      updatedAt: run.completed_at,
    };
  }
}

export class EventsPersistenceError extends Error {
  constructor(message: string, options?: unknown) {
    super(message, options instanceof Error ? { cause: options } : undefined);
    this.name = 'EventsPersistenceError';
  }
}

function normalizeObserver(query: UpcomingEventsQuery) {
  return {
    observer_latitude: Number(query.observer.latitudeDegrees.toFixed(3)),
    observer_longitude: Number(query.observer.longitudeDegrees.toFixed(3)),
    observer_elevation_meters: Math.round(query.observer.elevationMeters),
  };
}

function stableEventKey(
  provider: string,
  event: UpcomingEvent,
  observer: ReturnType<typeof normalizeObserver>,
): string {
  return [
    provider,
    event.objectIds[0],
    event.type,
    event.startsAt,
    observer.observer_latitude.toFixed(3),
    observer.observer_longitude.toFixed(3),
    observer.observer_elevation_meters,
  ].join(':');
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function mapEventRow(row: EventRow): UpcomingEvent {
  return {
    id: `${row.celestial_object_id}:${row.event_type}:${row.starts_at}`,
    type: row.event_type,
    objectIds: [row.celestial_object_id],
    startsAt: row.starts_at,
    ...(row.peaks_at ? { peaksAt: row.peaks_at } : {}),
    ...(row.ends_at ? { endsAt: row.ends_at } : {}),
    title: row.title,
    description: row.description,
  };
}

function describeError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : 'SYNC_FAILED';
    return { code: code.slice(0, 100), message: error.message.slice(0, 500) };
  }
  return { code: 'SYNC_FAILED', message: 'Unknown synchronization failure' };
}
