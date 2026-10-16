import { describe, expect, it } from 'vitest';

import {
  equatorialToHorizontal,
  greenwichMeanSiderealTimeDegrees,
  toJulianDate,
} from '../src/modules/astronomy/astro-core.js';

const seaLevel = 0;

interface InvalidInputOverride {
  observedAt?: Date;
  declinationDegrees?: number;
  latitudeDegrees?: number;
  longitudeDegrees?: number;
}

const invalidInputs: Array<[string, InvalidInputOverride]> = [
  ['invalid date', { observedAt: new Date('invalid') }],
  ['declination', { declinationDegrees: 91 }],
  ['latitude', { latitudeDegrees: -91 }],
  ['longitude', { longitudeDegrees: 181 }],
];

describe('Astro Core', () => {
  it('converts the J2000 epoch to its canonical Julian Date', () => {
    expect(toJulianDate(new Date('2000-01-01T12:00:00.000Z'))).toBe(2_451_545);
  });

  it('calculates Greenwich mean sidereal time with the USNO approximation', () => {
    expect(greenwichMeanSiderealTimeDegrees(new Date('2000-01-01T12:00:00.000Z'))).toBeCloseTo(
      280.460641,
      5,
    );
  });

  it('places an equatorial object on the eastern horizon six sidereal hours before transit', () => {
    const observedAt = new Date('2026-09-06T00:00:00.000Z');
    const localSiderealTime = greenwichMeanSiderealTimeDegrees(observedAt);

    const result = equatorialToHorizontal({
      equatorial: {
        rightAscensionDegrees: localSiderealTime + 90,
        declinationDegrees: 0,
      },
      observedAt,
      observer: {
        latitudeDegrees: 0,
        longitudeDegrees: 0,
        elevationMeters: seaLevel,
      },
    });

    expect(result.altitudeDegrees).toBeCloseTo(0, 10);
    expect(result.azimuthDegrees).toBeCloseTo(90, 10);
  });

  it('produces the same position for equivalent instants expressed with different timezones', () => {
    const equatorial = { rightAscensionDegrees: 107.622875, declinationDegrees: 23.062361 };
    const observer = {
      latitudeDegrees: -23.5505,
      longitudeDegrees: -46.6333,
      elevationMeters: 760,
    };

    const utc = equatorialToHorizontal({
      equatorial,
      observedAt: new Date('2026-09-06T00:00:00.000Z'),
      observer,
    });
    const brazilTime = equatorialToHorizontal({
      equatorial,
      observedAt: new Date('2026-09-05T21:00:00.000-03:00'),
      observer,
    });

    expect(brazilTime.altitudeDegrees).toBeCloseTo(utc.altitudeDegrees, 12);
    expect(brazilTime.azimuthDegrees).toBeCloseTo(utc.azimuthDegrees, 12);
  });

  it('agrees with the JPL Horizons Mars reference within the MVP precision', () => {
    const result = equatorialToHorizontal({
      equatorial: {
        rightAscensionDegrees: 108.0245416667,
        declinationDegrees: 23.019055555555557,
      },
      observedAt: new Date('2026-09-06T00:00:00.000Z'),
      observer: {
        latitudeDegrees: -23.5505,
        longitudeDegrees: -46.6333,
        elevationMeters: 760,
      },
    });

    expect(result.altitudeDegrees).toBeCloseTo(-80.392333, 1);
    expect(result.azimuthDegrees).toBeCloseTo(91.091908, 1);
  });

  it.each([
    {
      hemisphere: 'northern',
      declinationDegrees: 90,
      latitudeDegrees: 35,
      expectedAltitude: 35,
    },
    {
      hemisphere: 'southern',
      declinationDegrees: -90,
      latitudeDegrees: -35,
      expectedAltitude: 35,
    },
  ])(
    'places the visible celestial pole correctly in the $hemisphere hemisphere',
    ({ declinationDegrees, latitudeDegrees, expectedAltitude }) => {
      const result = equatorialToHorizontal({
        equatorial: { rightAscensionDegrees: 0, declinationDegrees },
        observedAt: new Date('2026-09-06T00:00:00.000Z'),
        observer: {
          latitudeDegrees,
          longitudeDegrees: 0,
          elevationMeters: seaLevel,
        },
      });

      expect(result.altitudeDegrees).toBeCloseTo(expectedAltitude, 10);
    },
  );

  it('normalizes right ascension and always returns azimuth in the 0-360 interval', () => {
    const result = equatorialToHorizontal({
      equatorial: { rightAscensionDegrees: 725, declinationDegrees: -20 },
      observedAt: new Date('2026-09-06T00:00:00.000Z'),
      observer: {
        latitudeDegrees: -23.5505,
        longitudeDegrees: -46.6333,
        elevationMeters: 760,
      },
    });

    expect(result.altitudeDegrees).toBeGreaterThanOrEqual(-90);
    expect(result.altitudeDegrees).toBeLessThanOrEqual(90);
    expect(result.azimuthDegrees).toBeGreaterThanOrEqual(0);
    expect(result.azimuthDegrees).toBeLessThan(360);
  });

  it.each(invalidInputs)('rejects invalid %s input', (_case, override) => {
    expect(() =>
      equatorialToHorizontal({
        equatorial: {
          rightAscensionDegrees: 10,
          declinationDegrees: override.declinationDegrees ?? 20,
        },
        observedAt: override.observedAt ?? new Date('2026-09-06T00:00:00.000Z'),
        observer: {
          latitudeDegrees: override.latitudeDegrees ?? -23,
          longitudeDegrees: override.longitudeDegrees ?? -46,
          elevationMeters: 0,
        },
      }),
    ).toThrow(RangeError);
  });
});
