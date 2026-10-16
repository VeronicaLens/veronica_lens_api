import type {
  HourlyWeatherConditions,
  WeatherForecast,
  WeatherForecastQuery,
  WeatherProvider,
} from './weather-provider.js';

const DEFAULT_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1_000;
const DEFAULT_MAX_CACHE_ENTRIES = 100;

interface OpenMeteoHourlyPayload {
  time?: unknown;
  temperature_2m?: unknown;
  relative_humidity_2m?: unknown;
  precipitation_probability?: unknown;
  precipitation?: unknown;
  cloud_cover?: unknown;
  visibility?: unknown;
  wind_speed_10m?: unknown;
}

interface OpenMeteoPayload {
  latitude?: unknown;
  longitude?: unknown;
  elevation?: unknown;
  hourly?: unknown;
}

interface CacheEntry {
  expiresAt: number;
  forecast: WeatherForecast;
}

export interface OpenMeteoWeatherProviderOptions {
  request?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
  now?: () => number;
}

export class WeatherProviderError extends Error {
  constructor(
    readonly code: 'TIMEOUT' | 'UNAVAILABLE' | 'INVALID_RESPONSE',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'WeatherProviderError';
  }
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  private readonly request: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly maxCacheEntries: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: OpenMeteoWeatherProviderOptions = {}) {
    this.request = options.request ?? fetch;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.maxCacheEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
    this.now = options.now ?? Date.now;
  }

  async getForecast(query: WeatherForecastQuery): Promise<WeatherForecast> {
    validateQuery(query);

    const cacheKey = createCacheKey(query);
    const cached = this.cache.get(cacheKey);
    const now = this.now();

    if (cached && cached.expiresAt > now) {
      return cached.forecast;
    }

    if (cached) this.cache.delete(cacheKey);

    const payload = await this.fetchForecast(query);
    const forecast = mapForecast(payload, query, now);

    this.setCache(cacheKey, { expiresAt: now + this.cacheTtlMs, forecast });
    return forecast;
  }

  private async fetchForecast(query: WeatherForecastQuery): Promise<OpenMeteoPayload> {
    const url = buildForecastUrl(this.baseUrl, query);
    let response: Response;

    try {
      response = await this.request(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new WeatherProviderError('TIMEOUT', 'Open-Meteo request timed out', { cause: error });
      }

      throw new WeatherProviderError('UNAVAILABLE', 'Open-Meteo is temporarily unavailable', {
        cause: error,
      });
    }

    if (!response.ok) {
      throw new WeatherProviderError(
        'UNAVAILABLE',
        `Open-Meteo request failed with status ${response.status}`,
      );
    }

    try {
      return (await response.json()) as OpenMeteoPayload;
    } catch (error) {
      throw new WeatherProviderError('INVALID_RESPONSE', 'Open-Meteo returned malformed JSON', {
        cause: error,
      });
    }
  }

  private setCache(key: string, entry: CacheEntry): void {
    for (const [cachedKey, cached] of this.cache) {
      if (cached.expiresAt <= this.now()) this.cache.delete(cachedKey);
    }

    if (this.maxCacheEntries <= 0 || this.cacheTtlMs <= 0) return;

    while (this.cache.size >= this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, entry);
  }
}

function buildForecastUrl(baseUrl: string, query: WeatherForecastQuery): URL {
  const url = new URL(baseUrl);
  url.searchParams.set('latitude', String(query.latitudeDegrees));
  url.searchParams.set('longitude', String(query.longitudeDegrees));
  url.searchParams.set(
    'hourly',
    [
      'temperature_2m',
      'relative_humidity_2m',
      'precipitation_probability',
      'precipitation',
      'cloud_cover',
      'visibility',
      'wind_speed_10m',
    ].join(','),
  );
  url.searchParams.set('timezone', 'GMT');
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('precipitation_unit', 'mm');
  url.searchParams.set('start_date', formatDate(query.from));
  url.searchParams.set('end_date', formatDate(query.to));
  return url;
}

function mapForecast(
  payload: OpenMeteoPayload,
  query: WeatherForecastQuery,
  fetchedAt: number,
): WeatherForecast {
  if (!isFiniteNumber(payload.latitude) || !isFiniteNumber(payload.longitude)) {
    throw invalidResponse('Open-Meteo returned invalid location coordinates');
  }

  const hourly = payload.hourly as OpenMeteoHourlyPayload | undefined;
  if (!hourly || typeof hourly !== 'object') {
    throw invalidResponse('Open-Meteo response does not contain hourly weather data');
  }

  const times = getArray(hourly.time, 'time');
  const columns = {
    temperatureCelsius: getArray(hourly.temperature_2m, 'temperature_2m'),
    relativeHumidityPercent: getArray(hourly.relative_humidity_2m, 'relative_humidity_2m'),
    precipitationProbabilityPercent: getArray(
      hourly.precipitation_probability,
      'precipitation_probability',
    ),
    precipitationMillimeters: getArray(hourly.precipitation, 'precipitation'),
    cloudCoverPercent: getArray(hourly.cloud_cover, 'cloud_cover'),
    visibilityMeters: getArray(hourly.visibility, 'visibility'),
    windSpeedKilometersPerHour: getArray(hourly.wind_speed_10m, 'wind_speed_10m'),
  };

  for (const [name, values] of Object.entries(columns)) {
    if (values.length !== times.length) {
      throw invalidResponse(`Open-Meteo hourly column ${name} has an unexpected length`);
    }
  }

  const hourlyConditions = times
    .map((time, index) => mapHourlyConditions(time, index, columns))
    .filter((conditions) => {
      const instant = Date.parse(conditions.forecastAt);
      return instant >= query.from.getTime() && instant <= query.to.getTime();
    });

  return {
    location: {
      latitudeDegrees: payload.latitude,
      longitudeDegrees: payload.longitude,
      elevationMeters: isFiniteNumber(payload.elevation) ? payload.elevation : 0,
    },
    timezone: 'UTC',
    fetchedAt: new Date(fetchedAt).toISOString(),
    hourly: hourlyConditions,
  };
}

function mapHourlyConditions(
  time: unknown,
  index: number,
  columns: Record<Exclude<keyof HourlyWeatherConditions, 'forecastAt'>, unknown[]>,
): HourlyWeatherConditions {
  if (typeof time !== 'string')
    throw invalidResponse('Open-Meteo returned an invalid forecast time');

  const forecastAt = parseUtcTime(time);
  const values = Object.fromEntries(
    Object.entries(columns).map(([name, column]) => {
      const value = column[index];
      if (!isFiniteNumber(value)) {
        throw invalidResponse(`Open-Meteo returned an invalid value for ${name}`);
      }
      return [name, value];
    }),
  ) as Omit<HourlyWeatherConditions, 'forecastAt'>;

  return { forecastAt, ...values };
}

function getArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) {
    throw invalidResponse(`Open-Meteo response does not contain hourly column ${name}`);
  }
  return value;
}

function parseUtcTime(value: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00Z` : value;
  const instant = new Date(normalized);
  if (Number.isNaN(instant.getTime())) {
    throw invalidResponse('Open-Meteo returned an invalid forecast time');
  }
  return instant.toISOString();
}

function validateQuery(query: WeatherForecastQuery): void {
  if (
    !Number.isFinite(query.latitudeDegrees) ||
    query.latitudeDegrees < -90 ||
    query.latitudeDegrees > 90
  ) {
    throw new RangeError('Weather latitude must be between -90 and 90 degrees');
  }
  if (
    !Number.isFinite(query.longitudeDegrees) ||
    query.longitudeDegrees < -180 ||
    query.longitudeDegrees > 180
  ) {
    throw new RangeError('Weather longitude must be between -180 and 180 degrees');
  }
  if (
    Number.isNaN(query.from.getTime()) ||
    Number.isNaN(query.to.getTime()) ||
    query.from > query.to
  ) {
    throw new RangeError('Weather forecast interval is invalid');
  }
}

function createCacheKey(query: WeatherForecastQuery): string {
  return [
    query.latitudeDegrees,
    query.longitudeDegrees,
    query.from.toISOString(),
    query.to.toISOString(),
  ].join(':');
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

function invalidResponse(message: string): WeatherProviderError {
  return new WeatherProviderError('INVALID_RESPONSE', message);
}
