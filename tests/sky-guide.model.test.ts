import { describe, expect, it, vi } from 'vitest';

import type { AstronomyProvider } from '../src/modules/astronomy/astronomy-provider.js';
import { LocalCatalogModel } from '../src/modules/catalog/catalog.model.js';
import { AstronomySkyGuideModel } from '../src/modules/sky-guide/sky-guide.model.js';

const observation = {
  objectIds: ['sirius', 'mars'],
  observedAt: new Date('2026-09-06T00:00:00.000Z'),
  observer: {
    latitudeDegrees: -23.5505,
    longitudeDegrees: -46.6333,
    elevationMeters: 760,
  },
};

function astronomyProvider(getPositions: AstronomyProvider['getPositions']): AstronomyProvider {
  return {
    getPositions,
    getEvents: vi.fn().mockResolvedValue([]),
    searchObjects: vi.fn().mockResolvedValue([]),
  };
}

describe('AstronomySkyGuideModel', () => {
  it('combines Astro Core fixed positions with provider ephemerides', async () => {
    const getPositions = vi.fn<AstronomyProvider['getPositions']>().mockResolvedValue([
      {
        objectId: '499',
        observedAt: observation.observedAt.toISOString(),
        equatorial: { rightAscensionDegrees: 108, declinationDegrees: 23 },
        horizontal: { altitudeDegrees: 25, azimuthDegrees: 80 },
      },
    ]);
    const model = new AstronomySkyGuideModel(
      new LocalCatalogModel(),
      astronomyProvider(getPositions),
    );

    const result = await model.getPositions(observation);

    expect(result.unavailableObjectIds).toEqual([]);
    expect(result.positions.map((position) => position.id)).toEqual(['sirius', 'mars']);
    expect(result.positions[0]?.horizontal.altitudeDegrees).toEqual(expect.any(Number));
    expect(result.positions[1]).toMatchObject({
      id: 'mars',
      name: 'Marte',
      horizontal: { altitudeDegrees: 25, azimuthDegrees: 80 },
    });
    expect(getPositions).toHaveBeenCalledWith({
      objectIds: ['499'],
      observedAt: observation.observedAt,
      observer: observation.observer,
    });
  });

  it('returns fixed objects when a dynamic ephemeris is unavailable', async () => {
    const model = new AstronomySkyGuideModel(
      new LocalCatalogModel(),
      astronomyProvider(vi.fn().mockRejectedValue(new Error('upstream unavailable'))),
    );

    const result = await model.getPositions({
      ...observation,
      objectIds: ['sirius', 'mars', 'unknown'],
    });

    expect(result.positions.map((position) => position.id)).toEqual(['sirius']);
    expect(result.unavailableObjectIds).toEqual(['unknown', 'mars']);
  });
});
