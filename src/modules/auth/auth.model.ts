import type { AuthError, Session, SupabaseClient, User } from '@supabase/supabase-js';

export interface AuthSessionResult {
  user: User | null;
  session: Session | null;
  error: AuthError | null;
}

export interface AuthOperationResult {
  error: AuthError | null;
}

export interface AuthModelPort {
  signUp(email: string, password: string, displayName?: string): Promise<AuthSessionResult>;
  signIn(email: string, password: string): Promise<AuthSessionResult>;
  signInWithGoogle(idToken: string, nonce?: string): Promise<AuthSessionResult>;
  refresh(refreshToken: string): Promise<AuthSessionResult>;
  requestPasswordRecovery(email: string): Promise<AuthOperationResult>;
  signOut(accessToken: string): Promise<AuthOperationResult>;
  updatePassword(userId: string, password: string): Promise<AuthOperationResult>;
}

export class SupabaseAuthModel implements AuthModelPort {
  constructor(
    private readonly authClientFactory: () => SupabaseClient,
    private readonly adminClientFactory: () => SupabaseClient,
    private readonly passwordResetRedirectUrlFactory: () => string,
  ) {}

  async signUp(email: string, password: string, displayName?: string): Promise<AuthSessionResult> {
    const credentials = displayName
      ? { email, password, options: { data: { display_name: displayName } } }
      : { email, password };
    const { data, error } = await this.authClientFactory().auth.signUp(credentials);

    return { user: data.user, session: data.session, error };
  }

  async signIn(email: string, password: string): Promise<AuthSessionResult> {
    const { data, error } = await this.authClientFactory().auth.signInWithPassword({
      email,
      password,
    });

    return { user: data.user, session: data.session, error };
  }

  async signInWithGoogle(idToken: string, nonce?: string): Promise<AuthSessionResult> {
    const { data, error } = await this.authClientFactory().auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
      ...(nonce ? { nonce } : {}),
    });

    return { user: data.user, session: data.session, error };
  }

  async refresh(refreshToken: string): Promise<AuthSessionResult> {
    const { data, error } = await this.authClientFactory().auth.refreshSession({
      refresh_token: refreshToken,
    });

    return { user: data.user, session: data.session, error };
  }

  async requestPasswordRecovery(email: string): Promise<AuthOperationResult> {
    const { error } = await this.authClientFactory().auth.resetPasswordForEmail(email, {
      redirectTo: this.passwordResetRedirectUrlFactory(),
    });

    return { error };
  }

  async signOut(accessToken: string): Promise<AuthOperationResult> {
    const { error } = await this.adminClientFactory().auth.admin.signOut(accessToken, 'global');
    return { error };
  }

  async updatePassword(userId: string, password: string): Promise<AuthOperationResult> {
    const { error } = await this.adminClientFactory().auth.admin.updateUserById(userId, {
      password,
    });
    return { error };
  }
}
