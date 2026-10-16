import { describe, expect, it } from 'vitest';

import { summarizeCaptureMetadata } from '../src/modules/observations/index.js';

describe('summarizeCaptureMetadata', () => {
  it('summarizes manual capture parameters and the device name', () => {
    expect(
      summarizeCaptureMetadata({
        device: { id: 'back', name: 'Back Camera' },
        parameters: {
          focusMode: 'manual',
          exposureMode: 'manual',
          exposureCompensationEv: 0,
          iso: 1600,
          exposureTimeSeconds: 0.25,
          focusLensPosition: 1,
          whiteBalanceKelvin: 4000,
          fallbacks: [],
        },
      }),
    ).toEqual({
      deviceName: 'Back Camera',
      iso: 1600,
      exposureTimeSeconds: 0.25,
      exposureCompensationEv: 0,
      focusMode: 'manual',
      focusLensPosition: 1,
      whiteBalanceKelvin: 4000,
    });
  });

  it('maps automatic and missing values to null', () => {
    expect(
      summarizeCaptureMetadata({
        device: { id: 'back', name: 'Back Camera' },
        parameters: { iso: 'automatic', exposureTimeSeconds: 'automatic', focusMode: 'automatic' },
      }),
    ).toMatchObject({ iso: null, exposureTimeSeconds: null, whiteBalanceKelvin: null });
  });

  it('returns null for empty or malformed metadata', () => {
    expect(summarizeCaptureMetadata({})).toBeNull();
    expect(summarizeCaptureMetadata(null)).toBeNull();
    expect(summarizeCaptureMetadata('invalid')).toBeNull();
  });
});
