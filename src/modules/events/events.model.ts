import type {
  AstronomicalEvent,
  AstronomicalEventType,
  EventQuery,
} from '../astronomy/astronomy-provider.js';
import type { CatalogModelPort, CatalogObject } from '../catalog/catalog.model.js';
import type { EventsPersistencePort } from './events.persistence.js';

export interface UpcomingEvent extends AstronomicalEvent {
  objectIds: string[];
}

export interface UpcomingEventsQuery extends Omit<EventQuery, 'objectIds'> {
  type?: AstronomicalEventType;
}

export interface UpcomingEventsResult {
  events: UpcomingEvent[];
  source: 'provider' | 'cache';
  stale: boolean;
  updatedAt: string;
}

export interface EventsModelPort {
  findUpcoming(query: UpcomingEventsQuery): Promise<UpcomingEventsResult>;
}

export interface AstronomyEventsProvider {
  getEvents(query: EventQuery): Promise<AstronomicalEvent[]>;
}

interface CacheEntry {
  result: UpcomingEventsResult;
  storedAt: number;
}

const defaultFreshTtlMs = 15 * 60 * 1_000;
const defaultStaleTtlMs = 24 * 60 * 60 * 1_000;

export class CachedAstronomyEventsModel implements EventsModelPort {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly catalog: CatalogModelPort,
    private readonly provider: AstronomyEventsProvider,
    private readonly persistence?: EventsPersistencePort,
    private readonly now: () => Date = () => new Date(),
    private readonly freshTtlMs = defaultFreshTtlMs,
    private readonly staleTtlMs = defaultStaleTtlMs,
  ) {}

  async findUpcoming(query: UpcomingEventsQuery): Promise<UpcomingEventsResult> {
    const key = cacheKey(query);
    const cached = this.cache.get(key);
    const nowMs = this.now().getTime();
    if (cached && nowMs - cached.storedAt <= this.freshTtlMs) {
      return filterResult(cached.result, query.type, 'cache', false);
    }

    const unfilteredQuery = withoutType(query);
    const persisted = await this.loadPersisted(unfilteredQuery);
    if (persisted && nowMs - new Date(persisted.updatedAt).getTime() <= this.freshTtlMs) {
      this.cache.set(key, { result: persisted, storedAt: nowMs });
      return filterResult(persisted, query.type, 'cache', false);
    }

    try {
      const result = await this.synchronize(unfilteredQuery);
      this.cache.set(key, { result, storedAt: nowMs });
      return filterResult(result, query.type, 'provider', false);
    } catch (error) {
      if (cached && nowMs - cached.storedAt <= this.staleTtlMs && query.to.getTime() >= nowMs) {
        return filterResult(cached.result, query.type, 'cache', true);
      }
      if (
        persisted &&
        nowMs - new Date(persisted.updatedAt).getTime() <= this.staleTtlMs &&
        query.to.getTime() >= nowMs
      ) {
        this.cache.set(key, { result: persisted, storedAt: nowMs });
        return filterResult(persisted, query.type, 'cache', true);
      }
      throw error;
    }
  }

  async synchronize(
    query: UpcomingEventsQuery,
    requirePersistence = false,
  ): Promise<UpcomingEventsResult> {
    let runId: string | undefined;
    try {
      try {
        runId = await this.persistence?.beginSync(query);
      } catch (error) {
        if (requirePersistence) throw error;
      }

      const catalog = await this.catalog.findMany({ limit: 50 });
      const dynamicObjects = catalog.filter(
        (
          object,
        ): object is CatalogObject & {
          coordinates: { kind: 'ephemeris'; providerObjectId: string };
        } => object.coordinates.kind === 'ephemeris',
      );
      const providerIds = dynamicObjects.map((object) => object.coordinates.providerObjectId);
      const byProviderId = new Map(
        dynamicObjects.map((object) => [object.coordinates.providerObjectId, object]),
      );
      const rawEvents = await this.provider.getEvents({ ...query, objectIds: providerIds });
      const now = this.now();
      const updatedAt = now.toISOString();
      const result: UpcomingEventsResult = {
        events: rawEvents
          .filter((event) => new Date(event.startsAt).getTime() >= now.getTime())
          .flatMap((event) => {
            const object = byProviderId.get(event.objectIds[0] ?? '');
            return object ? [normalizeEvent(event, object)] : [];
          }),
        source: 'provider',
        stale: false,
        updatedAt,
      };

      if (this.persistence && runId) {
        try {
          await this.persistence.completeSync(runId, query, result.events, updatedAt);
        } catch (error) {
          if (requirePersistence) throw error;
          await this.recordFailure(runId, error, updatedAt);
        }
      } else if (requirePersistence) {
        throw new Error('Astronomical event persistence is required');
      }
      return result;
    } catch (error) {
      if (runId) await this.recordFailure(runId, error, this.now().toISOString());
      throw error;
    }
  }

  private async loadPersisted(query: UpcomingEventsQuery): Promise<UpcomingEventsResult | null> {
    try {
      return (await this.persistence?.findCached(query)) ?? null;
    } catch {
      return null;
    }
  }

  private async recordFailure(runId: string, error: unknown, completedAt: string): Promise<void> {
    try {
      await this.persistence?.failSync(runId, error, completedAt);
    } catch {
      // The original synchronization error remains the actionable failure.
    }
  }
}

function normalizeEvent(event: AstronomicalEvent, object: CatalogObject): UpcomingEvent {
  const article = object.type === 'moon' ? 'A' : 'O';
  const titleConnector = object.type === 'moon' ? 'da' : 'de';
  const labels = {
    rise: ['Nascer', `${article} ${object.name} surge acima do horizonte.`],
    transit: ['Trânsito', `${article} ${object.name} atinge o ponto mais alto no céu.`],
    set: ['Ocaso', `${article} ${object.name} desce abaixo do horizonte.`],
  } as const;
  const label =
    event.type === 'rise' || event.type === 'transit' || event.type === 'set'
      ? labels[event.type]
      : ['Evento', event.description];
  return {
    ...event,
    id: `${object.id}:${event.type}:${event.startsAt}`,
    objectIds: [object.id],
    title: `${label[0]} ${titleConnector} ${object.name}`,
    description: label[1],
  };
}

function cacheKey(query: UpcomingEventsQuery): string {
  const observer = query.observer;
  return [
    query.from.toISOString(),
    query.to.toISOString(),
    observer.latitudeDegrees.toFixed(3),
    observer.longitudeDegrees.toFixed(3),
    Math.round(observer.elevationMeters),
  ].join(':');
}

function withoutType(query: UpcomingEventsQuery): UpcomingEventsQuery {
  return { from: query.from, to: query.to, observer: query.observer };
}

function filterResult(
  result: UpcomingEventsResult,
  type: AstronomicalEventType | undefined,
  source: UpcomingEventsResult['source'],
  stale: boolean,
): UpcomingEventsResult {
  return {
    ...result,
    events: type ? result.events.filter((event) => event.type === type) : [...result.events],
    source,
    stale,
  };
}
