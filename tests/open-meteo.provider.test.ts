import { describe, expect, it, vi } from 'vitest';

import { OpenMeteoWeatherProvider } from '../src/modules/weather/index.js';
import type { WeatherProviderError } from '../src/modules/weather/index.js';

const query = {
  latitudeDegrees: -23.5505,
  longitudeDegrees: -46.6333,
  from: new Date('2026-09-20T20:00:00.000Z'),
  to: new Date('2026-09-20T21:00:00.000Z'),
};

function validResponse(): Response {
  return Response.json({
    latitude: -23.5,
    longitude: -46.625,
    elevation: 760,
    timezone: 'GMT',
    hourly: {
      time: ['2026-09-20T19:00', '2026-09-20T20:00', '2026-09-20T21:00'],
      temperature_2m: [18.2, 17.5, 16.9],
      relative_humidity_2m: [61, 64, 67],
      precipitation_probability: [8, 5, 4],
      precipitation: [0, 0, 0],
      cloud_cover: [15, 12, 10],
      visibility: [24_000, 25_000, 25_000],
      wind_speed_10m: [7.1, 6.8, 6.2],
    },
  });
}

describe('OpenMeteoWeatherProvider', () => {
  it('maps a valid Open-Meteo payload to the internal weather contract', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(validResponse());
    const provider = new OpenMeteoWeatherProvider({
      request,
      now: () => Date.parse('2026-09-20T18:00:00.000Z'),
    });

    await expect(provider.getForecast(query)).resolves.toEqual({
      location: {
        latitudeDegrees: -23.5,
        longitudeDegrees: -46.625,
        elevationMeters: 760,
      },
      timezone: 'UTC',
      fetchedAt: '2026-09-20T18:00:00.000Z',
      hourly: [
        {
          forecastAt: '2026-09-20T20:00:00.000Z',
          temperatureCelsius: 17.5,
          relativeHumidityPercent: 64,
          precipitationProbabilityPercent: 5,
          precipitationMillimeters: 0,
          cloudCoverPercent: 12,
          visibilityMeters: 25_000,
          windSpeedKilometersPerHour: 6.8,
        },
        {
          forecastAt: '2026-09-20T21:00:00.000Z',
          temperatureCelsius: 16.9,
          relativeHumidityPercent: 67,
          precipitationProbabilityPercent: 4,
          precipitationMillimeters: 0,
          cloudCoverPercent: 10,
          visibilityMeters: 25_000,
          windSpeedKilometersPerHour: 6.2,
        },
      ],
    });

    const requestedUrl = request.mock.calls[0]?.[0] as URL;
    expect(requestedUrl.origin + requestedUrl.pathname).toBe(
      'https://api.open-meteo.com/v1/forecast',
    );
    expect(requestedUrl.searchParams.get('timezone')).toBe('GMT');
    expect(requestedUrl.searchParams.get('start_date')).toBe('2026-09-20');
    expect(requestedUrl.searchParams.get('hourly')).toContain('cloud_cover');
  });

  it('caches successful forecasts until the configured TTL expires', async () => {
    let now = Date.parse('2026-09-20T18:00:00.000Z');
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(validResponse()));
    const provider = new OpenMeteoWeatherProvider({
      request,
      cacheTtlMs: 60_000,
      now: () => now,
    });

    const first = await provider.getForecast(query);
    const cached = await provider.getForecast(query);
    expect(cached).toBe(first);
    expect(request).toHaveBeenCalledTimes(1);

    now += 60_001;
    await provider.getForecast(query);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('returns a typed unavailable error without leaking the upstream body', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('vendor details must remain internal', { status: 503 }));
    const provider = new OpenMeteoWeatherProvider({ request });

    await expect(provider.getForecast(query)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      message: 'Open-Meteo request failed with status 503',
    });
  });

  it('distinguishes a provider timeout from other availability failures', async () => {
    const timeout = new Error('request expired');
    timeout.name = 'TimeoutError';
    const request = vi.fn<typeof fetch>().mockRejectedValue(timeout);
    const provider = new OpenMeteoWeatherProvider({ request, timeoutMs: 25 });

    await expect(provider.getForecast(query)).rejects.toEqual(
      expect.objectContaining<Partial<WeatherProviderError>>({
        code: 'TIMEOUT',
        message: 'Open-Meteo request timed out',
      }),
    );

    expect(request.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects malformed provider data instead of returning partial conditions', async () => {
    const response = validResponse();
    const payload = (await response.json()) as Record<string, unknown>;
    const hourly = payload.hourly as Record<string, unknown>;
    hourly.cloud_cover = [15];
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    const provider = new OpenMeteoWeatherProvider({ request });

    await expect(provider.getForecast(query)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
