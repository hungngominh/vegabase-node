import { describe, it, expect, vi } from 'vitest';
import { DbActionExecutor } from '../infrastructure/db-actions/db-action-executor';
import type { PrismaDelegate } from '../infrastructure/db-actions/prisma-delegate';

type TestEntity = { id: string; name: string; isDeleted: boolean; logCreatedDate: Date; logCreatedBy: string; logUpdatedDate: Date | null; logUpdatedBy: string | null };

function makeDelegate(overrides: Partial<PrismaDelegate<TestEntity>> = {}): PrismaDelegate<TestEntity> {
  return {
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    ...overrides,
  };
}

describe('DbActionExecutor', () => {
  it('addAsync_success_returnsIsSuccessTrue', async () => {
    const entity: TestEntity = { id: 'abc', name: 'Test', isDeleted: false, logCreatedDate: new Date(), logCreatedBy: 'user', logUpdatedDate: null, logUpdatedBy: null };
    const delegate = makeDelegate({ create: vi.fn().mockResolvedValue(entity) });
    const executor = new DbActionExecutor();

    const result = await executor.addAsync(delegate, { name: 'Test' }, 'user');

    expect(result.isSuccess).toBe(true);
    if (result.isSuccess) expect(result.data).toBe(entity);
  });

  it('addAsync_delegateThrows_returnsIsSuccessFalse', async () => {
    const delegate = makeDelegate({ create: vi.fn().mockRejectedValue(new Error('db error')) });
    const executor = new DbActionExecutor();

    const result = await executor.addAsync(delegate, { name: 'Test' }, 'user');

    expect(result.isSuccess).toBe(false);
  });

  it('addAsync_timeout_returnsDbTimeoutCode', async () => {
    const delegate = makeDelegate({
      create: vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 500))),
    });
    const executor = new DbActionExecutor({ timeoutMs: 10, retries: 0 });

    const result = await executor.addAsync(delegate, { name: 'Test' }, 'user');

    expect(result.isSuccess).toBe(false);
    if (!result.isSuccess) expect(result.error.code).toBe('DB_TIMEOUT');
  });

  it('addAsync_setsAuditFields', async () => {
    let captured: Record<string, unknown> = {};
    const delegate = makeDelegate({
      create: vi.fn().mockImplementation(({ data }) => { captured = data; return Promise.resolve({ ...data }); }),
    });
    const executor = new DbActionExecutor();

    await executor.addAsync(delegate, { name: 'Alice' }, 'creator');

    expect(captured['logCreatedBy']).toBe('creator');
    expect(captured['isDeleted']).toBe(false);
    expect(captured['id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('queryAsync_success_returnsItems', async () => {
    const items: TestEntity[] = [{ id: '1', name: 'A', isDeleted: false, logCreatedDate: new Date(), logCreatedBy: 'u', logUpdatedDate: null, logUpdatedBy: null }];
    const delegate = makeDelegate({ findMany: vi.fn().mockResolvedValue(items) });
    const executor = new DbActionExecutor();

    const result = await executor.queryAsync(delegate, { isDeleted: false });

    expect(result.isSuccess).toBe(true);
    if (result.isSuccess) expect(result.data).toHaveLength(1);
  });

  it('softDeleteAsync_success_returnsTrue', async () => {
    const entity: TestEntity = { id: '1', name: 'A', isDeleted: false, logCreatedDate: new Date(), logCreatedBy: 'u', logUpdatedDate: null, logUpdatedBy: null };
    const delegate = makeDelegate({ update: vi.fn().mockResolvedValue({ ...entity, isDeleted: true }) });
    const executor = new DbActionExecutor();

    const result = await executor.softDeleteAsync(delegate, '1', 'user');

    expect(result.isSuccess).toBe(true);
    if (result.isSuccess) expect(result.data).toBe(true);
  });
});
