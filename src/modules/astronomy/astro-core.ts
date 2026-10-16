import type {
  EquatorialCoordinates,
  HorizontalCoordinates,
  ObserverLocation,
} from './astronomy-provider.js';

const JULIAN_DATE_UNIX_EPOCH = 2_440_587.5;
const JULIAN_DATE_J2000 = 2_451_545;
const MILLISECONDS_PER_DAY = 86_400_000;
const DEGREES_PER_HOUR = 15;

export interface EquatorialToHorizontalInput {
  equatorial: EquatorialCoordinates;
  observedAt: Date;
  observer: ObserverLocation;
}

/**
 * Converts UTC represented by a JavaScript Date to Julian Date.
 */
export function toJulianDate(observedAt: Date): number {
  assertValidDate(observedAt);
  return observedAt.getTime() / MILLISECONDS_PER_DAY + JULIAN_DATE_UNIX_EPOCH;
}

/**
 * Approximate Greenwich Mean Sidereal Time, following the USNO algorithm.
 * UTC is used as an approximation of UT1, which is sufficient for the MVP.
 */
export function greenwichMeanSiderealTimeDegrees(observedAt: Date): number {
  const julianDate = toJulianDate(observedAt);
  const julianDateAtMidnight = Math.floor(julianDate - 0.5) + 0.5;
  const utcHours = (julianDate - julianDateAtMidnight) * 24;
  const daysAtMidnightSinceJ2000 = julianDateAtMidnight - JULIAN_DATE_J2000;
  const centuriesSinceJ2000 = (julianDate - JULIAN_DATE_J2000) / 36_525;

  const gmstHours =
    6.697375 +
    0.065707485828 * daysAtMidnightSinceJ2000 +
    1.0027379 * utcHours +
    0.0854103 * centuriesSinceJ2000 +
    0.0000258 * centuriesSinceJ2000 ** 2;

  return normalizeDegrees(gmstHours * DEGREES_PER_HOUR);
}

/**
 * Converts equatorial coordinates to geometric horizontal coordinates.
 *
 * Azimuth is measured eastward from true north (N=0°, E=90°). Altitude does not include
 * atmospheric refraction. The supplied RA/Dec are assumed to be appropriate for the observation
 * epoch; precession, nutation and parallax belong to the upstream ephemeris calculation.
 */
export function equatorialToHorizontal({
  equatorial,
  observedAt,
  observer,
}: EquatorialToHorizontalInput): HorizontalCoordinates {
  assertCoordinates(equatorial, observer);

  const localSiderealTime = normalizeDegrees(
    greenwichMeanSiderealTimeDegrees(observedAt) + observer.longitudeDegrees,
  );
  const hourAngle = normalizeSignedDegrees(
    localSiderealTime - normalizeDegrees(equatorial.rightAscensionDegrees),
  );

  const hourAngleRadians = degreesToRadians(hourAngle);
  const declinationRadians = degreesToRadians(equatorial.declinationDegrees);
  const latitudeRadians = degreesToRadians(observer.latitudeDegrees);

  const sinAltitude = clamp(
    Math.sin(declinationRadians) * Math.sin(latitudeRadians) +
      Math.cos(declinationRadians) * Math.cos(latitudeRadians) * Math.cos(hourAngleRadians),
    -1,
    1,
  );
  const altitudeRadians = Math.asin(sinAltitude);

  const y = -Math.sin(hourAngleRadians) * Math.cos(declinationRadians);
  const x =
    Math.sin(declinationRadians) * Math.cos(latitudeRadians) -
    Math.cos(declinationRadians) * Math.sin(latitudeRadians) * Math.cos(hourAngleRadians);
  const azimuthDegrees =
    Math.abs(x) < Number.EPSILON && Math.abs(y) < Number.EPSILON
      ? 0
      : normalizeDegrees(radiansToDegrees(Math.atan2(y, x)));

  return {
    altitudeDegrees: radiansToDegrees(altitudeRadians),
    azimuthDegrees,
  };
}

function assertCoordinates(equatorial: EquatorialCoordinates, observer: ObserverLocation): void {
  assertFinite('right ascension', equatorial.rightAscensionDegrees);
  assertRange('declination', equatorial.declinationDegrees, -90, 90);
  assertRange('latitude', observer.latitudeDegrees, -90, 90);
  assertRange('longitude', observer.longitudeDegrees, -180, 180);
  assertFinite('elevation', observer.elevationMeters);
}

function assertValidDate(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError('observation date must be valid');
  }
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
}

function assertRange(name: string, value: number, minimum: number, maximum: number): void {
  assertFinite(name, value);
  if (value < minimum || value > maximum) {
    throw new RangeError(`${name} must be between ${minimum} and ${maximum} degrees`);
  }
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function normalizeSignedDegrees(value: number): number {
  const normalized = normalizeDegrees(value);
  return normalized > 180 ? normalized - 360 : normalized;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
