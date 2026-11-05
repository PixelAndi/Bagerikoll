// The admin PIN. The app runs only in the browser and its code is public, so this is a lock
// against casual use at a workstation, not real security: what an admin does is hidden from the
// station view, not encrypted. The PIN is kept only as a salted SHA-256 hash; an admin can change
// it (the new hash is stored on the device). After five wrong tries the PIN pad waits a minute.

const SALT = 'bagerikoll-admin-v1';
/** sha256(SALT + the default PIN) – the PIN given in the project brief. */
export const DEFAULT_PIN_HASH = 'bd31b428ee9cc17ea60ec82aa0783075c2107eb697ded837b010f71379df07f2';

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(SALT + pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function checkPin(pin: string, storedHash: string | undefined): Promise<boolean> {
  return (await hashPin(pin)) === (storedHash ?? DEFAULT_PIN_HASH);
}

export const MAX_TRIES = 5;
export const WAIT_MS = 60 * 1000;
/** Admin mode closes by itself after this long without a tap. */
export const ADMIN_IDLE_MS = 10 * 60 * 1000;
