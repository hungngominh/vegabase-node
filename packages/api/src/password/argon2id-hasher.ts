import argon2 from 'argon2';
import type { PasswordHasher } from './password-hasher';

export interface Argon2Options {
  timeCost?: number;
  memoryCost?: number;
  parallelism?: number;
  hashLength?: number;
}

export class Argon2idHasher implements PasswordHasher {
  constructor(private readonly options: Argon2Options = {}) {}

  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      timeCost: this.options.timeCost ?? 3,
      memoryCost: this.options.memoryCost ?? 65536,
      parallelism: this.options.parallelism ?? 4,
      hashLength: this.options.hashLength ?? 32,
    });
  }

  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // Malformed/legacy hash, OOM, or crypto error — operationally indistinguishable
      // from "wrong password" to the caller. Returning false preserves SEC-05 (no leaks
      // about hash internals) and avoids 500s from corrupt rows in the user table.
      return false;
    }
  }
}
