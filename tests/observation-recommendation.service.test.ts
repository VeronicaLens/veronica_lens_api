import { describe, expect, it, vi } from 'vitest';

import type { SkyGuideModelPort } from '../src/modules/sky-guide/sky-guide.model.js';
import type { WeatherProvider } from '../src/modules/weather/index.js';
import { ObservationRecommendationService } from '../src/modules/planning/index.js';

const query = {
  objectId: 'sirius',
  windowFrom: new Date('2026-10-12T22:00:00.000Z'),
  windowTo: new Date('2026-10-13T02:00:00.000Z'),
  observer: {
    latitudeDegrees: -23.5505,
    longitudeDegrees: -46.6333,
    elevationMeters: 760,
  },
  minimumAltitudeDegrees: 30,
};

function positionSource(altitudes: Record<string, number>): SkyGuideModelPort {
  const getPositions: SkyGuideModelPort['getPositions'] = ({ objectIds, observedAt }) => {
    const altitude = altitudes[observedAt.toISOString()];
    return Promise.resolve({
      positions:
        altitude === undefined
          ? []
          : [
              {
                id: objectIds[0] ?? 'sirius',
                name: 'Sirius',
                type: 'star',
                magnitude: -1.46,
                observedAt: observedAt.toISOString(),
                horizontal: { altitudeDegrees: altitude, azimuthDegrees: 180 },
              },
            ],
      unavailableObjectIds: altitude === undefined ? objectIds : [],
    });
  };
  return {
    getPositions: vi.fn(getPositions),
  };
}

function weatherProvider(cloudCoverPercent: number): WeatherProvider {
  const getForecast: WeatherProvider['getForecast'] = ({
    latitudeDegrees,
    longitudeDegrees,
    from,
  }) =>
    Promise.resolve({
      location: { latitudeDegrees, longitudeDegrees, elevationMeters: 760 },
      timezone: 'UTC',
      fetchedAt: from.toISOString(),
      hourly: [0, 2, 4].map((hourOffset) => ({
        forecastAt: new Date(from.getTime() + hourOffset * 60 * 60 * 1_000).toISOString(),
        temperatureCelsius: 16,
        relativeHumidityPercent: 45,
        precipitationProbabilityPercent: 5,
        precipitationMillimeters: 0,
        cloudCoverPercent,
        visibilityMeters: 15_000,
        windSpeedKilometersPerHour: 8,
      })),
    });
  return {
    getForecast: vi.fn(getForecast),
  };
}

describe('ObservationRecommendationService', () => {
  it('recommends the favorable part of the requested window with position and weather factors', async () => {
    const service = new ObservationRecommendationService(
      positionSource({
        '2026-10-12T22:00:00.000Z': 10,
        '2026-10-13T00:00:00.000Z': 55,
        '2026-10-13T02:00:00.000Z': 42,
      }),
      weatherProvider(15),
    );

    const result = await service.recommend(query);

    expect(result).toMatchObject({
      objectId: 'sirius',
      objectName: 'Sirius',
      status: 'recommended',
      recommendedWindow: {
        from: '2026-10-13T00:00:00.000Z',
        to: '2026-10-13T02:00:00.000Z',
        consideredAt: '2026-10-13T00:00:00.000Z',
      },
      meta: { evaluatedSamples: 3, sampleIntervalMinutes: 120, weatherAvailable: true },
    });
    expect(result.factors).toContainEqual(
      expect.objectContaining({ code: 'weather', status: 'favorable' }),
    );
  });

  it('does not recommend a false window when available weather is unfavorable', async () => {
    const service = new ObservationRecommendationService(
      positionSource({
        '2026-10-12T22:00:00.000Z': 45,
        '2026-10-13T00:00:00.000Z': 55,
        '2026-10-13T02:00:00.000Z': 42,
      }),
      weatherProvider(95),
    );

    const result = await service.recommend(query);

    expect(result.status).toBe('no_favorable_window');
    expect(result.recommendedWindow).toBeNull();
    expect(result.summary).toContain('Nenhuma janela favorável');
  });

  it('signals insufficient position data and omits a recommendation', async () => {
    const unavailableWeather: WeatherProvider = {
      getForecast: vi.fn().mockRejectedValue(new Error('forecast unavailable')),
    };
    const service = new ObservationRecommendationService(positionSource({}), unavailableWeather);

    const result = await service.recommend(query);

    expect(result).toMatchObject({
      status: 'insufficient_data',
      recommendedWindow: null,
      objectName: null,
      meta: { evaluatedSamples: 0, weatherAvailable: false },
    });
    expect(result.summary).toContain('dados de posição suficientes');
  });

  it('rejects an invalid domain window before consulting providers', async () => {
    const positions = positionSource({});
    const weather = weatherProvider(10);
    const service = new ObservationRecommendationService(positions, weather);

    await expect(
      service.recommend({ ...query, windowTo: new Date(query.windowFrom) }),
    ).rejects.toThrow('window is invalid');
  });
});
