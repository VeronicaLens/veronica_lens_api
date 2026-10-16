import { createClient } from '@supabase/supabase-js';

import type { Env } from './env.js';

const serverAuthOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};

export function createAuthClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, serverAuthOptions);
}

export function createUserClient(env: Env, accessToken: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    ...serverAuthOptions,
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

export function createAdminClient(env: Env) {
  if (!env.SUPABASE_SECRET_KEY) {
    throw new Error('SUPABASE_SECRET_KEY is required for administrative operations');
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, serverAuthOptions);
}
