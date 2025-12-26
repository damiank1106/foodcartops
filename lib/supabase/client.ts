import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

let supabaseClient: SupabaseClient | null = null;
let syncDisabled = false;
let cachedCredentials: { url: string; key: string } | null = null;

interface CredentialValidation {
  isValid: boolean;
  reason?: string;
}

export function validateSupabaseUrl(url: string | null | undefined): CredentialValidation {
  if (!url || url.trim() === '') {
    return { isValid: false, reason: 'URL is required' };
  }
  if (!url.startsWith('https://')) {
    return { isValid: false, reason: 'URL must start with https://' };
  }
  if (!url.includes('.supabase.co')) {
    return { isValid: false, reason: 'URL must contain .supabase.co' };
  }
  return { isValid: true };
}

export function validateSupabaseKey(key: string | null | undefined): CredentialValidation {
  if (!key || key.trim() === '') {
    return { isValid: false, reason: 'Key is required' };
  }
  if (key.startsWith('sb_')) {
    return { isValid: false, reason: 'Use anon public key (starts with eyJ...)' };
  }
  if (!key.startsWith('eyJ')) {
    return { isValid: false, reason: 'Anon key should start with eyJ' };
  }
  if (key.length < 100) {
    return { isValid: false, reason: 'Key too short' };
  }
  return { isValid: true };
}

export async function getSupabaseCredentials(): Promise<{ url: string; key: string } | null> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  try {
    const overrideUrl = await SecureStore.getItemAsync('supabase_override_url');
    const overrideKey = await SecureStore.getItemAsync('supabase_override_anon_key');

    if (overrideUrl && overrideKey) {
      const urlValidation = validateSupabaseUrl(overrideUrl);
      const keyValidation = validateSupabaseKey(overrideKey);

      if (urlValidation.isValid && keyValidation.isValid) {
        cachedCredentials = { url: overrideUrl, key: overrideKey };
        console.log('[Supabase] Using SecureStore overrides');
        return cachedCredentials;
      } else {
        console.warn('[Supabase] Invalid SecureStore overrides:', urlValidation.reason || keyValidation.reason);
      }
    }
  } catch (error) {
    console.error('[Supabase] Failed to read SecureStore:', error);
  }

  const envUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const envKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
                 process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                 Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_KEY ||
                 process.env.EXPO_PUBLIC_SUPABASE_KEY;

  if (!envUrl || !envKey) {
    console.warn('[Supabase] Missing credentials');
    return null;
  }

  const urlValidation = validateSupabaseUrl(envUrl);
  const keyValidation = validateSupabaseKey(envKey);

  if (!urlValidation.isValid) {
    console.error('[Supabase] Invalid URL:', urlValidation.reason);
    return null;
  }

  if (!keyValidation.isValid) {
    console.error('[Supabase] Invalid key type:', keyValidation.reason);
    return null;
  }

  cachedCredentials = { url: envUrl, key: envKey };
  return cachedCredentials;
}

export async function saveSupabaseCredentials(url: string, key: string): Promise<void> {
  await SecureStore.setItemAsync('supabase_override_url', url);
  await SecureStore.setItemAsync('supabase_override_anon_key', key);
  cachedCredentials = { url, key };
  supabaseClient = null;
  syncDisabled = false;
}

export async function clearSupabaseCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync('supabase_override_url');
  await SecureStore.deleteItemAsync('supabase_override_anon_key');
  cachedCredentials = null;
  supabaseClient = null;
  syncDisabled = false;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (syncDisabled) {
    return null;
  }

  if (supabaseClient) {
    return supabaseClient;
  }

  return null;
}

export async function initSupabaseClient(): Promise<SupabaseClient | null> {
  if (syncDisabled) {
    return null;
  }

  if (supabaseClient) {
    return supabaseClient;
  }

  const credentials = await getSupabaseCredentials();
  if (!credentials) {
    console.warn('[Supabase] Missing credentials');
    console.warn('[Supabase] Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment.');
    syncDisabled = true;
    return null;
  }

  try {
    supabaseClient = createClient(credentials.url, credentials.key, {
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

export async function isSyncEnabled(): Promise<boolean> {
  if (syncDisabled) {
    return false;
  }
  const client = await initSupabaseClient();
  return client !== null;
}
