import type { PrismaClient } from '@prisma/client';
import { dbSuccess, dbFailure, type DbResult } from './db-result';

export class UnitOfWork {
  private readonly ops: Array<(tx: PrismaClient) => Promise<unknown>> = [];

  constructor(private readonly prisma: PrismaClient) {}

  enqueue(op: (tx: PrismaClient) => Promise<unknown>): void {
    this.ops.push(op);
  }

  async saveAsync(): Promise<DbResult<void>> {
    const start = Date.now();
    const ops = [...this.ops];
    this.ops.length = 0;
    try {
      await this.prisma.$transaction(async tx => {
        for (const op of ops) {
          await op(tx as unknown as PrismaClient);
        }
      });
      return dbSuccess(undefined, Date.now() - start);
    } catch (err) {
      return dbFailure(
        { code: 'TRANSACTION_FAILED', message: String(err), originalError: err },
        Date.now() - start,
      );
    }
  }
}
