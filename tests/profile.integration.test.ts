import type { RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { ProfileModelPort, ProfileRow } from '../src/modules/profile/profile.model.js';

const row: ProfileRow = {
  id: '40000000-0000-4000-8000-000000000001',
  display_name: 'User One',
  avatar_url: null,
  location_name: 'São Paulo',
  latitude: -23.55052,
  longitude: -46.63331,
  notifications_enabled: true,
  measurement_unit: 'metric',
  language: 'pt-BR',
  created_at: '2026-09-05T12:00:00.000Z',
  updated_at: '2026-09-05T12:00:00.000Z',
};

const authenticate: RequestHandler = (req, _res, next) => {
  req.auth = {
    accessToken: 'access-token',
    userId: row.id,
    role: 'user',
    supabase: {} as SupabaseClient,
  };
  next();
};

function modelWith(overrides: Partial<ProfileModelPort> = {}): ProfileModelPort {
  return {
    findByUserId: vi.fn().mockResolvedValue({ data: row, error: null }),
    updateByUserId: vi.fn().mockResolvedValue({ data: row, error: null }),
    uploadAvatar: vi.fn().mockResolvedValue('https://cdn.test/avatars/user.jpg'),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('profile routes', () => {
  it('returns the authenticated user profile', async () => {
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        profileModel: modelWith(),
      }),
    ).get('/api/v1/profile');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        id: row.id,
        displayName: 'User One',
        avatarUrl: null,
        locationName: 'São Paulo',
        latitude: -23.55052,
        longitude: -46.63331,
        notificationsEnabled: true,
        measurementUnit: 'metric',
        language: 'pt-BR',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  });

  it('updates normalized profile preferences for the authenticated user', async () => {
    const updateByUserId = vi.fn().mockResolvedValue({
      data: { ...row, display_name: 'Bianca', notifications_enabled: false },
      error: null,
    });
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        profileModel: modelWith({ updateByUserId }),
      }),
    )
      .patch('/api/v1/profile')
      .send({
        displayName: ' Bianca ',
        latitude: -23.5,
        longitude: -46.6,
        notificationsEnabled: false,
        measurementUnit: 'metric',
        language: 'pt-BR',
      });

    expect(response.status).toBe(200);
    expect(updateByUserId).toHaveBeenCalledWith(expect.anything(), row.id, {
      display_name: 'Bianca',
      latitude: -23.5,
      longitude: -46.6,
      notifications_enabled: false,
      measurement_unit: 'metric',
      language: 'pt-BR',
    });
  });

  it('rejects invalid or unpaired coordinates', async () => {
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        profileModel: modelWith(),
      }),
    )
      .patch('/api/v1/profile')
      .send({ latitude: 91 });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('requires authentication', async () => {
    const response = await request(
      createApp({ enableLogger: false, profileModel: modelWith() }),
    ).get('/api/v1/profile');
    expect(response.status).toBe(401);
  });

  it('uploads an avatar and returns the updated profile', async () => {
    const uploadAvatar = vi.fn().mockResolvedValue('https://cdn.test/avatars/user.jpg?v=1');
    const updateByUserId = vi
      .fn()
      .mockResolvedValue({ data: { ...row, avatar_url: 'https://cdn.test/avatars/user.jpg?v=1' }, error: null });
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        profileModel: modelWith({ uploadAvatar, updateByUserId }),
      }),
    )
      .put('/api/v1/profile/avatar')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('fake-jpeg-bytes'));

    expect(response.status).toBe(200);
    expect(uploadAvatar).toHaveBeenCalledWith(expect.anything(), {
      userId: row.id,
      contentType: 'image/jpeg',
      bytes: Buffer.from('fake-jpeg-bytes'),
    });
    expect(updateByUserId).toHaveBeenCalledWith(expect.anything(), row.id, {
      avatar_url: 'https://cdn.test/avatars/user.jpg?v=1',
    });
    expect(response.body).toMatchObject({
      data: { avatarUrl: 'https://cdn.test/avatars/user.jpg?v=1' },
    });  });

  it('deletes the authenticated user account', async () => {
    const deleteAccount = vi.fn().mockResolvedValue(undefined);
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        profileModel: modelWith({ deleteAccount }),
      }),
    ).delete('/api/v1/profile');

    expect(response.status).toBe(204);
    expect(deleteAccount).toHaveBeenCalledWith(row.id);
  });

  it('keeps the account and reports a retryable error when deletion fails', async () => {
    const { AppError } = await import('../src/shared/errors/app-error.js');
    const deleteAccount = vi
      .fn()
      .mockRejectedValue(new AppError(503, 'ACCOUNT_DELETION_UNAVAILABLE', 'Account could not be deleted'));
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        profileModel: modelWith({ deleteAccount }),
      }),
    ).delete('/api/v1/profile');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: { code: 'ACCOUNT_DELETION_UNAVAILABLE' } });
  });

  it('requires authentication to delete an account', async () => {
    const deleteAccount = vi.fn();
    const response = await request(
      createApp({ enableLogger: false, profileModel: modelWith({ deleteAccount }) }),
    ).delete('/api/v1/profile');
    expect(response.status).toBe(401);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('rejects an avatar upload with an unsupported content type', async () => {
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        profileModel: modelWith(),
      }),
    )
      .put('/api/v1/profile/avatar')
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('not-an-image'));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});
