import type { ServiceError } from './service-error';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  errors?: ServiceError[];
  traceId: string;
}

export function successResponse<T>(data: T, traceId: string): ApiResponse<T> {
  return { success: true, data, traceId };
}

export function failResponse<T>(errors: ServiceError[], traceId: string): ApiResponse<T> {
  return { success: false, errors, traceId };
}
