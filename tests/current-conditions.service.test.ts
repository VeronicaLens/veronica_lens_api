import { describe, expect, it, vi } from 'vitest';

import { CurrentConditionsService } from '../src/modules/conditions/index.js';
import type { WeatherProvider } from '../src/modules/weather/index.js';

const observer = {
  latitudeDegrees: -23.5505,
  longitudeDegrees: -46.6333,
  elevationMeters: 760,
};

function weatherProvider(
  overrides: Partial<{
    cloudCoverPercent: number;
    precipitationProbabilityPercent: number;
    visibilityMeters: number;
    temperatureCelsius: number;
  }>,
  forecastAt = '2026-10-12T22:00:00.000Z',
): WeatherProvider {
  const getForecast: WeatherProvider['getForecast'] = () =>
    Promise.resolve({
      location: { ...observer },
      timezone: 'UTC',
      fetchedAt: forecastAt,
      hourly: [
        {
          forecastAt,
          temperatureCelsius: overrides.temperatureCelsius ?? 18,
          relativeHumidityPercent: 40,
          precipitationProbabilityPercent: overrides.precipitationProbabilityPercent ?? 0,
          precipitationMillimeters: 0,
          cloudCoverPercent: overrides.cloudCoverPercent ?? 0,
          visibilityMeters: overrides.visibilityMeters ?? 15_000,
          windSpeedKilometersPerHour: 5,
        },
      ],
    });
  return { getForecast: vi.fn(getForecast) };
}

describe('CurrentConditionsService', () => {
  it('rates clear, low-precipitation, high-visibility conditions as good', async () => {
    const now = new Date('2026-10-12T22:00:00.000Z');
    const service = new CurrentConditionsService(
      weatherProvider({ cloudCoverPercent: 5, visibilityMeters: 15_000 }, now.toISOString()),
      () => now,
    );

    const result = await service.getCurrent({ observer });

    expect(result).toMatchObject({
      rating: 'good',
      skyLabel: 'Céu limpo',
      visibilityLabel: 'Ótima visibilidade',
      temperatureCelsius: 18,
    });
  });

  it('rates moderate cloud cover and visibility as fair', async () => {
    const now = new Date('2026-10-12T22:00:00.000Z');
    const service = new CurrentConditionsService(
      weatherProvider(
        { cloudCoverPercent: 45, visibilityMeters: 7_000, precipitationProbabilityPercent: 30 },
        now.toISOString(),
      ),
      () => now,
    );

    const result = await service.getCurrent({ observer });

    expect(result.rating).toBe('fair');
    expect(result.skyLabel).toBe('Parcialmente nublado');
    expect(result.visibilityLabel).toBe('Boa visibilidade');
  });

  it('rates heavy cloud cover as poor', async () => {
    const now = new Date('2026-10-12T22:00:00.000Z');
    const service = new CurrentConditionsService(
      weatherProvider({ cloudCoverPercent: 90, visibilityMeters: 2_000 }, now.toISOString()),
      () => now,
    );

    const result = await service.getCurrent({ observer });

    expect(result.rating).toBe('poor');
    expect(result.skyLabel).toBe('Nublado');
    expect(result.visibilityLabel).toBe('Visibilidade reduzida');
  });

  it('throws a 503 app error when the weather provider fails', async () => {
    const provider: WeatherProvider = {
      getForecast: vi.fn().mockRejectedValue(new Error('unavailable')),
    };
    const service = new CurrentConditionsService(provider);

    await expect(service.getCurrent({ observer })).rejects.toMatchObject({
      statusCode: 503,
      code: 'CURRENT_CONDITIONS_UNAVAILABLE',
    });
  });
});
