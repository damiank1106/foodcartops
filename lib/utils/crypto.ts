import * as Crypto from 'expo-crypto';

export function validatePinFormat(pin: string): boolean {
  const numericRegex = /^[0-9]{4,8}$/;
  return numericRegex.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin
  );
  console.log('[Crypto] Hashed PIN:', pin, '-> first 10 chars:', hash.substring(0, 10));
  return hash;
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const pinHash = await hashPin(pin);
  const isMatch = pinHash === hash;
  console.log('[Crypto] Verify PIN - Input hash first 10:', pinHash.substring(0, 10), 'Stored hash first 10:', hash.substring(0, 10), 'Match:', isMatch);
  return isMatch;
}
