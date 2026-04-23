import { describe, it, expect } from 'vitest';
import { Argon2idHasher } from '../password/argon2id-hasher';

describe('Argon2idHasher', () => {
  // Use low-cost params so tests run fast
  const hasher = new Argon2idHasher({ timeCost: 2, memoryCost: 8192, parallelism: 1 });

  it('hash_returnsHashedString', async () => {
    const hash = await hasher.hash('password123');
    expect(hash).toBeTruthy();
    expect(hash).not.toBe('password123');
  });

  it('hash_differentCallsReturnDifferentHashes', async () => {
    const hash1 = await hasher.hash('password123');
    const hash2 = await hasher.hash('password123');
    expect(hash1).not.toBe(hash2); // argon2 uses random salt
  });

  it('verify_correctPassword_returnsTrue', async () => {
    const hash = await hasher.hash('mySecret');
    const result = await hasher.verify('mySecret', hash);
    expect(result).toBe(true);
  });

  it('verify_wrongPassword_returnsFalse', async () => {
    const hash = await hasher.hash('mySecret');
    const result = await hasher.verify('wrongPassword', hash);
    expect(result).toBe(false);
  });
}, { timeout: 30_000 });
