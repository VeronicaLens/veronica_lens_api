import type { RequestHandler } from 'express';

import { getEnv } from '../../config/env.js';
import { createAuthClient, createUserClient } from '../../config/supabase.js';
import { AppError } from '../errors/app-error.js';
import type { AppRole } from './auth.types.js';

function getBearerToken(header: string | undefined): string {
  const [scheme, token] = header?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'AUTH_TOKEN_MISSING', 'A valid bearer token is required');
  }

  return token;
}

export const authenticate: RequestHandler = async (request, _response, next) => {
  try {
    const accessToken = getBearerToken(request.header('authorization'));
    const env = getEnv();
    const authClient = createAuthClient(env);
    const { data, error } = await authClient.auth.getClaims(accessToken);

    if (error || !data?.claims.sub) {
      throw new AppError(401, 'AUTH_TOKEN_INVALID', 'The access token is invalid or expired');
    }

    const appMetadata = data.claims.app_metadata as { role?: unknown } | undefined;
    const role: AppRole = appMetadata?.role === 'admin' ? 'admin' : 'user';

    request.auth = {
      accessToken,
      userId: data.claims.sub,
      role,
      supabase: createUserClient(env, accessToken),
    };

    next();
  } catch (error) {
    next(error);
  }
};
