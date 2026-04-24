export const MAX_PAGE_SIZE = 1000;

export interface BaseParamModel {
  page?: number;
  pageSize?: number;
  keyword?: string;
  sortBy?: string;
  sortDesc?: boolean;
  /** Fields included in a partial update. Empty / absent = no fields updated (v2 semantic). */
  updatedFields?: string[];
  callerUsername: string;
  callerRoles: string[];
  id?: string;
}

/**
 * Returns true only when `field` is explicitly listed in `updatedFields`.
 * Empty or absent `updatedFields` means no fields are updated (v2 semantic — was "all fields" in v1).
 */
export function hasField(param: BaseParamModel, field: string): boolean {
  return param.updatedFields?.includes(field) ?? false;
}
