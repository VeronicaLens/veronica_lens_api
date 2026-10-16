import { equatorialToHorizontal } from '../astronomy/astro-core.js';
import type {
  HorizontalCoordinates,
  ObserverLocation,
  PositionQuery,
  ApparentPosition,
} from '../astronomy/astronomy-provider.js';
import type {
  CatalogModelPort,
  CatalogObject,
  CatalogObjectType,
} from '../catalog/catalog.model.js';

export interface SkyGuidePositionQuery {
  objectIds: string[];
  observedAt: Date;
  observer: ObserverLocation;
}

export interface SkyGuideObjectPosition {
  id: string;
  name: string;
  type: CatalogObjectType;
  magnitude: number | null;
  observedAt: string;
  horizontal: HorizontalCoordinates;
}

export interface SkyGuidePositionResult {
  positions: SkyGuideObjectPosition[];
  unavailableObjectIds: string[];
}

export interface SkyGuideModelPort {
  getPositions(query: SkyGuidePositionQuery): Promise<SkyGuidePositionResult>;
}

export interface AstronomyPositionProvider {
  getPositions(query: PositionQuery): Promise<ApparentPosition[]>;
}

export class AstronomySkyGuideModel implements SkyGuideModelPort {
  constructor(
    private readonly catalog: CatalogModelPort,
    private readonly astronomy: AstronomyPositionProvider,
  ) {}

  async getPositions(query: SkyGuidePositionQuery): Promise<SkyGuidePositionResult> {
    const catalogObjects = await this.catalog.findMany({ limit: 50 });
    const catalogById = new Map(catalogObjects.map((object) => [object.id, object]));
    const requestedObjects = query.objectIds.flatMap((id) => {
      const object = catalogById.get(id);
      return object ? [object] : [];
    });
    const unavailableObjectIds = query.objectIds.filter((id) => !catalogById.has(id));
    const positions = new Map<string, SkyGuideObjectPosition>();

    for (const object of requestedObjects) {
      if (object.coordinates.kind !== 'fixed') continue;
      positions.set(object.id, {
        ...basePosition(object, query.observedAt),
        horizontal: equatorialToHorizontal({
          equatorial: {
            rightAscensionDegrees: object.coordinates.rightAscensionDegrees,
            declinationDegrees: object.coordinates.declinationDegrees,
          },
          observedAt: query.observedAt,
          observer: query.observer,
        }),
      });
    }

    const dynamicResults = await Promise.all(
      requestedObjects
        .filter((object) => object.coordinates.kind === 'ephemeris')
        .map(async (object) => await this.getDynamicPosition(object, query)),
    );

    dynamicResults.forEach(({ objectId, position }) => {
      if (position) positions.set(objectId, position);
      else unavailableObjectIds.push(objectId);
    });

    return {
      positions: query.objectIds.flatMap((id) => {
        const position = positions.get(id);
        return position ? [position] : [];
      }),
      unavailableObjectIds,
    };
  }

  private async getDynamicPosition(
    object: CatalogObject,
    query: SkyGuidePositionQuery,
  ): Promise<{ objectId: string; position: SkyGuideObjectPosition | null }> {
    if (object.coordinates.kind !== 'ephemeris') {
      return { objectId: object.id, position: null };
    }

    try {
      const [position] = await this.astronomy.getPositions({
        objectIds: [object.coordinates.providerObjectId],
        observedAt: query.observedAt,
        observer: query.observer,
      });

      return {
        objectId: object.id,
        position: position
          ? { ...basePosition(object, query.observedAt), horizontal: position.horizontal }
          : null,
      };
    } catch {
      return { objectId: object.id, position: null };
    }
  }
}

function basePosition(object: CatalogObject, observedAt: Date) {
  return {
    id: object.id,
    name: object.name,
    type: object.type,
    magnitude: object.magnitude,
    observedAt: observedAt.toISOString(),
  };
}
