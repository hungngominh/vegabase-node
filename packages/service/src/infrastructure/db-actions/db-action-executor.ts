import { v7 as uuidv7 } from 'uuid';
import { dbSuccess, dbFailure, type DbResult, type DbError } from './db-result';
import type { PrismaDelegate } from './prisma-delegate';

const NON_RETRYABLE_CODES = new Set(['P2002', 'P2025', 'P2003']);

export interface DbActionOptions {
  retries?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
}

export class DbActionExecutor {
  private readonly retries: number;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(options: DbActionOptions = {}) {
    this.retries = options.retries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retryDelayMs = options.retryDelayMs ?? 200;
  }

  async addAsync<T>(
    delegate: PrismaDelegate<T>,
    data: Record<string, unknown>,
    createdBy: string,
  ): Promise<DbResult<T>> {
    return this.withRetry(() =>
      delegate.create({
        data: {
          ...data,
          id: uuidv7(),
          isDeleted: false,
          logCreatedDate: new Date(),
          logCreatedBy: createdBy,
          logUpdatedDate: null,
          logUpdatedBy: null,
        },
      }),
    );
  }

  async updateAsync<T>(
    delegate: PrismaDelegate<T>,
    id: string,
    data: Record<string, unknown>,
    updatedBy: string,
  ): Promise<DbResult<T>> {
    return this.withRetry(() =>
      delegate.update({
        where: { id },
        data: { ...data, logUpdatedDate: new Date(), logUpdatedBy: updatedBy },
      }),
    );
  }

  async softDeleteAsync<T>(
    delegate: PrismaDelegate<T>,
    id: string,
    deletedBy: string,
  ): Promise<DbResult<boolean>> {
    const result = await this.withRetry<T>(() =>
      delegate.update({
        where: { id },
        data: { isDeleted: true, logUpdatedDate: new Date(), logUpdatedBy: deletedBy },
      }),
    );
    if (!result.isSuccess) return { isSuccess: false, error: result.error, durationMs: result.durationMs };
    return { isSuccess: true, data: true, durationMs: result.durationMs };
  }

  async queryAsync<T>(
    delegate: PrismaDelegate<T>,
    where: Record<string, unknown>,
    options?: { skip?: number; take?: number; orderBy?: Record<string, unknown> },
  ): Promise<DbResult<T[]>> {
    return this.withRetry(() => delegate.findMany({ where, ...options }));
  }

  async getByIdAsync<T>(delegate: PrismaDelegate<T>, id: string): Promise<DbResult<T | null>> {
    return this.withRetry(() => delegate.findUnique({ where: { id } }));
  }

  async countAsync<T>(delegate: PrismaDelegate<T>, where: Record<string, unknown>): Promise<DbResult<number>> {
    return this.withRetry(() => delegate.count({ where }));
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<DbResult<T>> {
    let attempt = 0;
    while (true) {
      const start = Date.now();
      try {
        const data = await Promise.race([
          operation(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('DB_TIMEOUT')), this.timeoutMs),
          ),
        ]);
        return dbSuccess(data, Date.now() - start);
      } catch (err) {
        const durationMs = Date.now() - start;
        if (this.isRetryable(err) && attempt < this.retries) {
          attempt++;
          await new Promise(resolve => setTimeout(resolve, this.retryDelayMs * attempt));
          continue;
        }
        return dbFailure(this.toDbError(err), durationMs);
      }
    }
  }

  private isRetryable(err: unknown): boolean {
    if (err instanceof Error && err.message === 'DB_TIMEOUT') return true;
    if (this.isPrismaError(err)) return !NON_RETRYABLE_CODES.has(err.code);
    return false;
  }

  private isPrismaError(err: unknown): err is { code: string; message: string } {
    return typeof err === 'object' && err !== null && 'code' in err && typeof (err as Record<string, unknown>).code === 'string';
  }

  private toDbError(err: unknown): DbError {
    if (err instanceof Error && err.message === 'DB_TIMEOUT') {
      return { code: 'DB_TIMEOUT', message: 'Database operation timed out.', originalError: err };
    }
    if (this.isPrismaError(err)) {
      return { code: err.code, message: err.message, originalError: err };
    }
    return { code: 'UNKNOWN', message: String(err), originalError: err };
  }
}
