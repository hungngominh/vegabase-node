import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseService } from '../base-service';
import type { BaseParamModel } from '../models/base-param-model';
import type { DbActionExecutor } from '../infrastructure/db-actions/db-action-executor';
import type { PermissionCache } from '../infrastructure/cache/permission-cache';
import type { PrismaDelegate } from '../infrastructure/db-actions/prisma-delegate';
import { dbSuccess, dbFailure } from '../infrastructure/db-actions/db-result';
import type { BaseEntity } from '@vegabase/core';
import { Errors } from '@vegabase/core';

interface UserEntity extends BaseEntity {
  name: string;
  email: string;
}

interface UserParam extends BaseParamModel {
  name?: string;
  email?: string;
}

class TestUserService extends BaseService<UserEntity, UserParam> {
  protected readonly screenCode = 'USERS';
  protected readonly delegate: PrismaDelegate<UserEntity>;
  protected readonly allowedUpdateFields = ['name', 'email'] as const satisfies ReadonlyArray<keyof UserEntity>;

  constructor(executor: DbActionExecutor, permissions: PermissionCache) {
    super(executor, permissions);
    this.delegate = {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    };
  }

  protected buildNewEntity(param: UserParam): Record<string, unknown> {
    return { name: param.name ?? '', email: param.email ?? '' };
  }
}

function makeExecutor(): DbActionExecutor {
  return {
    addAsync: vi.fn(),
    updateAsync: vi.fn(),
    softDeleteAsync: vi.fn(),
    queryAsync: vi.fn(),
    getByIdAsync: vi.fn(),
    countAsync: vi.fn(),
  } as unknown as DbActionExecutor;
}

function makePermissions(hasPermission = true): PermissionCache {
  return { hasPermission: vi.fn().mockResolvedValue(hasPermission), invalidate: vi.fn(), invalidateAll: vi.fn() } as unknown as PermissionCache;
}

function makeParam(overrides: Partial<UserParam> = {}): UserParam {
  return { callerUsername: 'user', callerRoles: ['ADMIN'], ...overrides };
}

function makeEntity(overrides: Partial<UserEntity> = {}): UserEntity {
  return { id: 'eid', name: 'Alice', email: 'a@b.com', isDeleted: false, logCreatedDate: new Date(), logCreatedBy: 'user', logUpdatedDate: null, logUpdatedBy: null, ...overrides };
}

describe('BaseService.add', () => {
  it('add_noPermission_returnsPermissionDenied', async () => {
    const svc = new TestUserService(makeExecutor(), makePermissions(false));
    const result = await svc.add(makeParam());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].code).toBe('PERMISSION_DENIED');
  });

  it('add_validParam_callsExecutorAddAsync', async () => {
    const executor = makeExecutor();
    const entity = makeEntity();
    vi.mocked(executor.addAsync).mockResolvedValue(dbSuccess(entity, 5));
    const svc = new TestUserService(executor, makePermissions());

    const result = await svc.add(makeParam({ name: 'Alice', email: 'a@b.com' }));

    expect(result.ok).toBe(true);
    expect(executor.addAsync).toHaveBeenCalledOnce();
  });

  it('add_dbFailure_returnsError', async () => {
    const executor = makeExecutor();
    vi.mocked(executor.addAsync).mockResolvedValue(dbFailure({ code: 'P1001', message: 'conn refused' }, 5));
    const svc = new TestUserService(executor, makePermissions());

    const result = await svc.add(makeParam({ name: 'Alice' }));

    expect(result.ok).toBe(false);
  });

  it('checkAddCondition_addsError_addReturnsEarly', async () => {
    class StrictService extends TestUserService {
      protected override async checkAddCondition(param: UserParam, errors: Errors): Promise<void> {
        errors.add('VALIDATION', 'Name required', 'name');
      }
    }
    const executor = makeExecutor();
    const svc = new StrictService(executor, makePermissions());

    const result = await svc.add(makeParam());

    expect(result.ok).toBe(false);
    expect(executor.addAsync).not.toHaveBeenCalled();
  });
});

describe('BaseService.delete', () => {
  it('delete_noId_returnsValidationError', async () => {
    const svc = new TestUserService(makeExecutor(), makePermissions());
    const result = await svc.delete(makeParam());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].code).toBe('VALIDATION');
  });

  it('delete_entityNotFound_returnsNotFound', async () => {
    const executor = makeExecutor();
    vi.mocked(executor.getByIdAsync).mockResolvedValue(dbSuccess(null, 5));
    const svc = new TestUserService(executor, makePermissions());

    const result = await svc.delete(makeParam({ id: 'missing' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].code).toBe('NOT_FOUND');
  });

  it('delete_exists_callsSoftDelete', async () => {
    const executor = makeExecutor();
    vi.mocked(executor.getByIdAsync).mockResolvedValue(dbSuccess(makeEntity(), 5));
    vi.mocked(executor.softDeleteAsync).mockResolvedValue(dbSuccess(true, 5));
    const svc = new TestUserService(executor, makePermissions());

    const result = await svc.delete(makeParam({ id: 'eid' }));

    expect(result.ok).toBe(true);
    expect(executor.softDeleteAsync).toHaveBeenCalledOnce();
  });
});

describe('BaseService.getList', () => {
  it('getList_success_returnsPagedResult', async () => {
    const executor = makeExecutor();
    const entity = makeEntity();
    vi.mocked(executor.queryAsync).mockResolvedValue(dbSuccess([entity], 5));
    vi.mocked(executor.countAsync).mockResolvedValue(dbSuccess(1, 5));
    const svc = new TestUserService(executor, makePermissions());

    const result = await svc.getList(makeParam());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.total).toBe(1);
    }
  });
});
