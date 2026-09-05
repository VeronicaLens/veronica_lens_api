export type CelestialObjectType =
  'sun' | 'moon' | 'planet' | 'asteroid' | 'comet' | 'star' | 'deep-sky' | 'spacecraft' | 'other';

export interface CelestialObject {
  id: string;
  name: string;
  type: CelestialObjectType;
  aliases: string[];
}

export interface ObserverLocation {
  latitudeDegrees: number;
  longitudeDegrees: number;
  elevationMeters: number;
}

export interface EquatorialCoordinates {
  rightAscensionDegrees: number;
  declinationDegrees: number;
}

export interface HorizontalCoordinates {
  altitudeDegrees: number;
  azimuthDegrees: number;
}

export interface ApparentPosition {
  objectId: string;
  observedAt: string;
  equatorial: EquatorialCoordinates;
  horizontal: HorizontalCoordinates;
}

export type AstronomicalEventType =
  | 'rise'
  | 'transit'
  | 'set'
  | 'conjunction'
  | 'opposition'
  | 'eclipse'
  | 'meteor-shower'
  | 'moon-phase'
  | 'other';

export interface AstronomicalEvent {
  id: string;
  type: AstronomicalEventType;
  objectIds: string[];
  startsAt: string;
  peaksAt?: string;
  endsAt?: string;
  title: string;
}

export interface ObjectSearchQuery {
  searchTerm: string;
  limit?: number;
}

export interface PositionQuery {
  objectIds: string[];
  observedAt: Date;
  observer: ObserverLocation;
}

export interface EventQuery {
  from: Date;
  to: Date;
  observer: ObserverLocation;
  objectIds?: string[];
}

/**
 * Port used by application services. Vendor-specific payloads must not cross this boundary.
 */
export interface AstronomyProvider {
  searchObjects(query: ObjectSearchQuery): Promise<CelestialObject[]>;
  getPositions(query: PositionQuery): Promise<ApparentPosition[]>;
  getEvents(query: EventQuery): Promise<AstronomicalEvent[]>;
}
