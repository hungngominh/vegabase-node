import { describe, it, expect } from 'vitest';
import { dbSuccess, dbFailure } from '../infrastructure/db-actions/db-result';

describe('DbResult', () => {
  it('dbSuccess_returnsSuccessResult', () => {
    const result = dbSuccess('data', 10);
    expect(result.isSuccess).toBe(true);
    if (result.isSuccess) {
      expect(result.data).toBe('data');
      expect(result.durationMs).toBe(10);
    }
  });

  it('dbFailure_returnsFailureResult', () => {
    const result = dbFailure({ code: 'P2002', message: 'Unique constraint' }, 5);
    expect(result.isSuccess).toBe(false);
    if (!result.isSuccess) {
      expect(result.error.code).toBe('P2002');
    }
  });
});
