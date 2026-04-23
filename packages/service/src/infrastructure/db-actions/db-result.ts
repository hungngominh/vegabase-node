export interface DbError {
  code: string;
  message: string;
  originalError?: unknown;
}

export type DbResult<T> =
  | { isSuccess: true; data: T; durationMs: number }
  | { isSuccess: false; error: DbError; durationMs: number };

export function dbSuccess<T>(data: T, durationMs: number): DbResult<T> {
  return { isSuccess: true, data, durationMs };
}

export function dbFailure<T>(error: DbError, durationMs: number): DbResult<T> {
  return { isSuccess: false, error, durationMs };
}
