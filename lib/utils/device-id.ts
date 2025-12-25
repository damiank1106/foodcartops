import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const DEVICE_ID_KEY = 'device_id';

let cachedDeviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  try {
    let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    
    if (!deviceId) {
      deviceId = Crypto.randomUUID();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
      console.log('[DeviceID] Generated new device ID:', deviceId);
    }
    
    cachedDeviceId = deviceId;
    return deviceId;
  } catch (error) {
    console.error('[DeviceID] Error getting device ID:', error);
    cachedDeviceId = `fallback-${Date.now()}`;
    return cachedDeviceId;
  }
}
