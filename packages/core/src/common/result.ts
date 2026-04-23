import type { ServiceError } from './service-error';

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; errors: ServiceError[] };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail<T>(errors: ServiceError[]): Result<T> {
  return { ok: false, errors };
}
