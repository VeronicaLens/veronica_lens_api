import type {
  ApparentPosition,
  CelestialObject,
  CelestialObjectType,
  ObjectSearchQuery,
  PositionQuery,
} from './astronomy-provider.js';

interface HorizonsLookupItem {
  alias?: unknown;
  name?: unknown;
  spkid?: unknown;
  type?: unknown;
}

interface HorizonsLookupResponse {
  result?: unknown;
}

interface HorizonsEphemerisResponse {
  result?: unknown;
}

export class AstronomyProviderError extends Error {
  constructor(
    readonly code: 'UNAVAILABLE' | 'INVALID_RESPONSE',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AstronomyProviderError';
  }
}

export class JplHorizonsProvider {
  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly baseUrl = 'https://ssd.jpl.nasa.gov/api',
  ) {}

  async searchObjects(query: ObjectSearchQuery): Promise<CelestialObject[]> {
    const url = new URL(`${this.baseUrl}/horizons_lookup.api`);
    url.searchParams.set('sstr', query.searchTerm);
    url.searchParams.set('format', 'json');

    const payload = (await this.fetchJson(url)) as HorizonsLookupResponse;
    if (!Array.isArray(payload.result)) {
      return [];
    }

    return payload.result
      .map((item) => this.mapLookupItem(item as HorizonsLookupItem))
      .filter((item): item is CelestialObject => item !== null)
      .slice(0, query.limit ?? 20);
  }

  async getPositions(query: PositionQuery): Promise<ApparentPosition[]> {
    return Promise.all(query.objectIds.map((objectId) => this.fetchPosition(objectId, query)));
  }

  private async fetchPosition(objectId: string, query: PositionQuery): Promise<ApparentPosition> {
    const url = new URL(`${this.baseUrl}/horizons.api`);
    const siteCoordinates = [
      query.observer.longitudeDegrees,
      query.observer.latitudeDegrees,
      query.observer.elevationMeters / 1_000,
    ].join(',');

    url.searchParams.set('format', 'json');
    url.searchParams.set('COMMAND', `'${objectId}'`);
    url.searchParams.set('OBJ_DATA', 'NO');
    url.searchParams.set('MAKE_EPHEM', 'YES');
    url.searchParams.set('EPHEM_TYPE', 'OBSERVER');
    url.searchParams.set('CENTER', `'coord@399'`);
    url.searchParams.set('COORD_TYPE', 'GEODETIC');
    url.searchParams.set('SITE_COORD', `'${siteCoordinates}'`);
    url.searchParams.set('TLIST', `'${formatHorizonsInstant(query.observedAt)}'`);
    url.searchParams.set('QUANTITIES', `'2,4'`);
    url.searchParams.set('CSV_FORMAT', 'YES');

    const payload = (await this.fetchJson(url)) as HorizonsEphemerisResponse;
    if (typeof payload.result !== 'string') {
      throw new AstronomyProviderError(
        'INVALID_RESPONSE',
        'JPL Horizons returned an invalid ephemeris payload',
      );
    }

    return parseEphemeris(payload.result, objectId, query.observedAt);
  }

  private async fetchJson(url: URL): Promise<unknown> {
    let response: Response;

    try {
      response = await this.request(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error) {
      throw new AstronomyProviderError('UNAVAILABLE', 'JPL Horizons is temporarily unavailable', {
        cause: error,
      });
    }

    if (!response.ok) {
      throw new AstronomyProviderError(
        'UNAVAILABLE',
        `JPL Horizons request failed with status ${response.status}`,
      );
    }

    try {
      return await response.json();
    } catch (error) {
      throw new AstronomyProviderError('INVALID_RESPONSE', 'JPL Horizons returned malformed JSON', {
        cause: error,
      });
    }
  }

  private mapLookupItem(item: HorizonsLookupItem): CelestialObject | null {
    if (typeof item.spkid !== 'string' || typeof item.name !== 'string') {
      return null;
    }

    return {
      id: item.spkid,
      name: item.name,
      type: mapObjectType(item.type),
      aliases: Array.isArray(item.alias)
        ? item.alias.filter((alias): alias is string => typeof alias === 'string')
        : [],
    };
  }
}

function formatHorizonsInstant(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    throw new AstronomyProviderError('INVALID_RESPONSE', 'Observation date is invalid');
  }

  return value.toISOString().replace('T', ' ').replace('Z', '');
}

function parseEphemeris(result: string, objectId: string, observedAt: Date): ApparentPosition {
  const ephemeris = result.match(/\$\$SOE\s*\n([^\n]+)\n\$\$EOE/);
  const row = ephemeris?.[1]?.split(',').map((value) => value.trim());

  if (!row || row.length < 7) {
    throw new AstronomyProviderError(
      'INVALID_RESPONSE',
      'JPL Horizons response does not contain an ephemeris row',
    );
  }

  const rightAscension = row[3];
  const declination = row[4];
  const azimuth = Number(row[5]);
  const altitude = Number(row[6]);

  if (
    rightAscension === undefined ||
    declination === undefined ||
    !Number.isFinite(azimuth) ||
    !Number.isFinite(altitude)
  ) {
    throw new AstronomyProviderError('INVALID_RESPONSE', 'JPL Horizons coordinates are invalid');
  }

  return {
    objectId,
    observedAt: observedAt.toISOString(),
    equatorial: {
      rightAscensionDegrees: parseSexagesimal(rightAscension, true),
      declinationDegrees: parseSexagesimal(declination, false),
    },
    horizontal: {
      altitudeDegrees: altitude,
      azimuthDegrees: azimuth,
    },
  };
}

function parseSexagesimal(value: string, hours: boolean): number {
  const parts = value.trim().split(/\s+/).map(Number);
  const first = parts[0];
  const minutes = parts[1];
  const seconds = parts[2];

  if (
    first === undefined ||
    minutes === undefined ||
    seconds === undefined ||
    parts.some((part) => !Number.isFinite(part))
  ) {
    throw new AstronomyProviderError('INVALID_RESPONSE', 'Invalid sexagesimal coordinate');
  }

  const sign = first < 0 || value.trim().startsWith('-') ? -1 : 1;
  const decimal = Math.abs(first) + minutes / 60 + seconds / 3_600;
  return sign * decimal * (hours ? 15 : 1);
}

function mapObjectType(value: unknown): CelestialObjectType {
  if (typeof value !== 'string') return 'other';

  const normalized = value.toLowerCase();
  if (normalized.includes('asteroid')) return 'asteroid';
  if (normalized.includes('comet')) return 'comet';
  if (normalized.includes('spacecraft')) return 'spacecraft';
  if (normalized.includes('satellite')) return 'moon';
  if (normalized.includes('planet')) return 'planet';
  return 'other';
}
