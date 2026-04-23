import { describe, it, expect } from 'vitest';
import { Errors } from '../common/errors';

describe('Errors', () => {
  it('hasErrors_emptyList_returnsFalse', () => {
    const errors = new Errors();
    expect(errors.hasErrors()).toBe(false);
  });

  it('add_singleError_hasErrorsReturnsTrue', () => {
    const errors = new Errors();
    errors.add('VALIDATION', 'Email is required', 'email');
    expect(errors.hasErrors()).toBe(true);
  });

  it('add_multipleErrors_allStoredInOrder', () => {
    const errors = new Errors();
    errors.add('VALIDATION', 'Email required', 'email');
    errors.add('VALIDATION', 'Name required', 'name');
    expect(errors.all).toHaveLength(2);
    expect(errors.all[0].field).toBe('email');
    expect(errors.all[1].field).toBe('name');
  });

  it('toResult_withErrors_returnsFailResult', () => {
    const errors = new Errors();
    errors.add('VALIDATION', 'Email required', 'email');
    const result = errors.toResult<string>();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('VALIDATION');
      expect(result.errors[0].field).toBe('email');
    }
  });
});
