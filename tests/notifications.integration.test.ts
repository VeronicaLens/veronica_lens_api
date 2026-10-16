import type { RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { NotificationsModelPort } from '../src/modules/notifications/index.js';

const authenticate: RequestHandler = (req, _res, next) => {
  req.auth = { accessToken: 'token', userId: 'user-id', role: 'user', supabase: {} as never };
  next();
};

function model() {
  const listPreferences = vi.fn().mockResolvedValue([]);
  const savePreferences = vi
    .fn()
    .mockResolvedValue([{ eventType: 'rise', enabled: true, leadMinutes: 30 }]);
  const registerDevice = vi.fn().mockResolvedValue(undefined);
  const deactivateDevice = vi.fn().mockResolvedValue(undefined);
  const notificationsModel: NotificationsModelPort = {
    listPreferences,
    savePreferences,
    registerDevice,
    deactivateDevice,
  };
  return { notificationsModel, savePreferences, registerDevice, deactivateDevice };
}

describe('notification routes', () => {
  it('persists event preferences and registers the authenticated device', async () => {
    const { notificationsModel, savePreferences, registerDevice } = model();
    const app = createApp({
      enableLogger: false,
      authenticateHandler: authenticate,
      notificationsModel,
    });

    const preferences = await request(app)
      .put('/api/v1/notifications/preferences')
      .send({
        preferences: [{ eventType: 'rise', enabled: true, leadMinutes: 30 }],
      });
    const device = await request(app).post('/api/v1/notifications/devices').send({
      token: 'ExponentPushToken[device-token]',
      platform: 'android',
    });

    expect(preferences.status).toBe(200);
    expect(savePreferences).toHaveBeenCalledWith(expect.anything(), 'user-id', [
      { eventType: 'rise', enabled: true, leadMinutes: 30 },
    ]);
    expect(device.status).toBe(204);
    expect(registerDevice).toHaveBeenCalledWith(
      expect.anything(),
      'user-id',
      'ExponentPushToken[device-token]',
      'android',
    );
  });

  it('deactivates a device on logout and rejects invalid payloads', async () => {
    const { notificationsModel, deactivateDevice } = model();
    const app = createApp({
      enableLogger: false,
      authenticateHandler: authenticate,
      notificationsModel,
    });

    const logout = await request(app).delete('/api/v1/notifications/devices').send({
      token: 'ExponentPushToken[device-token]',
    });
    const invalid = await request(app).post('/api/v1/notifications/devices').send({ token: '' });

    expect(logout.status).toBe(204);
    expect(deactivateDevice).toHaveBeenCalledWith(
      expect.anything(),
      'user-id',
      'ExponentPushToken[device-token]',
    );
    expect(invalid.status).toBe(400);
  });
});
