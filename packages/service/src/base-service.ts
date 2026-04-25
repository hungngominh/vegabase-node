import { ok, fail, Errors, type Result, type BaseEntity, type PagedResult } from '@vegabase/core';
import { hasField, MAX_PAGE_SIZE, type BaseParamModel } from './models/base-param-model';
import type { DbActionExecutor } from './infrastructure/db-actions/db-action-executor';
import type { PermissionCache } from './infrastructure/cache/permission-cache';
import type { PrismaDelegate } from './infrastructure/db-actions/prisma-delegate';

export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export const noopLogger: Logger = { info: () => {}, error: () => {} };

export abstract class BaseService<TModel extends BaseEntity, TParam extends BaseParamModel> {
  protected abstract readonly screenCode: string;
  protected abstract readonly delegate: PrismaDelegate<TModel>;
  protected abstract readonly allowedUpdateFields: ReadonlyArray<keyof TModel>;

  constructor(
    protected readonly executor: DbActionExecutor,
    protected readonly permissions: PermissionCache,
    protected readonly logger: Logger = noopLogger,
  ) {}

  /** V1: admin bypass is checked first, before screenCode guard, then hasPermission. */
  private async isAllowed(callerRoles: string[], action: string): Promise<boolean> {
    if (callerRoles.some(r => r.toLowerCase() === 'admin')) return true;
    if (!this.screenCode) {
      this.logger.error('[BaseService] screenCode is empty — all non-admin requests denied (service misconfigured)');
      return false;
    }
    return this.permissions.hasPermission(callerRoles[0] ?? '', this.screenCode, action);
  }

  async getList(param: TParam): Promise<Result<PagedResult<TModel>>> {
    if (!await this.isAllowed(param.callerRoles, 'READ'))
      return fail([{ code: 'PERMISSION_DENIED', message: 'Access denied.' }]);

    const where = this.applyFilter({}, param);
    const page = Math.max(1, param.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, param.pageSize ?? 20));

    const [itemsResult, countResult] = await Promise.all([
      this.executor.queryAsync(this.delegate, where, {
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: param.sortBy ? { [param.sortBy]: param.sortDesc ? 'desc' : 'asc' } : undefined,
      }),
      this.executor.countAsync(this.delegate, where),
    ]);

    if (!itemsResult.isSuccess) return fail([{ code: 'DB_TIMEOUT', message: itemsResult.error.message }]);
    if (!countResult.isSuccess) return fail([{ code: 'DB_TIMEOUT', message: countResult.error.message }]);

    const errors = new Errors();
    await this.refineListData(itemsResult.data, param, errors);
    if (errors.hasErrors()) return errors.toResult();

    return ok({ items: itemsResult.data, total: countResult.data });
  }

  async add(param: TParam): Promise<Result<TModel>> {
    if (!await this.isAllowed(param.callerRoles, 'CREATE'))
      return fail([{ code: 'PERMISSION_DENIED', message: 'Access denied.' }]);

    const errors = new Errors();
    await this.checkAddCondition(param, errors);
    if (errors.hasErrors()) return errors.toResult();

    const data = this.buildNewEntity(param);
    const result = await this.executor.addAsync(this.delegate, data, param.callerUsername);
    if (!result.isSuccess) {
      if (result.error.code === 'P2002') return fail([{ code: 'DUPLICATE_KEY', message: 'Record already exists.' }]);
      return fail([{ code: 'DB_TIMEOUT', message: result.error.message }]);
    }

    this.onChanged();
    return ok(result.data);
  }

  async updateField(param: TParam): Promise<Result<TModel>> {
    if (!param.id) return fail([{ code: 'VALIDATION', message: 'id is required.', field: 'id' }]);

    if (!await this.isAllowed(param.callerRoles, 'UPDATE'))
      return fail([{ code: 'PERMISSION_DENIED', message: 'Access denied.' }]);

    const entityResult = await this.executor.getByIdAsync(this.delegate, param.id);
    if (!entityResult.isSuccess) return fail([{ code: 'DB_TIMEOUT', message: entityResult.error.message }]);
    if (!entityResult.data) return fail([{ code: 'NOT_FOUND', message: 'Record not found.' }]);

    const errors = new Errors();
    await this.checkUpdateCondition(param, errors);
    if (errors.hasErrors()) return errors.toResult();

    const entity = entityResult.data;
    try {
      this.applyUpdate(entity, param);
    } catch (err) {
      this.logger.error('[BaseService] applyUpdate threw — entity not persisted', err);
      return fail([{ code: 'UNKNOWN', message: 'Update failed.' }]);
    }

    const data: Record<string, unknown> = {};
    for (const field of this.allowedUpdateFields) {
      if (hasField(param, String(field))) {
        data[String(field)] = (entity as unknown as Record<string, unknown>)[String(field)];
      }
    }

    if (Object.keys(data).length === 0) {
      this.onChanged();
      return ok(entity as unknown as TModel);
    }

    const result = await this.executor.updateAsync(this.delegate, param.id, data, param.callerUsername);
    if (!result.isSuccess) return fail([{ code: 'DB_TIMEOUT', message: result.error.message }]);

    this.onChanged();
    return ok(result.data);
  }

  async delete(param: TParam): Promise<Result<boolean>> {
    if (!param.id) return fail([{ code: 'VALIDATION', message: 'id is required.', field: 'id' }]);

    if (!await this.isAllowed(param.callerRoles, 'DELETE'))
      return fail([{ code: 'PERMISSION_DENIED', message: 'Access denied.' }]);

    const entityResult = await this.executor.getByIdAsync(this.delegate, param.id);
    if (!entityResult.isSuccess) return fail([{ code: 'DB_TIMEOUT', message: entityResult.error.message }]);
    if (!entityResult.data) return fail([{ code: 'NOT_FOUND', message: 'Record not found.' }]);

    const errors = new Errors();
    await this.checkDeleteCondition(param, errors);
    if (errors.hasErrors()) return errors.toResult();

    const result = await this.executor.softDeleteAsync(this.delegate, param.id, param.callerUsername);
    if (!result.isSuccess) return fail([{ code: 'DB_TIMEOUT', message: result.error.message }]);

    this.onChanged();
    return ok(true);
  }

  protected applyFilter(where: Record<string, unknown>, _param: TParam): Record<string, unknown> {
    return { ...where, isDeleted: false };
  }

  protected async checkAddCondition(_param: TParam, _errors: Errors): Promise<void> {}
  protected async checkUpdateCondition(_param: TParam, _errors: Errors): Promise<void> {}
  protected async checkDeleteCondition(_param: TParam, _errors: Errors): Promise<void> {}

  protected applyUpdate(entity: TModel, param: TParam): void {
    for (const field of this.allowedUpdateFields) {
      const key = String(field);
      if (hasField(param, key) && key in (param as unknown as Record<string, unknown>)) {
        (entity as unknown as Record<string, unknown>)[key] = (param as unknown as Record<string, unknown>)[key];
      }
    }
  }

  protected onChanged(): void {}

  protected async refineListData(_items: TModel[], _param: TParam, _errors: Errors): Promise<void> {}

  protected abstract buildNewEntity(param: TParam): Record<string, unknown>;
}
