export interface BaseParamModel {
  page?: number;
  pageSize?: number;
  keyword?: string;
  sortBy?: string;
  sortDesc?: boolean;
  updatedFields?: string[];
  callerUsername: string;
  callerRoles: string[];
  id?: string;
}

export function hasField(param: BaseParamModel, field: string): boolean {
  if (!param.updatedFields || param.updatedFields.length === 0) return true;
  return param.updatedFields.includes(field);
}
