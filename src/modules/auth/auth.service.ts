import type {
  AuthError,
  Session as SupabaseSession,
  User as SupabaseUser,
} from '@supabase/supabase-js';

import { AppError } from '../../shared/errors/app-error.js';
import type { AppRole } from '../../shared/auth/auth.types.js';
import type { AuthModelPort } from './auth.model.js';
import type { GoogleSignInInput, SignInInput, SignUpInput } from './auth.schemas.js';

interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: AppRole;
  createdAt: string;
  updatedAt: string;
}

interface PublicSession {
  id: string;
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  tokenType: 'bearer';
  expiresAt: string;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toPublicUser(user: SupabaseUser): PublicUser {
  if (!user.email) {
    throw new AppError(
      502,
      'AUTH_RESPONSE_INVALID',
      'Authentication provider returned invalid data',
    );
  }

  return {
    id: user.id,
    email: user.email,
    displayName: optionalString(user.user_metadata.display_name),
    avatarUrl: optionalString(user.user_metadata.avatar_url),
    role: user.app_metadata.role === 'admin' ? 'admin' : 'user',
    createdAt: user.created_at,
    updatedAt: user.updated_at ?? user.created_at,
  };
}

function readSessionId(accessToken: string): string {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) throw new Error('Missing JWT payload');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      session_id?: unknown;
    };
    if (typeof claims.session_id !== 'string') throw new Error('Missing session identifier');
    return claims.session_id;
  } catch {
    throw new AppError(
      502,
      'AUTH_RESPONSE_INVALID',
      'Authentication provider returned invalid data',
    );
  }
}

function toPublicSession(session: SupabaseSession): PublicSession {
  if (!session.expires_at) {
    throw new AppError(
      502,
      'AUTH_RESPONSE_INVALID',
      'Authentication provider returned invalid data',
    );
  }

  return {
    id: readSessionId(session.access_token),
    user: toPublicUser(session.user),
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    tokenType: 'bearer',
    expiresAt: new Date(session.expires_at * 1000).toISOString(),
  };
}

function throwAuthError(error: AuthError, fallbackCode: string): never {
  const code = error.code;

  if (code === 'invalid_credentials' || code === 'refresh_token_not_found') {
    throw new AppError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid authentication credentials');
  }
  if (code === 'email_not_confirmed') {
    throw new AppError(403, 'AUTH_EMAIL_NOT_CONFIRMED', 'Email confirmation is required');
  }
  if (code === 'user_already_exists' || code === 'email_exists') {
    throw new AppError(409, 'AUTH_ACCOUNT_EXISTS', 'An account already exists for this email');
  }
  if (code === 'over_email_send_rate_limit' || error.status === 429) {
    throw new AppError(429, 'AUTH_RATE_LIMITED', 'Too many authentication attempts');
  }

  throw new AppError(400, fallbackCode, 'Authentication request could not be completed');
}

export class AuthService {
  constructor(private readonly authModel: AuthModelPort) {}

  async signUp(input: SignUpInput) {
    const result = await this.authModel.signUp(input.email, input.password, input.displayName);
    if (result.error) throwAuthError(result.error, 'AUTH_SIGN_UP_FAILED');
    if (!result.user) {
      throw new AppError(
        502,
        'AUTH_RESPONSE_INVALID',
        'Authentication provider returned invalid data',
      );
    }

    return {
      user: toPublicUser(result.user),
      session: result.session ? toPublicSession(result.session) : null,
      confirmationRequired: !result.session,
    };
  }

  async signIn(input: SignInInput) {
    const result = await this.authModel.signIn(input.email, input.password);
    if (result.error) throwAuthError(result.error, 'AUTH_SIGN_IN_FAILED');
    if (!result.session) {
      throw new AppError(
        502,
        'AUTH_RESPONSE_INVALID',
        'Authentication provider returned invalid data',
      );
    }
    return toPublicSession(result.session);
  }

  async signInWithGoogle(input: GoogleSignInInput) {
    const result = await this.authModel.signInWithGoogle(input.idToken, input.nonce);
    if (result.error) throwAuthError(result.error, 'AUTH_SIGN_IN_FAILED');
    if (!result.session) {
      throw new AppError(
        502,
        'AUTH_RESPONSE_INVALID',
        'Authentication provider returned invalid data',
      );
    }
    return toPublicSession(result.session);
  }

  async refresh(refreshToken: string) {
    const result = await this.authModel.refresh(refreshToken);
    if (result.error) throwAuthError(result.error, 'AUTH_REFRESH_FAILED');
    if (!result.session) {
      throw new AppError(401, 'AUTH_SESSION_EXPIRED', 'The session has expired');
    }
    return toPublicSession(result.session);
  }

  async requestPasswordRecovery(email: string): Promise<void> {
    const { error } = await this.authModel.requestPasswordRecovery(email);
    if (error?.status === 429 || error?.code === 'over_email_send_rate_limit') {
      throwAuthError(error, 'AUTH_RECOVERY_FAILED');
    }
    // Do not reveal whether an account exists for the supplied email.
  }

  async signOut(accessToken: string): Promise<void> {
    const { error } = await this.authModel.signOut(accessToken);
    if (error && error.code !== 'session_not_found') {
      throwAuthError(error, 'AUTH_SIGN_OUT_FAILED');
    }
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    const { error } = await this.authModel.updatePassword(userId, password);
    if (error) throwAuthError(error, 'AUTH_PASSWORD_UPDATE_FAILED');
  }
}
