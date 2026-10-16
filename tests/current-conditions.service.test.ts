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
    precipitationMillimeters: number;
    visibilityMeters: number;
    temperatureCelsius: number;
    relativeHumidityPercent: number;
    windSpeedKilometersPerHour: number;
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
          relativeHumidityPercent: overrides.relativeHumidityPercent ?? 40,
          precipitationProbabilityPercent: overrides.precipitationProbabilityPercent ?? 0,
          precipitationMillimeters: overrides.precipitationMillimeters ?? 0,
          cloudCoverPercent: overrides.cloudCoverPercent ?? 0,
          visibilityMeters: overrides.visibilityMeters ?? 15_000,
          windSpeedKilometersPerHour: overrides.windSpeedKilometersPerHour ?? 5,
        },
      ],
    });
  return { getForecast: vi.fn(getForecast) };
}

describe('CurrentConditionsService', () => {
  it('returns bounded hourly forecasts with observation assessment factors', async () => {
    const now = new Date('2026-10-12T22:30:00.000Z');
    const fetchedAt = '2026-10-12T22:31:00.000Z';
    const sample = (at: Date) => ({
      forecastAt: at.toISOString(),
      temperatureCelsius: 18,
      relativeHumidityPercent: 40,
      precipitationProbabilityPercent: 5,
      precipitationMillimeters: 0,
      cloudCoverPercent: 5,
      visibilityMeters: 15_000,
      windSpeedKilometersPerHour: 5,
    });
    const getForecast: WeatherProvider['getForecast'] = ({ from, to }) =>
      Promise.resolve({
        location: { ...observer },
        timezone: 'UTC',
        fetchedAt,
        hourly: [sample(from), sample(to)],
      });
    const getForecastMock = vi.fn(getForecast);
    const provider: WeatherProvider = { getForecast: getForecastMock };
    const service = new CurrentConditionsService(provider, () => now);

    const result = await service.getForecast({ observer });

    expect(result).toMatchObject({
      from: '2026-10-12T23:00:00.000Z',
      to: '2026-10-19T22:00:00.000Z',
      fetchedAt,
    });
    expect(result.hourly).toHaveLength(2);
    expect(result.hourly[0]).toMatchObject({
      observedAt: '2026-10-12T23:00:00.000Z',
      rating: 'good',
      factors: expect.arrayContaining([
        expect.objectContaining({ code: 'cloud-cover', status: 'good' }),
      ]) as unknown,
    });
    expect(getForecastMock).toHaveBeenCalledWith({
      latitudeDegrees: observer.latitudeDegrees,
      longitudeDegrees: observer.longitudeDegrees,
      from: new Date('2026-10-12T23:00:00.000Z'),
      to: new Date('2026-10-19T22:00:00.000Z'),
    });
  });

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
      factors: [
        { code: 'cloud-cover', status: 'good' },
        { code: 'precipitation', status: 'good' },
        { code: 'visibility', status: 'good' },
        { code: 'wind', status: 'good' },
        { code: 'humidity', status: 'good' },
      ],
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

  it('evaluates the nearest hourly forecast sample for a requested future time', async () => {
    const now = new Date('2026-10-12T20:00:00.000Z');
    const provider = weatherProvider({}, '2026-10-12T23:00:00.000Z');
    const service = new CurrentConditionsService(provider, () => now);
    const requestedAt = new Date('2026-10-12T22:35:00.000Z');

    const result = await service.getCurrent({ observer, at: requestedAt });

    expect(result).toMatchObject({
      requestedAt: requestedAt.toISOString(),
      observedAt: '2026-10-12T23:00:00.000Z',
      fetchedAt: '2026-10-12T23:00:00.000Z',
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- asserting calls on a vi.fn mock.
    expect(provider.getForecast).toHaveBeenCalledWith({
      latitudeDegrees: observer.latitudeDegrees,
      longitudeDegrees: observer.longitudeDegrees,
      from: new Date('2026-10-12T23:00:00.000Z'),
      to: new Date('2026-10-12T23:00:00.000Z'),
    });
  });

  it('includes wind and humidity when classifying conditions', async () => {
    const now = new Date('2026-10-12T22:00:00.000Z');
    const service = new CurrentConditionsService(
      weatherProvider(
        {
          windSpeedKilometersPerHour: 40,
          relativeHumidityPercent: 95,
        },
        now.toISOString(),
      ),
      () => now,
    );

    const result = await service.getCurrent({ observer });

    expect(result.rating).toBe('poor');
    expect(result.factors).toContainEqual(
      expect.objectContaining({ code: 'wind', status: 'poor' }),
    );
    expect(result.factors).toContainEqual(
      expect.objectContaining({ code: 'humidity', status: 'poor' }),
    );
  });

  it('rejects requested times outside the next seven days', async () => {
    const now = new Date('2026-10-12T22:00:00.000Z');
    const service = new CurrentConditionsService(weatherProvider({}), () => now);

    await expect(
      service.getCurrent({
        observer,
        at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000 + 1),
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    await expect(
      service.getCurrent({ observer, at: new Date(now.getTime() - 1) }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  });

  it('does not use a forecast sample more than 30 minutes from the requested hour', async () => {
    const now = new Date('2026-10-12T22:00:00.000Z');
    const service = new CurrentConditionsService(
      weatherProvider({}, '2026-10-12T21:00:00.000Z'),
      () => now,
    );

    await expect(service.getCurrent({ observer })).rejects.toMatchObject({
      statusCode: 503,
      code: 'CURRENT_CONDITIONS_UNAVAILABLE',
    });
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
