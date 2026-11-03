import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDeviceId } from './device';

describe('getDeviceId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('creates one random ID and keeps it in localStorage', () => {
    window.localStorage.clear();
    const first = getDeviceId();
    expect(first).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(getDeviceId()).toBe(first);
    expect(window.localStorage.getItem('trivia-device-id')).toBe(first);
  });

  it('replaces a stored value that does not look like an ID', () => {
    window.localStorage.setItem('trivia-device-id', 'bad value with spaces');
    expect(getDeviceId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('still works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const id = getDeviceId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(getDeviceId()).toBe(id);
  });
});
