import type { ServiceError } from './service-error';
import type { Result } from './result';
import { fail } from './result';

export class Errors {
  private readonly list: ServiceError[] = [];

  add(code: string, message: string, field?: string): void {
    this.list.push({ code, message, field });
  }

  hasErrors(): boolean {
    return this.list.length > 0;
  }

  toResult<T>(): Result<T> {
    return fail<T>([...this.list]);
  }

  get all(): ReadonlyArray<ServiceError> {
    return this.list;
  }
}
