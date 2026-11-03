// Anonymous device ID for usage stats: a random value created once and kept in
// this browser's localStorage. It identifies nothing about the person; it only
// lets the stats tell "one device played five games" from "five devices played
// once". Private browsing or clearing site data simply starts a new ID.

const STORAGE_KEY = 'trivia-device-id';
const VALID_ID = /^[A-Za-z0-9_-]{8,64}$/;

let memoryId: string | null = null;

function randomId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && VALID_ID.test(existing)) return existing;
    const id = randomId();
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // Storage blocked (some private modes): keep one ID for this page load.
    memoryId ??= randomId();
    return memoryId;
  }
}
