export interface VisibilityWeatherConditions {
  cloudCoverPercent?: number;
  precipitationProbabilityPercent?: number;
  visibilityMeters?: number;
}

export interface VisibilityMoonConditions {
  illuminationFraction: number;
  angularSeparationDegrees?: number;
}

export interface VisibilitySample {
  observedAt: string;
  altitudeDegrees: number;
  moon?: VisibilityMoonConditions;
  weather?: VisibilityWeatherConditions;
}

export interface VisibilityThresholds {
  minimumAltitudeDegrees: number;
  maximumCloudCoverPercent?: number;
  maximumPrecipitationProbabilityPercent?: number;
  minimumVisibilityMeters?: number;
  maximumMoonIlluminationFraction?: number;
  minimumMoonSeparationDegrees?: number;
}

export type VisibilityFactorCode = 'altitude' | 'moon' | 'weather';
export type VisibilityFactorStatus = 'favorable' | 'unfavorable' | 'unavailable';

export interface VisibilityFactor {
  code: VisibilityFactorCode;
  status: VisibilityFactorStatus;
  summary: string;
}

export interface VisibilityEvaluation {
  favorable: boolean;
  consideredAt: string | null;
  favorableFrom: string | null;
  favorableTo: string | null;
  factors: VisibilityFactor[];
}

export interface EvaluateVisibilityInput {
  windowFrom: string;
  windowTo: string;
  thresholds: VisibilityThresholds;
  samples: VisibilitySample[];
}

interface ResolvedThresholds {
  minimumAltitudeDegrees: number;
  maximumCloudCoverPercent: number;
  maximumPrecipitationProbabilityPercent: number;
  minimumVisibilityMeters: number;
  maximumMoonIlluminationFraction: number;
  minimumMoonSeparationDegrees: number;
}

interface AssessedSample {
  sample: VisibilitySample;
  favorable: boolean;
  factors: VisibilityFactor[];
}

const DEFAULT_THRESHOLDS: Omit<ResolvedThresholds, 'minimumAltitudeDegrees'> = {
  maximumCloudCoverPercent: 60,
  maximumPrecipitationProbabilityPercent: 30,
  minimumVisibilityMeters: 5_000,
  maximumMoonIlluminationFraction: 0.75,
  minimumMoonSeparationDegrees: 45,
};

export class ObservationVisibilityService {
  evaluate(input: EvaluateVisibilityInput): VisibilityEvaluation {
    const windowFrom = parseDate(input.windowFrom, 'windowFrom');
    const windowTo = parseDate(input.windowTo, 'windowTo');
    if (windowFrom.getTime() >= windowTo.getTime()) {
      throw new RangeError('windowFrom must be earlier than windowTo');
    }

    const thresholds = resolveThresholds(input.thresholds);
    const samples = input.samples
      .map((sample) => ({ sample, observedAt: parseDate(sample.observedAt, 'sample.observedAt') }))
      .filter(
        ({ observedAt }) =>
          observedAt.getTime() >= windowFrom.getTime() &&
          observedAt.getTime() <= windowTo.getTime(),
      )
      .sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime())
      .map(({ sample }) => assessSample(sample, thresholds));

    if (samples.length === 0) {
      return {
        favorable: false,
        consideredAt: null,
        favorableFrom: null,
        favorableTo: null,
        factors: [
          unavailableFactor('altitude', 'Nenhuma amostra de altitude disponível na janela.'),
          unavailableFactor('moon', 'Condições lunares não disponíveis na janela.'),
          unavailableFactor('weather', 'Condições meteorológicas não disponíveis na janela.'),
        ],
      };
    }

    const favorableSamples = samples.filter((sample) => sample.favorable);
    const candidates = favorableSamples.length > 0 ? favorableSamples : samples;
    const representative = candidates.reduce((best, current) =>
      current.sample.altitudeDegrees > best.sample.altitudeDegrees ? current : best,
    );
    const recommendedRun = favorableRuns(samples).find((run) => run.includes(representative));

    return {
      favorable: favorableSamples.length > 0,
      consideredAt: representative.sample.observedAt,
      favorableFrom: recommendedRun?.at(0)?.sample.observedAt ?? null,
      favorableTo: recommendedRun?.at(-1)?.sample.observedAt ?? null,
      factors: representative.factors,
    };
  }
}

function favorableRuns(samples: AssessedSample[]): AssessedSample[][] {
  const runs: AssessedSample[][] = [];
  let activeRun: AssessedSample[] | null = null;
  for (const sample of samples) {
    if (!sample.favorable) {
      activeRun = null;
      continue;
    }
    if (!activeRun) {
      activeRun = [];
      runs.push(activeRun);
    }
    activeRun.push(sample);
  }
  return runs;
}

function resolveThresholds(thresholds: VisibilityThresholds): ResolvedThresholds {
  const resolved = {
    minimumAltitudeDegrees: thresholds.minimumAltitudeDegrees,
    maximumCloudCoverPercent:
      thresholds.maximumCloudCoverPercent ?? DEFAULT_THRESHOLDS.maximumCloudCoverPercent,
    maximumPrecipitationProbabilityPercent:
      thresholds.maximumPrecipitationProbabilityPercent ??
      DEFAULT_THRESHOLDS.maximumPrecipitationProbabilityPercent,
    minimumVisibilityMeters:
      thresholds.minimumVisibilityMeters ?? DEFAULT_THRESHOLDS.minimumVisibilityMeters,
    maximumMoonIlluminationFraction:
      thresholds.maximumMoonIlluminationFraction ??
      DEFAULT_THRESHOLDS.maximumMoonIlluminationFraction,
    minimumMoonSeparationDegrees:
      thresholds.minimumMoonSeparationDegrees ?? DEFAULT_THRESHOLDS.minimumMoonSeparationDegrees,
  };

  assertRange(resolved.minimumAltitudeDegrees, -90, 90, 'minimumAltitudeDegrees');
  assertRange(resolved.maximumCloudCoverPercent, 0, 100, 'maximumCloudCoverPercent');
  assertRange(
    resolved.maximumPrecipitationProbabilityPercent,
    0,
    100,
    'maximumPrecipitationProbabilityPercent',
  );
  assertMinimum(resolved.minimumVisibilityMeters, 0, 'minimumVisibilityMeters');
  assertRange(resolved.maximumMoonIlluminationFraction, 0, 1, 'maximumMoonIlluminationFraction');
  assertRange(resolved.minimumMoonSeparationDegrees, 0, 180, 'minimumMoonSeparationDegrees');
  return resolved;
}

function assessSample(sample: VisibilitySample, thresholds: ResolvedThresholds): AssessedSample {
  assertRange(sample.altitudeDegrees, -90, 90, 'sample.altitudeDegrees');
  const factors = [
    assessAltitude(sample.altitudeDegrees, thresholds.minimumAltitudeDegrees),
    assessMoon(sample.moon, thresholds),
    assessWeather(sample.weather, thresholds),
  ];
  return {
    sample,
    favorable: factors.every((factor) => factor.status !== 'unfavorable'),
    factors,
  };
}

function assessAltitude(altitude: number, minimum: number): VisibilityFactor {
  return {
    code: 'altitude',
    status: altitude >= minimum ? 'favorable' : 'unfavorable',
    summary: `Altitude ${formatNumber(altitude)}°; mínimo configurado ${formatNumber(minimum)}°.`,
  };
}

function assessMoon(
  moon: VisibilityMoonConditions | undefined,
  thresholds: ResolvedThresholds,
): VisibilityFactor {
  if (!moon) {
    return unavailableFactor('moon', 'Condições lunares não disponíveis para esta amostra.');
  }
  assertRange(moon.illuminationFraction, 0, 1, 'sample.moon.illuminationFraction');
  if (moon.angularSeparationDegrees !== undefined) {
    assertRange(moon.angularSeparationDegrees, 0, 180, 'sample.moon.angularSeparationDegrees');
  }

  const illuminationFavorable =
    moon.illuminationFraction <= thresholds.maximumMoonIlluminationFraction;
  const separationFavorable =
    moon.angularSeparationDegrees !== undefined &&
    moon.angularSeparationDegrees >= thresholds.minimumMoonSeparationDegrees;
  const separationSummary =
    moon.angularSeparationDegrees === undefined
      ? 'separação angular indisponível'
      : `separação ${formatNumber(moon.angularSeparationDegrees)}°`;
  return {
    code: 'moon',
    status: illuminationFavorable || separationFavorable ? 'favorable' : 'unfavorable',
    summary: `Iluminação lunar ${formatNumber(moon.illuminationFraction * 100)}%; ${separationSummary}.`,
  };
}

function assessWeather(
  weather: VisibilityWeatherConditions | undefined,
  thresholds: ResolvedThresholds,
): VisibilityFactor {
  if (!weather || Object.values(weather).every((value) => value === undefined)) {
    return unavailableFactor(
      'weather',
      'Condições meteorológicas não disponíveis para esta amostra.',
    );
  }

  const observations: string[] = [];
  const checks: boolean[] = [];
  if (weather.cloudCoverPercent !== undefined) {
    assertRange(weather.cloudCoverPercent, 0, 100, 'sample.weather.cloudCoverPercent');
    checks.push(weather.cloudCoverPercent <= thresholds.maximumCloudCoverPercent);
    observations.push(`nuvens ${formatNumber(weather.cloudCoverPercent)}%`);
  }
  if (weather.precipitationProbabilityPercent !== undefined) {
    assertRange(
      weather.precipitationProbabilityPercent,
      0,
      100,
      'sample.weather.precipitationProbabilityPercent',
    );
    checks.push(
      weather.precipitationProbabilityPercent <= thresholds.maximumPrecipitationProbabilityPercent,
    );
    observations.push(
      `probabilidade de precipitação ${formatNumber(weather.precipitationProbabilityPercent)}%`,
    );
  }
  if (weather.visibilityMeters !== undefined) {
    assertMinimum(weather.visibilityMeters, 0, 'sample.weather.visibilityMeters');
    checks.push(weather.visibilityMeters >= thresholds.minimumVisibilityMeters);
    observations.push(`visibilidade ${formatNumber(weather.visibilityMeters)} m`);
  }
  return {
    code: 'weather',
    status: checks.every(Boolean) ? 'favorable' : 'unfavorable',
    summary: `${observations.join('; ')}.`,
  };
}

function unavailableFactor(code: VisibilityFactorCode, summary: string): VisibilityFactor {
  return { code, status: 'unavailable', summary };
}

function parseDate(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new RangeError(`${field} must be a valid ISO date`);
  return parsed;
}

function assertRange(value: number, minimum: number, maximum: number, field: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${field} must be between ${minimum} and ${maximum}`);
  }
}

function assertMinimum(value: number, minimum: number, field: string): void {
  if (!Number.isFinite(value) || value < minimum) {
    throw new RangeError(`${field} must be greater than or equal to ${minimum}`);
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}
