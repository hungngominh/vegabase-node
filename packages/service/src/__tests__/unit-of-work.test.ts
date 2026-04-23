import { describe, it, expect, vi } from 'vitest';
import { UnitOfWork } from '../infrastructure/db-actions/unit-of-work';

describe('UnitOfWork', () => {
  function makePrisma(transactionImpl?: (fn: (tx: unknown) => Promise<void>) => Promise<void>) {
    return {
      $transaction: vi.fn().mockImplementation(transactionImpl ?? ((fn: (tx: unknown) => Promise<void>) => fn({}))),
    } as unknown as import('@prisma/client').PrismaClient;
  }

  it('saveAsync_noOps_returnsSuccess', async () => {
    const uow = new UnitOfWork(makePrisma());
    const result = await uow.saveAsync();
    expect(result.isSuccess).toBe(true);
  });

  it('saveAsync_withEnqueuedOp_executesOp', async () => {
    const op = vi.fn().mockResolvedValue(undefined);
    const uow = new UnitOfWork(makePrisma());
    uow.enqueue(op);

    await uow.saveAsync();

    expect(op).toHaveBeenCalledOnce();
  });

  it('saveAsync_transactionFails_returnsFailure', async () => {
    const uow = new UnitOfWork(
      makePrisma(() => Promise.reject(new Error('constraint violation'))),
    );
    uow.enqueue(vi.fn());

    const result = await uow.saveAsync();

    expect(result.isSuccess).toBe(false);
    if (!result.isSuccess) expect(result.error.code).toBe('TRANSACTION_FAILED');
  });

  it('saveAsync_clearsQueueAfterSave', async () => {
    const op = vi.fn().mockResolvedValue(undefined);
    const uow = new UnitOfWork(makePrisma());
    uow.enqueue(op);
    await uow.saveAsync();

    await uow.saveAsync();

    expect(op).toHaveBeenCalledOnce(); // not twice
  });
});
