export type CatalogObjectType = 'moon' | 'planet' | 'star' | 'constellation';

export interface FixedCatalogCoordinates {
  kind: 'fixed';
  epoch: 'J2000';
  rightAscensionDegrees: number;
  declinationDegrees: number;
}

export interface EphemerisCatalogCoordinates {
  kind: 'ephemeris';
  provider: 'jpl-horizons';
  providerObjectId: string;
}

export type CatalogCoordinates = FixedCatalogCoordinates | EphemerisCatalogCoordinates;

export interface CatalogObject {
  id: string;
  name: string;
  type: CatalogObjectType;
  aliases: string[];
  magnitude: number | null;
  coordinates: CatalogCoordinates;
}

export interface CatalogFilter {
  searchTerm?: string;
  type?: CatalogObjectType;
  limit: number;
}

export interface CatalogModelPort {
  findMany(filter: CatalogFilter): Promise<CatalogObject[]>;
}

const dynamicObject = (
  id: string,
  name: string,
  type: 'moon' | 'planet',
  providerObjectId: string,
  aliases: string[],
): CatalogObject => ({
  id,
  name,
  type,
  aliases,
  magnitude: null,
  coordinates: { kind: 'ephemeris', provider: 'jpl-horizons', providerObjectId },
});

const fixedObject = (
  id: string,
  name: string,
  type: 'star' | 'constellation',
  rightAscensionDegrees: number,
  declinationDegrees: number,
  magnitude: number | null,
  aliases: string[],
): CatalogObject => ({
  id,
  name,
  type,
  aliases,
  magnitude,
  coordinates: {
    kind: 'fixed',
    epoch: 'J2000',
    rightAscensionDegrees,
    declinationDegrees,
  },
});

export const minimumCatalog: readonly CatalogObject[] = Object.freeze([
  dynamicObject('moon', 'Lua', 'moon', '301', ['Moon', 'Luna']),
  dynamicObject('mercury', 'Mercúrio', 'planet', '199', ['Mercury']),
  dynamicObject('venus', 'Vênus', 'planet', '299', ['Venus']),
  dynamicObject('mars', 'Marte', 'planet', '499', ['Mars']),
  dynamicObject('jupiter', 'Júpiter', 'planet', '599', ['Jupiter']),
  dynamicObject('saturn', 'Saturno', 'planet', '699', ['Saturn']),
  dynamicObject('uranus', 'Urano', 'planet', '799', ['Uranus']),
  dynamicObject('neptune', 'Netuno', 'planet', '899', ['Neptune']),
  fixedObject('sirius', 'Sirius', 'star', 101.287155, -16.716116, -1.46, ['Sírius']),
  fixedObject('canopus', 'Canopus', 'star', 95.987878, -52.695661, -0.74, ['Canopo']),
  fixedObject('alpha-centauri', 'Alpha Centauri', 'star', 219.902083, -60.833972, -0.1, [
    'Alfa Centauri',
    'Rigil Kentaurus',
  ]),
  fixedObject('arcturus', 'Arcturus', 'star', 213.9153, 19.182409, -0.05, ['Arcturo']),
  fixedObject('vega', 'Vega', 'star', 279.234735, 38.783689, 0.03, []),
  fixedObject('capella', 'Capella', 'star', 79.172328, 45.997991, 0.08, ['Capela']),
  fixedObject('rigel', 'Rigel', 'star', 78.634467, -8.201639, 0.13, []),
  fixedObject('betelgeuse', 'Betelgeuse', 'star', 88.792939, 7.407064, 0.42, ['Betelgueuse']),
  fixedObject('achernar', 'Achernar', 'star', 24.428523, -57.236753, 0.46, []),
  fixedObject('hadar', 'Hadar', 'star', 210.955856, -60.373039, 0.61, ['Beta Centauri']),
  fixedObject('acrux', 'Acrux', 'star', 186.649563, -63.099092, 0.76, ['Alpha Crucis']),
  fixedObject('antares', 'Antares', 'star', 247.351915, -26.432002, 0.91, ['Antares A']),
  fixedObject('orion', 'Órion', 'constellation', 83.822083, -5.391111, null, ['Orion']),
  fixedObject('crux', 'Cruzeiro do Sul', 'constellation', 186.25, -60, null, [
    'Crux',
    'Cruz do Sul',
  ]),
  fixedObject('scorpius', 'Escorpião', 'constellation', 252.5, -26, null, [
    'Scorpius',
    'Escorpião',
  ]),
  fixedObject('ursa-major', 'Ursa Maior', 'constellation', 165.932, 61.751, null, [
    'Ursa Major',
    'Grande Ursa',
  ]),
]);

export class LocalCatalogModel implements CatalogModelPort {
  constructor(private readonly objects: readonly CatalogObject[] = minimumCatalog) {}

  findMany(filter: CatalogFilter): Promise<CatalogObject[]> {
    const normalizedTerm = filter.searchTerm ? normalizeSearch(filter.searchTerm) : null;

    return Promise.resolve(
      this.objects
        .filter((object) => !filter.type || object.type === filter.type)
        .filter((object) => {
          if (!normalizedTerm) return true;
          return [object.id, object.name, ...object.aliases].some((value) =>
            normalizeSearch(value).includes(normalizedTerm),
          );
        })
        .slice(0, filter.limit)
        .map(cloneObject),
    );
  }
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

function cloneObject(object: CatalogObject): CatalogObject {
  return {
    ...object,
    aliases: [...object.aliases],
    coordinates: { ...object.coordinates },
  };
}
