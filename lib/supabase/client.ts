import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

let supabaseClient: SupabaseClient | null = null;
let syncDisabled = false;

export function getSupabaseClient(): SupabaseClient | null {
  if (syncDisabled) {
    return null;
  }

  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
                         Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_KEY ||
                         process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                         process.env.EXPO_PUBLIC_SUPABASE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Supabase] Missing credentials');
    console.warn('[Supabase] Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment.');
    syncDisabled = true;
    return null;
  }

  try {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    });
    console.log('[Supabase] Client ready');
    return supabaseClient;
  } catch (error) {
    console.error('[Supabase] Failed to initialize client:', error);
    syncDisabled = true;
    return null;
  }
}

export function isSyncEnabled(): boolean {
  return !syncDisabled && getSupabaseClient() !== null;
}
