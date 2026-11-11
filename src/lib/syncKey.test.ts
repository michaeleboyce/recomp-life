import { describe, it, expect, beforeEach } from 'vitest';
import { getSyncKey, setSyncKey, syncAuthHeaders } from './syncKey';

describe('syncKey', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when no key is stored', () => {
    expect(getSyncKey()).toBeNull();
    expect(syncAuthHeaders()).toEqual({});
  });

  it('stores and returns a trimmed key', () => {
    setSyncKey('  my passphrase  ');
    expect(getSyncKey()).toBe('my passphrase');
    expect(syncAuthHeaders()).toEqual({ Authorization: 'Bearer my passphrase' });
  });

  it('clears the key when set to an empty value', () => {
    setSyncKey('abc');
    setSyncKey('   ');
    expect(getSyncKey()).toBeNull();
  });
});
