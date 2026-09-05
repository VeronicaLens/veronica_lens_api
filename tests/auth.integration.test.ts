import type { AuthError, Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { AuthModelPort } from '../src/modules/auth/auth.model.js';

const user: User = {
  id: '40000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'user@example.com',
  app_metadata: { role: 'user' },
  user_metadata: { display_name: 'User One' },
  identities: [],
  created_at: '2026-09-05T12:00:00.000Z',
  updated_at: '2026-09-05T12:00:00.000Z',
};

function tokenWithSessionId(sessionId = '60000000-0000-4000-8000-000000000001'): string {
  const payload = Buffer.from(JSON.stringify({ session_id: sessionId })).toString('base64url');
  return `header.${payload}.signature`;
}

const session: Session = {
  access_token: tokenWithSessionId(),
  refresh_token: 'refresh-token',
  expires_in: 3600,
  expires_at: 1_788_612_000,
  token_type: 'bearer',
  user,
};

function modelWith(overrides: Partial<AuthModelPort> = {}): AuthModelPort {
  return {
    signUp: vi.fn().mockResolvedValue({ user, session, error: null }),
    signIn: vi.fn().mockResolvedValue({ user, session, error: null }),
    refresh: vi.fn().mockResolvedValue({ user, session, error: null }),
    requestPasswordRecovery: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    updatePassword: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

function authenticatedRequest(): RequestHandler {
  return (request, _response, next) => {
    request.auth = {
      accessToken: session.access_token,
      userId: user.id,
      role: 'user',
      supabase: {} as SupabaseClient,
    };
    next();
  };
}

describe('authentication routes', () => {
  it('creates an account and returns a session when confirmation is not required', async () => {
    const response = await request(createApp({ enableLogger: false, authModel: modelWith() }))
      .post('/api/v1/auth/sign-up')
      .send({ email: 'USER@example.com', password: 'strong-password', displayName: 'User One' });

    expect(response.status).toBe(201);
    const body = response.body as unknown as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      confirmationRequired: false,
      user: { id: user.id, email: user.email, role: 'user' },
      session: { id: '60000000-0000-4000-8000-000000000001', tokenType: 'bearer' },
    });
  });

  it('supports account creation with email confirmation', async () => {
    const authModel = modelWith({
      signUp: vi.fn().mockResolvedValue({ user, session: null, error: null }),
    });
    const response = await request(createApp({ enableLogger: false, authModel }))
      .post('/api/v1/auth/sign-up')
      .send({ email: user.email, password: 'strong-password' });

    expect(response.status).toBe(202);
    const body = response.body as unknown as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ confirmationRequired: true, session: null });
  });

  it('rejects an invalid request before reaching Supabase', async () => {
    const response = await request(createApp({ enableLogger: false, authModel: modelWith() }))
      .post('/api/v1/auth/sign-up')
      .send({ email: 'invalid', password: 'short' });

    expect(response.status).toBe(400);
    const body = response.body as unknown as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('does not expose provider details when credentials are invalid', async () => {
    const providerError = {
      code: 'invalid_credentials',
      status: 400,
      message: 'sensitive provider detail',
    } as AuthError;
    const authModel = modelWith({
      signIn: vi.fn().mockResolvedValue({ user: null, session: null, error: providerError }),
    });
    const response = await request(createApp({ enableLogger: false, authModel }))
      .post('/api/v1/auth/sign-in')
      .send({ email: user.email, password: 'wrong-password' });

    expect(response.status).toBe(401);
    const body = response.body as unknown as { error: { code: string } };
    expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(JSON.stringify(response.body)).not.toContain('sensitive provider detail');
  });

  it('renews a session using a refresh token', async () => {
    const response = await request(createApp({ enableLogger: false, authModel: modelWith() }))
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'refresh-token' });

    expect(response.status).toBe(200);
    const body = response.body as unknown as { data: { refreshToken: string } };
    expect(body.data.refreshToken).toBe('refresh-token');
  });

  it('returns the same recovery response without disclosing account existence', async () => {
    const authModel = modelWith({
      requestPasswordRecovery: vi.fn().mockResolvedValue({
        error: { code: 'user_not_found', status: 400 } as AuthError,
      }),
    });
    const response = await request(createApp({ enableLogger: false, authModel }))
      .post('/api/v1/auth/password/recovery')
      .send({ email: 'missing@example.com' });

    expect(response.status).toBe(202);
  });

  it('revokes the session and updates the password through authenticated routes', async () => {
    const signOutMock = vi.fn().mockResolvedValue({ error: null });
    const updatePasswordMock = vi.fn().mockResolvedValue({ error: null });
    const authModel = modelWith({ signOut: signOutMock, updatePassword: updatePasswordMock });
    const app = createApp({
      enableLogger: false,
      authModel,
      authenticateHandler: authenticatedRequest(),
    });

    const signOutResponse = await request(app).post('/api/v1/auth/sign-out');
    const passwordResponse = await request(app)
      .post('/api/v1/auth/password/update')
      .send({ password: 'new-strong-password' });

    expect(signOutResponse.status).toBe(204);
    expect(passwordResponse.status).toBe(204);
    expect(signOutMock).toHaveBeenCalledWith(session.access_token);
    expect(updatePasswordMock).toHaveBeenCalledWith(user.id, 'new-strong-password');
  });
});
