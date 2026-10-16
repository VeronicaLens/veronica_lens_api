import { describe, expect, it } from 'vitest';

import { ObservationVisibilityService } from '../src/modules/planning/visibility.service.js';

const service = new ObservationVisibilityService();
const windowFrom = '2026-10-12T22:00:00.000Z';
const windowTo = '2026-10-13T02:00:00.000Z';

describe('ObservationVisibilityService', () => {
  it('returns a favorable window when altitude, moon and weather permit observation', () => {
    const result = service.evaluate({
      windowFrom,
      windowTo,
      thresholds: { minimumAltitudeDegrees: 30 },
      samples: [
        {
          observedAt: '2026-10-12T23:00:00.000Z',
          altitudeDegrees: 48,
          moon: { illuminationFraction: 0.9, angularSeparationDegrees: 70 },
          weather: {
            cloudCoverPercent: 20,
            precipitationProbabilityPercent: 5,
            visibilityMeters: 12_000,
          },
        },
      ],
    });
    expect(result).toMatchObject({
      favorable: true,
      consideredAt: '2026-10-12T23:00:00.000Z',
      favorableFrom: '2026-10-12T23:00:00.000Z',
      favorableTo: '2026-10-12T23:00:00.000Z',
    });
    expect(result.factors.map(({ code, status }) => ({ code, status }))).toEqual([
      { code: 'altitude', status: 'favorable' },
      { code: 'moon', status: 'favorable' },
      { code: 'weather', status: 'favorable' },
    ]);
    expect(result.factors.find((factor) => factor.code === 'altitude')?.metrics).toEqual({
      altitudeDegrees: 48,
      minimumAltitudeDegrees: 30,
    });
    expect(result.factors.find((factor) => factor.code === 'weather')?.metrics).toEqual({
      cloudCoverPercent: 20,
      precipitationProbabilityPercent: 5,
      visibilityMeters: 12_000,
    });
  });

  it('rejects an otherwise good instant when cloud cover exceeds the threshold', () => {
    const result = service.evaluate({
      windowFrom,
      windowTo,
      thresholds: { minimumAltitudeDegrees: 25, maximumCloudCoverPercent: 40 },
      samples: [
        {
          observedAt: '2026-10-13T00:00:00.000Z',
          altitudeDegrees: 60,
          weather: { cloudCoverPercent: 95 },
        },
      ],
    });
    expect(result.favorable).toBe(false);
    expect(result.favorableFrom).toBeNull();
    expect(result.factors).toContainEqual(
      expect.objectContaining({ code: 'weather', status: 'unfavorable' }),
    );
  });

  it('uses the configurable minimum altitude and treats optional data as neutral', () => {
    const sample = { observedAt: '2026-10-13T00:30:00.000Z', altitudeDegrees: 35 };
    const accepted = service.evaluate({
      windowFrom,
      windowTo,
      thresholds: { minimumAltitudeDegrees: 30 },
      samples: [sample],
    });
    const rejected = service.evaluate({
      windowFrom,
      windowTo,
      thresholds: { minimumAltitudeDegrees: 40 },
      samples: [sample],
    });
    expect(accepted.favorable).toBe(true);
    expect(accepted.factors.map((factor) => factor.status)).toEqual([
      'favorable',
      'unavailable',
      'unavailable',
    ]);
    expect(rejected.favorable).toBe(false);
  });

  it('explains when there are no samples inside the requested window', () => {
    const result = service.evaluate({
      windowFrom,
      windowTo,
      thresholds: { minimumAltitudeDegrees: 20 },
      samples: [{ observedAt: '2026-10-13T04:00:00.000Z', altitudeDegrees: 70 }],
    });
    expect(result.favorable).toBe(false);
    expect(result.consideredAt).toBeNull();
    expect(result.factors.every((factor) => factor.status === 'unavailable')).toBe(true);
  });

  it('returns only the contiguous favorable run containing the best instant', () => {
    const result = service.evaluate({
      windowFrom,
      windowTo,
      thresholds: { minimumAltitudeDegrees: 30 },
      samples: [
        { observedAt: '2026-10-12T22:00:00.000Z', altitudeDegrees: 35 },
        { observedAt: '2026-10-12T23:00:00.000Z', altitudeDegrees: 10 },
        { observedAt: '2026-10-13T00:00:00.000Z', altitudeDegrees: 50 },
        { observedAt: '2026-10-13T01:00:00.000Z', altitudeDegrees: 45 },
      ],
    });

    expect(result).toMatchObject({
      consideredAt: '2026-10-13T00:00:00.000Z',
      favorableFrom: '2026-10-13T00:00:00.000Z',
      favorableTo: '2026-10-13T01:00:00.000Z',
    });
  });

  it('rejects invalid windows, thresholds and condition measurements', () => {
    expect(() =>
      service.evaluate({
        windowFrom: windowTo,
        windowTo: windowFrom,
        thresholds: { minimumAltitudeDegrees: 20 },
        samples: [],
      }),
    ).toThrow('windowFrom must be earlier than windowTo');
    expect(() =>
      service.evaluate({
        windowFrom,
        windowTo,
        thresholds: { minimumAltitudeDegrees: 20, maximumCloudCoverPercent: 101 },
        samples: [],
      }),
    ).toThrow('maximumCloudCoverPercent must be between 0 and 100');
    expect(() =>
      service.evaluate({
        windowFrom,
        windowTo,
        thresholds: { minimumAltitudeDegrees: 20 },
        samples: [
          {
            observedAt: '2026-10-12T23:30:00.000Z',
            altitudeDegrees: 45,
            moon: { illuminationFraction: 1.2 },
          },
        ],
      }),
    ).toThrow('sample.moon.illuminationFraction must be between 0 and 1');
  });
});
