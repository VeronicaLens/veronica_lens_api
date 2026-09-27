import type { ObserverLocation } from '../astronomy/astronomy-provider.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { HourlyWeatherConditions, WeatherProvider } from '../weather/index.js';

export interface CurrentConditionsQuery {
  observer: ObserverLocation;
}

export type ObservationRating = 'good' | 'fair' | 'poor';

export interface CurrentConditionsResult {
  observedAt: string;
  temperatureCelsius: number;
  cloudCoverPercent: number;
  precipitationProbabilityPercent: number;
  visibilityMeters: number;
  rating: ObservationRating;
  skyLabel: string;
  visibilityLabel: string;
}

export interface CurrentConditionsPort {
  getCurrent(query: CurrentConditionsQuery): Promise<CurrentConditionsResult>;
}

const FORECAST_WINDOW_MS = 3 * 60 * 60 * 1_000;
const CLOUD_COVER_CLEAR_MAX = 20;
const CLOUD_COVER_PARTLY_MAX = 60;
const PRECIPITATION_GOOD_MAX = 20;
const PRECIPITATION_FAIR_MAX = 50;
const VISIBILITY_GOOD_METERS = 10_000;
const VISIBILITY_FAIR_METERS = 5_000;

export class CurrentConditionsService implements CurrentConditionsPort {
  constructor(
    private readonly weather: WeatherProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getCurrent(query: CurrentConditionsQuery): Promise<CurrentConditionsResult> {
    const from = this.now();
    const to = new Date(from.getTime() + FORECAST_WINDOW_MS);

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
        'CURRENT_CONDITIONS_UNAVAILABLE',
        'Current observation conditions are temporarily unavailable',
      );
    }

    const sample = nearestSample(forecast.hourly, from);
    if (!sample) {
      throw new AppError(
        503,
        'CURRENT_CONDITIONS_UNAVAILABLE',
        'Current observation conditions are temporarily unavailable',
      );
    }

    return {
      observedAt: sample.forecastAt,
      temperatureCelsius: sample.temperatureCelsius,
      cloudCoverPercent: sample.cloudCoverPercent,
      precipitationProbabilityPercent: sample.precipitationProbabilityPercent,
      visibilityMeters: sample.visibilityMeters,
      rating: rate(sample),
      skyLabel: skyLabel(sample.cloudCoverPercent),
      visibilityLabel: visibilityLabel(sample.visibilityMeters),
    };
  }
}

function nearestSample(
  hourly: HourlyWeatherConditions[],
  target: Date,
): HourlyWeatherConditions | undefined {
  return hourly.reduce<HourlyWeatherConditions | undefined>((closest, candidate) => {
    if (!closest) return candidate;
    const closestDiff = Math.abs(Date.parse(closest.forecastAt) - target.getTime());
    const candidateDiff = Math.abs(Date.parse(candidate.forecastAt) - target.getTime());
    return candidateDiff < closestDiff ? candidate : closest;
  }, undefined);
}

function rate(sample: HourlyWeatherConditions): ObservationRating {
  if (
    sample.cloudCoverPercent <= CLOUD_COVER_CLEAR_MAX &&
    sample.precipitationProbabilityPercent <= PRECIPITATION_GOOD_MAX &&
    sample.visibilityMeters >= VISIBILITY_GOOD_METERS
  ) {
    return 'good';
  }
  if (
    sample.cloudCoverPercent <= CLOUD_COVER_PARTLY_MAX &&
    sample.precipitationProbabilityPercent <= PRECIPITATION_FAIR_MAX &&
    sample.visibilityMeters >= VISIBILITY_FAIR_METERS
  ) {
    return 'fair';
  }
  return 'poor';
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
