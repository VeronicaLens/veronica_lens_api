import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type {
  CurrentConditionsForecastResult,
  CurrentConditionsPort,
} from '../src/modules/conditions/index.js';

describe('GET /api/v1/conditions/forecast', () => {
  it('returns the authenticated hourly forecast for the requested observer', async () => {
    const forecast: CurrentConditionsForecastResult = {
      from: '2026-10-12T23:00:00.000Z',
      to: '2026-10-19T22:00:00.000Z',
      fetchedAt: '2026-10-12T22:30:00.000Z',
      hourly: [],
    };
    const currentConditionsService: CurrentConditionsPort = {
      getCurrent: vi.fn(),
      getForecast: vi.fn().mockResolvedValue(forecast),
    };
    const app = createApp({
      currentConditionsService,
      authenticateHandler: (_request, _response, next) => next(),
    });

    const response = await request(app)
      .get(
        '/api/v1/conditions/forecast?latitudeDegrees=-23.5505&longitudeDegrees=-46.6333&elevationMeters=760',
      )
      .expect(200);

    expect(response.body).toEqual({ data: forecast });
    expect(currentConditionsService.getForecast).toHaveBeenCalledWith({
      observer: {
        latitudeDegrees: -23.5505,
        longitudeDegrees: -46.6333,
        elevationMeters: 760,
      },
    });
  });
});
