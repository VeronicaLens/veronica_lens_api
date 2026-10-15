import type { ObserverLocation } from '../astronomy/astronomy-provider.js';
import type { SkyGuideModelPort } from '../sky-guide/sky-guide.model.js';
import type { HourlyWeatherConditions, WeatherProvider } from '../weather/index.js';
import {
  ObservationVisibilityService,
  type VisibilityEvaluation,
  type VisibilityFactor,
  type VisibilitySample,
} from './visibility.service.js';

const SAMPLE_INTERVAL_MS = 2 * 60 * 60 * 1_000;
const MAX_WEATHER_DISTANCE_MS = 60 * 60 * 1_000;
const MINIMUM_POSITION_SAMPLES = 2;
const POSITION_REQUEST_CONCURRENCY = 3;

export interface ObservationRecommendationQuery {
  objectId: string;
  windowFrom: Date;
  windowTo: Date;
  observer: ObserverLocation;
  minimumAltitudeDegrees: number;
}

export type ObservationRecommendationStatus =
  'recommended' | 'no_favorable_window' | 'insufficient_data';

export interface ObservationRecommendationResult {
  objectId: string;
  objectName: string | null;
  status: ObservationRecommendationStatus;
  recommendedWindow: {
    from: string;
    to: string;
    consideredAt: string;
  } | null;
  factors: VisibilityFactor[];
  summary: string;
  meta: {
    evaluatedSamples: number;
    sampleIntervalMinutes: number;
    weatherAvailable: boolean;
  };
}

export interface ObservationRecommendationPort {
  recommend(query: ObservationRecommendationQuery): Promise<ObservationRecommendationResult>;
}

interface VisibilityEvaluator {
  evaluate(input: {
    windowFrom: string;
    windowTo: string;
    thresholds: { minimumAltitudeDegrees: number };
    samples: VisibilitySample[];
  }): VisibilityEvaluation;
}

export class ObservationRecommendationService implements ObservationRecommendationPort {
  constructor(
    private readonly positions: SkyGuideModelPort,
    private readonly weather: WeatherProvider,
    private readonly visibility: VisibilityEvaluator = new ObservationVisibilityService(),
  ) {}

  async recommend(query: ObservationRecommendationQuery): Promise<ObservationRecommendationResult> {
    validateQuery(query);
    const instants = buildSampleInstants(query.windowFrom, query.windowTo);
    const [positionSamples, weatherConditions] = await Promise.all([
      this.loadPositions(query, instants),
      this.loadWeather(query),
    ]);
    const weatherAvailable = weatherConditions.length > 0;
    const samples = positionSamples.map(({ observedAt, altitudeDegrees }) => {
      const weather = nearestWeather(observedAt, weatherConditions);
      return {
        observedAt,
        altitudeDegrees,
        ...(weather
          ? {
              weather: {
                cloudCoverPercent: weather.cloudCoverPercent,
                precipitationProbabilityPercent: weather.precipitationProbabilityPercent,
                visibilityMeters: weather.visibilityMeters,
              },
            }
          : {}),
      };
    });
    const objectName = positionSamples.at(0)?.objectName ?? null;
    const meta = {
      evaluatedSamples: samples.length,
      sampleIntervalMinutes: SAMPLE_INTERVAL_MS / 60_000,
      weatherAvailable,
    };

    if (samples.length < MINIMUM_POSITION_SAMPLES) {
      return {
        objectId: query.objectId,
        objectName,
        status: 'insufficient_data',
        recommendedWindow: null,
        factors: [],
        summary: 'Não há dados de posição suficientes para recomendar uma janela com segurança.',
        meta,
      };
    }

    const evaluation = this.visibility.evaluate({
      windowFrom: query.windowFrom.toISOString(),
      windowTo: query.windowTo.toISOString(),
      thresholds: { minimumAltitudeDegrees: query.minimumAltitudeDegrees },
      samples,
    });

    if (
      !evaluation.favorable ||
      !evaluation.favorableFrom ||
      !evaluation.favorableTo ||
      !evaluation.consideredAt
    ) {
      return {
        objectId: query.objectId,
        objectName,
        status: 'no_favorable_window',
        recommendedWindow: null,
        factors: evaluation.factors,
        summary: summarizeUnavailableWindow(evaluation.factors, weatherAvailable),
        meta,
      };
    }

    return {
      objectId: query.objectId,
      objectName,
      status: 'recommended',
      recommendedWindow: {
        from: evaluation.favorableFrom,
        to: evaluation.favorableTo,
        consideredAt: evaluation.consideredAt,
      },
      factors: evaluation.factors,
      summary: summarizeRecommendation(evaluation.factors, weatherAvailable),
      meta,
    };
  }

  private async loadPositions(query: ObservationRecommendationQuery, instants: Date[]) {
    return mapWithConcurrency(instants, POSITION_REQUEST_CONCURRENCY, async (observedAt) => {
      const result = await this.positions.getPositions({
        objectIds: [query.objectId],
        observedAt,
        observer: query.observer,
      });
      const position = result.positions.at(0);
      return position
        ? {
            observedAt: position.observedAt,
            altitudeDegrees: position.horizontal.altitudeDegrees,
            objectName: position.name,
          }
        : undefined;
    }).then((samples) => samples.filter((sample) => sample !== undefined));
  }

  private async loadWeather(
    query: ObservationRecommendationQuery,
  ): Promise<HourlyWeatherConditions[]> {
    try {
      const forecast = await this.weather.getForecast({
        latitudeDegrees: query.observer.latitudeDegrees,
        longitudeDegrees: query.observer.longitudeDegrees,
        from: query.windowFrom,
        to: query.windowTo,
      });
      return forecast.hourly;
    } catch {
      return [];
    }
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      if (item !== undefined) results[index] = await mapper(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function validateQuery(query: ObservationRecommendationQuery): void {
  const from = query.windowFrom.getTime();
  const to = query.windowTo.getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    throw new RangeError('Observation recommendation window is invalid');
  }
  if (to - from > 24 * 60 * 60 * 1_000) {
    throw new RangeError('Observation recommendation window cannot exceed 24 hours');
  }
  if (
    !Number.isFinite(query.minimumAltitudeDegrees) ||
    query.minimumAltitudeDegrees < 0 ||
    query.minimumAltitudeDegrees > 90
  ) {
    throw new RangeError('Minimum altitude must be between 0 and 90 degrees');
  }
}

function buildSampleInstants(from: Date, to: Date): Date[] {
  const instants = [new Date(from)];
  for (let timestamp = from.getTime() + SAMPLE_INTERVAL_MS; timestamp < to.getTime();) {
    instants.push(new Date(timestamp));
    timestamp += SAMPLE_INTERVAL_MS;
  }
  if (to.getTime() > from.getTime()) instants.push(new Date(to));
  return instants;
}

function nearestWeather(
  observedAt: string,
  conditions: HourlyWeatherConditions[],
): HourlyWeatherConditions | undefined {
  const target = Date.parse(observedAt);
  let nearest: HourlyWeatherConditions | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const condition of conditions) {
    const candidateDistance = Math.abs(Date.parse(condition.forecastAt) - target);
    if (candidateDistance < distance) {
      nearest = condition;
      distance = candidateDistance;
    }
  }
  return distance <= MAX_WEATHER_DISTANCE_MS ? nearest : undefined;
}

function summarizeRecommendation(factors: VisibilityFactor[], weatherAvailable: boolean): string {
  const favorable = factors
    .filter((factor) => factor.status === 'favorable')
    .map((factor) => factor.summary)
    .join(' ');
  const limitation = weatherAvailable
    ? ''
    : ' Previsão climática indisponível; recomendação baseada na posição do astro.';
  return `Janela favorável encontrada. ${favorable}${limitation}`.trim();
}

function summarizeUnavailableWindow(
  factors: VisibilityFactor[],
  weatherAvailable: boolean,
): string {
  const unfavorable = factors
    .filter((factor) => factor.status === 'unfavorable')
    .map((factor) => factor.summary)
    .join(' ');
  const limitation = weatherAvailable ? '' : ' A previsão climática não estava disponível.';
  return `Nenhuma janela favorável foi encontrada. ${unfavorable}${limitation}`.trim();
}
