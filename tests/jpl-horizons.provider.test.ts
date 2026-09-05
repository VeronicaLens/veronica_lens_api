import { describe, expect, it, vi } from 'vitest';

import { JplHorizonsProvider } from '../src/modules/astronomy/jpl-horizons.provider.js';

describe('JplHorizonsProvider', () => {
  it('maps lookup results to the vendor-neutral object contract', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        signature: { source: 'NASA/JPL Horizons Lookup API', version: '1.1' },
        count: 1,
        result: [
          {
            alias: ['3264226', 'K04M04N'],
            name: '99942 Apophis',
            spkid: '2099942',
            type: 'asteroid (integrated barycenter)',
          },
        ],
      }),
    );
    const provider = new JplHorizonsProvider(request);

    await expect(provider.searchObjects({ searchTerm: 'Apophis' })).resolves.toEqual([
      {
        aliases: ['3264226', 'K04M04N'],
        id: '2099942',
        name: '99942 Apophis',
        type: 'asteroid',
      },
    ]);

    const requestedUrl = request.mock.calls[0]?.[0];
    expect(requestedUrl).toBeInstanceOf(URL);
    expect((requestedUrl as URL).searchParams.get('sstr')).toBe('Apophis');
  });

  it('parses an observer ephemeris into equatorial and horizontal coordinates', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        signature: { source: 'NASA/JPL Horizons API', version: '1.2' },
        result: [
          ' Date__(UT)__HR:MN:SC.fff, , , R.A.__(a-app), DEC_(a-app), Azi_(a-app), Elev_(a-app),',
          '$$SOE',
          ' 2026-Sep-06 00:00:00.000, , , 07 12 05.89, +23 01 08.6, 91.091908, -80.392333,',
          '$$EOE',
        ].join('\n'),
      }),
    );
    const provider = new JplHorizonsProvider(request);

    const positions = await provider.getPositions({
      objectIds: ['499'],
      observedAt: new Date('2026-09-06T00:00:00.000Z'),
      observer: {
        latitudeDegrees: -23.5505,
        longitudeDegrees: -46.6333,
        elevationMeters: 760,
      },
    });

    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      objectId: '499',
      observedAt: '2026-09-06T00:00:00.000Z',
      horizontal: {
        altitudeDegrees: -80.392333,
        azimuthDegrees: 91.091908,
      },
    });
    expect(positions[0]?.equatorial.rightAscensionDegrees).toBeCloseTo(108.0245416667, 8);
    expect(positions[0]?.equatorial.declinationDegrees).toBeCloseTo(23.0190555556, 8);

    const requestedUrl = request.mock.calls[0]?.[0] as URL;
    expect(requestedUrl.searchParams.get('SITE_COORD')).toBe("'-46.6333,-23.5505,0.76'");
    expect(requestedUrl.searchParams.get('QUANTITIES')).toBe("'2,4'");
  });

  it('returns a typed unavailable error without leaking the upstream response', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const provider = new JplHorizonsProvider(request);

    await expect(provider.searchObjects({ searchTerm: 'Mars' })).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      message: 'JPL Horizons request failed with status 503',
    });
  });
});
