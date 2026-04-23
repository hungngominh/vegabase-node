import { ok, fail, Errors, type Result, type BaseEntity, type PagedResult } from '@vegabase/core';
import { hasField, type BaseParamModel } from './models/base-param-model';
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

  async getList(param: TParam): Promise<Result<PagedResult<TModel>>> {
    const allowed = await this.permissions.hasPermission(param.callerRoles[0] ?? '', this.screenCode, 'READ');
    if (!allowed) return fail([{ code: 'PERMISSION_DENIED', message: 'Access denied.' }]);

    const where = this.applyFilter({}, param);
    const page = param.page ?? 1;
    const pageSize = param.pageSize ?? 20;

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
    const allowed = await this.permissions.hasPermission(param.callerRoles[0] ?? '', this.screenCode, 'CREATE');
    if (!allowed) return fail([{ code: 'PERMISSION_DENIED', message: 'Access denied.' }]);

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

    const allowed = await this.permissions.hasPermission(param.callerRoles[0] ?? '', this.screenCode, 'UPDATE');
    if (!allowed) return fail([{ code: 'PERMISSION_DENIED', message: 'Access denied.' }]);

    const entityResult = await this.executor.getByIdAsync(this.delegate, param.id);
    if (!entityResult.isSuccess) return fail([{ code: 'DB_TIMEOUT', message: entityResult.error.message }]);
    if (!entityResult.data) return fail([{ code: 'NOT_FOUND', message: 'Record not found.' }]);

    const errors = new Errors();
    await this.checkUpdateCondition(param, errors);
    if (errors.hasErrors()) return errors.toResult();

    const entity = entityResult.data;
    this.applyUpdate(entity, param);

    const data: Record<string, unknown> = {};
    for (const field of this.allowedUpdateFields) {
      if (hasField(param, String(field))) {
        data[String(field)] = (entity as unknown as Record<string, unknown>)[String(field)];
      }
    }

    const result = await this.executor.updateAsync(this.delegate, param.id, data, param.callerUsername);
    if (!result.isSuccess) return fail([{ code: 'DB_TIMEOUT', message: result.error.message }]);

    this.onChanged();
    return ok(result.data);
  }

  async delete(param: TParam): Promise<Result<boolean>> {
    if (!param.id) return fail([{ code: 'VALIDATION', message: 'id is required.', field: 'id' }]);

    const allowed = await this.permissions.hasPermission(param.callerRoles[0] ?? '', this.screenCode, 'DELETE');
    if (!allowed) return fail([{ code: 'PERMISSION_DENIED', message: 'Access denied.' }]);

    const entityResult = await this.executor.getByIdAsync(this.delegate, param.id);
    if (!entityResult.isSuccess) return fail([{ code: 'DB_TIMEOUT', message: entityResult.error.message }]);
    if (!entityResult.data) return fail([{ code: 'NOT_FOUND', message: 'Record not found.' }]);

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
