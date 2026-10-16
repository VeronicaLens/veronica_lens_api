import { describe, expect, it } from 'vitest';

import { parseEventSyncJobOptions } from '../src/jobs/sync-astronomical-events.js';

describe('astronomical event synchronization job', () => {
  it('parses a bounded observer window with a stable UTC default', () => {
    const options = parseEventSyncJobOptions(
      ['--latitude', '-23.5505', '--longitude=-46.6333', '--elevation', '760', '--days', '14'],
      new Date('2026-10-04T18:30:00.000Z'),
    );

    expect(options).toEqual({
      latitude: -23.5505,
      longitude: -46.6333,
      elevation: 760,
      days: 14,
      from: new Date('2026-10-04T00:00:00.000Z'),
    });
  });

  it('rejects missing coordinates and periods longer than 31 days', () => {
    expect(() => parseEventSyncJobOptions(['--latitude', '0'])).toThrow(/longitude/);
    expect(() =>
      parseEventSyncJobOptions(['--latitude', '0', '--longitude', '0', '--days', '32']),
    ).toThrow(/days/);
  });
});
