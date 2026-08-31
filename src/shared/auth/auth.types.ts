import type { SupabaseClient } from '@supabase/supabase-js';

export type AppRole = 'user' | 'admin';

export interface AuthContext {
  accessToken: string;
  userId: string;
  role: AppRole;
  supabase: SupabaseClient;
}
