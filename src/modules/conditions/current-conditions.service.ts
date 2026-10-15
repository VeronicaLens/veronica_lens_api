import type { ObserverLocation } from '../astronomy/astronomy-provider.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { HourlyWeatherConditions, WeatherProvider } from '../weather/index.js';

export interface CurrentConditionsQuery {
  observer: ObserverLocation;
  at?: Date;
}

export interface CurrentConditionsForecastQuery {
  observer: ObserverLocation;
}

export type ObservationRating = 'good' | 'fair' | 'poor';
export type CurrentConditionFactorStatus = 'good' | 'caution' | 'poor';
export type CurrentConditionFactorCode =
  'cloud-cover' | 'precipitation' | 'visibility' | 'wind' | 'humidity';

export interface CurrentConditionsFactor {
  code: CurrentConditionFactorCode;
  status: CurrentConditionFactorStatus;
  summary: string;
}

export interface CurrentConditionsResult {
  requestedAt: string;
  observedAt: string;
  fetchedAt: string;
  temperatureCelsius: number;
  relativeHumidityPercent: number;
  cloudCoverPercent: number;
  precipitationProbabilityPercent: number;
  precipitationMillimeters: number;
  visibilityMeters: number;
  windSpeedKilometersPerHour: number;
  rating: ObservationRating;
  factors: CurrentConditionsFactor[];
  skyLabel: string;
  visibilityLabel: string;
}

export interface CurrentConditionsForecastResult {
  from: string;
  to: string;
  fetchedAt: string;
  hourly: CurrentConditionsResult[];
}

export interface CurrentConditionsPort {
  getCurrent(query: CurrentConditionsQuery): Promise<CurrentConditionsResult>;
  getForecast(query: CurrentConditionsForecastQuery): Promise<CurrentConditionsForecastResult>;
}

export const MAX_CONDITIONS_FORECAST_HORIZON_MS = 7 * 24 * 60 * 60 * 1_000;
const ONE_HOUR_MS = 60 * 60 * 1_000;
const MAX_SAMPLE_DISTANCE_MS = 30 * 60 * 1_000;
const CLOUD_COVER_CLEAR_MAX = 20;
const CLOUD_COVER_PARTLY_MAX = 60;
const PRECIPITATION_GOOD_MAX = 10;
const PRECIPITATION_FAIR_MAX = 30;
const VISIBILITY_GOOD_METERS = 10_000;
const VISIBILITY_FAIR_METERS = 5_000;
const WIND_GOOD_MAX_KILOMETERS_PER_HOUR = 15;
const WIND_FAIR_MAX_KILOMETERS_PER_HOUR = 30;
const HUMIDITY_GOOD_MAX_PERCENT = 80;
const HUMIDITY_FAIR_MAX_PERCENT = 90;

export class CurrentConditionsService implements CurrentConditionsPort {
  constructor(
    private readonly weather: WeatherProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getCurrent(query: CurrentConditionsQuery): Promise<CurrentConditionsResult> {
    const now = this.now();
    const requestedAt = query.at ?? now;
    validateRequestedAt(query.at, now);
    const sampleAt = nearestForecastHour(requestedAt);

    let forecast;
    try {
      forecast = await this.weather.getForecast({
        latitudeDegrees: query.observer.latitudeDegrees,
        longitudeDegrees: query.observer.longitudeDegrees,
        from: sampleAt,
        to: sampleAt,
      });
    } catch {
      throw new AppError(
        503,
        'CURRENT_CONDITIONS_UNAVAILABLE',
        'Current observation conditions are temporarily unavailable',
      );
    }

    const sample = nearestSample(forecast.hourly, sampleAt);
    if (!sample) {
      throw new AppError(
        503,
        'CURRENT_CONDITIONS_UNAVAILABLE',
        'Current observation conditions are temporarily unavailable',
      );
    }

    return toConditionsResult(sample, requestedAt, forecast.fetchedAt);
  }

  async getForecast(
    query: CurrentConditionsForecastQuery,
  ): Promise<CurrentConditionsForecastResult> {
    const now = this.now();
    const from = ceilForecastHour(now);
    const to = floorForecastHour(new Date(now.getTime() + MAX_CONDITIONS_FORECAST_HORIZON_MS));
    let forecast;
    try {
      forecast = await this.weather.getForecast({
        latitudeDegrees: query.observer.latitudeDegrees,
        longitudeDegrees: query.observer.longitudeDegrees,
        from,
        to,
      });
    } catch {
      throw new AppError(
        503,
        'CONDITIONS_FORECAST_UNAVAILABLE',
        'Observation weather forecast is temporarily unavailable',
      );
    }

    const hourly = forecast.hourly
      .filter((sample) => {
        const forecastTime = Date.parse(sample.forecastAt);
        return forecastTime >= from.getTime() && forecastTime <= to.getTime();
      })
      .map((sample) => toConditionsResult(sample, new Date(sample.forecastAt), forecast.fetchedAt));

    if (hourly.length === 0) {
      throw new AppError(
        503,
        'CONDITIONS_FORECAST_UNAVAILABLE',
        'Observation weather forecast is temporarily unavailable',
      );
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      fetchedAt: forecast.fetchedAt,
      hourly,
    };
  }
}

function validateRequestedAt(at: Date | undefined, now: Date): void {
  if (!at) return;
  const requestedAt = at.getTime();
  const currentTime = now.getTime();
  if (
    !Number.isFinite(requestedAt) ||
    requestedAt < currentTime ||
    requestedAt > currentTime + MAX_CONDITIONS_FORECAST_HORIZON_MS
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Requested observation time must be within the next seven days',
    );
  }
}

function nearestForecastHour(target: Date): Date {
  return new Date(Math.round(target.getTime() / ONE_HOUR_MS) * ONE_HOUR_MS);
}

function ceilForecastHour(target: Date): Date {
  return new Date(Math.ceil(target.getTime() / ONE_HOUR_MS) * ONE_HOUR_MS);
}

function floorForecastHour(target: Date): Date {
  return new Date(Math.floor(target.getTime() / ONE_HOUR_MS) * ONE_HOUR_MS);
}

function toConditionsResult(
  sample: HourlyWeatherConditions,
  requestedAt: Date,
  fetchedAt: string,
): CurrentConditionsResult {
  const factors = assessFactors(sample);
  return {
    requestedAt: requestedAt.toISOString(),
    observedAt: sample.forecastAt,
    fetchedAt,
    temperatureCelsius: sample.temperatureCelsius,
    relativeHumidityPercent: sample.relativeHumidityPercent,
    cloudCoverPercent: sample.cloudCoverPercent,
    precipitationProbabilityPercent: sample.precipitationProbabilityPercent,
    precipitationMillimeters: sample.precipitationMillimeters,
    visibilityMeters: sample.visibilityMeters,
    windSpeedKilometersPerHour: sample.windSpeedKilometersPerHour,
    rating: rate(factors),
    factors,
    skyLabel: skyLabel(sample.cloudCoverPercent),
    visibilityLabel: visibilityLabel(sample.visibilityMeters),
  };
}

function nearestSample(
  hourly: HourlyWeatherConditions[],
  target: Date,
): HourlyWeatherConditions | undefined {
  const closest = hourly.reduce<HourlyWeatherConditions | undefined>(
    (currentClosest, candidate) => {
      if (!currentClosest) return candidate;
      const closestDiff = Math.abs(Date.parse(currentClosest.forecastAt) - target.getTime());
      const candidateDiff = Math.abs(Date.parse(candidate.forecastAt) - target.getTime());
      return candidateDiff < closestDiff ? candidate : currentClosest;
    },
    undefined,
  );
  if (
    !closest ||
    Math.abs(Date.parse(closest.forecastAt) - target.getTime()) > MAX_SAMPLE_DISTANCE_MS
  ) {
    return undefined;
  }
  return closest;
}

function assessFactors(sample: HourlyWeatherConditions): CurrentConditionsFactor[] {
  const cloudStatus: CurrentConditionFactorStatus =
    sample.cloudCoverPercent <= CLOUD_COVER_CLEAR_MAX
      ? 'good'
      : sample.cloudCoverPercent <= CLOUD_COVER_PARTLY_MAX
        ? 'caution'
        : 'poor';
  const precipitationStatus: CurrentConditionFactorStatus =
    sample.precipitationProbabilityPercent <= PRECIPITATION_GOOD_MAX &&
    sample.precipitationMillimeters < 0.1
      ? 'good'
      : sample.precipitationProbabilityPercent <= PRECIPITATION_FAIR_MAX &&
          sample.precipitationMillimeters <= 1
        ? 'caution'
        : 'poor';
  const visibilityStatus: CurrentConditionFactorStatus =
    sample.visibilityMeters >= VISIBILITY_GOOD_METERS
      ? 'good'
      : sample.visibilityMeters >= VISIBILITY_FAIR_METERS
        ? 'caution'
        : 'poor';
  const windStatus: CurrentConditionFactorStatus =
    sample.windSpeedKilometersPerHour <= WIND_GOOD_MAX_KILOMETERS_PER_HOUR
      ? 'good'
      : sample.windSpeedKilometersPerHour <= WIND_FAIR_MAX_KILOMETERS_PER_HOUR
        ? 'caution'
        : 'poor';
  const humidityStatus: CurrentConditionFactorStatus =
    sample.relativeHumidityPercent <= HUMIDITY_GOOD_MAX_PERCENT
      ? 'good'
      : sample.relativeHumidityPercent <= HUMIDITY_FAIR_MAX_PERCENT
        ? 'caution'
        : 'poor';

  return [
    {
      code: 'cloud-cover',
      status: cloudStatus,
      summary: `${Math.round(sample.cloudCoverPercent)}% de cobertura de nuvens.`,
    },
    {
      code: 'precipitation',
      status: precipitationStatus,
      summary: `${Math.round(sample.precipitationProbabilityPercent)}% de chance de chuva; ${sample.precipitationMillimeters.toFixed(1)} mm previstos.`,
    },
    {
      code: 'visibility',
      status: visibilityStatus,
      summary: `Visibilidade horizontal estimada em ${formatDistance(sample.visibilityMeters)}.`,
    },
    {
      code: 'wind',
      status: windStatus,
      summary: `Vento de ${Math.round(sample.windSpeedKilometersPerHour)} km/h.`,
    },
    {
      code: 'humidity',
      status: humidityStatus,
      summary: `Umidade relativa de ${Math.round(sample.relativeHumidityPercent)}%; umidade alta pode favorecer orvalho no equipamento.`,
    },
  ];
}

function rate(factors: CurrentConditionsFactor[]): ObservationRating {
  const criticalFactors = new Set<CurrentConditionFactorCode>([
    'cloud-cover',
    'precipitation',
    'visibility',
    'wind',
  ]);
  if (factors.some((factor) => criticalFactors.has(factor.code) && factor.status === 'poor')) {
    return 'poor';
  }
  return factors.every((factor) => factor.status === 'good') ? 'good' : 'fair';
}

function formatDistance(meters: number): string {
  return meters >= 1_000 ? `${(meters / 1_000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function skyLabel(cloudCoverPercent: number): string {
  if (cloudCoverPercent <= CLOUD_COVER_CLEAR_MAX) return 'Céu limpo';
  if (cloudCoverPercent <= CLOUD_COVER_PARTLY_MAX) return 'Parcialmente nublado';
  return 'Nublado';
}

function visibilityLabel(visibilityMeters: number): string {
  if (visibilityMeters >= VISIBILITY_GOOD_METERS) return 'Ótima visibilidade';
  if (visibilityMeters >= VISIBILITY_FAIR_METERS) return 'Boa visibilidade';
  return 'Visibilidade reduzida';
}
