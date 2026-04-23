import { describe, it, expect } from 'vitest';
import { hasField } from '../models/base-param-model';
import type { BaseParamModel } from '../models/base-param-model';

describe('hasField', () => {
  const base: BaseParamModel = { callerUsername: 'user', callerRoles: ['ADMIN'] };

  it('hasField_noUpdatedFields_returnsTrue', () => {
    expect(hasField(base, 'name')).toBe(true);
  });

  it('hasField_emptyUpdatedFields_returnsTrue', () => {
    expect(hasField({ ...base, updatedFields: [] }, 'name')).toBe(true);
  });

  it('hasField_fieldInList_returnsTrue', () => {
    expect(hasField({ ...base, updatedFields: ['name', 'email'] }, 'name')).toBe(true);
  });

  it('hasField_fieldNotInList_returnsFalse', () => {
    expect(hasField({ ...base, updatedFields: ['email'] }, 'name')).toBe(false);
  });
});
