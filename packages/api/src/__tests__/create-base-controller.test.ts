import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createBaseController } from '../controllers/create-base-controller';
import type { BaseService, BaseParamModel } from '@vegabase/service';
import type { BaseEntity } from '@vegabase/core';
import { ok, fail } from '@vegabase/core';

interface UserEntity extends BaseEntity {
  name: string;
}

interface UserParam extends BaseParamModel {
  name?: string;
}

const userSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  updatedFields: z.array(z.string()).optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  callerUsername: z.string().optional(),
  callerRoles: z.array(z.string()).optional(),
}) as unknown as z.ZodSchema<UserParam>;

function makeService(): BaseService<UserEntity, UserParam> {
  return {
    getList: vi.fn(),
    add: vi.fn(),
    updateField: vi.fn(),
    delete: vi.fn(),
  } as unknown as BaseService<UserEntity, UserParam>;
}

function makeEntity(overrides: Partial<UserEntity> = {}): UserEntity {
  return { id: 'eid', name: 'Alice', isDeleted: false, logCreatedDate: new Date(), logCreatedBy: 'u', logUpdatedDate: null, logUpdatedBy: null, ...overrides };
}

async function buildApp(service: BaseService<UserEntity, UserParam>): Promise<FastifyInstance> {
  const app = Fastify();
  // Simulate caller middleware without JWT
  app.decorateRequest('caller', {
    getter(this: object) {
      return (this as { __caller?: { username: string; roles: string[] } }).__caller ?? { username: 'unknown', roles: [] };
    },
    setter(this: object, value: { username: string; roles: string[] }) {
      (this as { __caller?: { username: string; roles: string[] } }).__caller = value;
    },
  });
  app.addHook('preHandler', async req => {
    (req as typeof req & { caller: { username: string; roles: string[] } }).caller = Object.freeze({
      username: 'testuser',
      roles: ['ADMIN'],
    });
  });
  await app.register(
    createBaseController({ service, prefix: '/users', schemas: { add: userSchema, update: userSchema } }),
  );
  await app.ready();
  return app;
}

describe('createBaseController', () => {
  let service: BaseService<UserEntity, UserParam>;
  let app: FastifyInstance;

  beforeEach(async () => {
    service = makeService();
    app = await buildApp(service);
  });

  it('POST /add — success returns 201 with data', async () => {
    vi.mocked(service.add).mockResolvedValue(ok(makeEntity()));

    const res = await app.inject({ method: 'POST', url: '/users/add', payload: { name: 'Alice' } });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ success: boolean; data: UserEntity }>();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Alice');
  });

  it('POST /add — callerUsername comes from middleware not body', async () => {
    let capturedParam: UserParam | null = null;
    vi.mocked(service.add).mockImplementation(async p => { capturedParam = p; return ok(makeEntity()); });

    await app.inject({ method: 'POST', url: '/users/add', payload: { name: 'Alice', callerUsername: 'HACKED' } });

    expect(capturedParam!.callerUsername).toBe('testuser'); // from middleware, not body
  });

  it('POST /add — service error maps to correct HTTP status', async () => {
    vi.mocked(service.add).mockResolvedValue(fail([{ code: 'PERMISSION_DENIED', message: 'Access denied.' }]));

    const res = await app.inject({ method: 'POST', url: '/users/add', payload: {} });

    expect(res.statusCode).toBe(403);
    const body = res.json<{ success: boolean }>();
    expect(body.success).toBe(false);
  });

  it('GET /list — success returns items and total', async () => {
    vi.mocked(service.getList).mockResolvedValue(ok({ items: [makeEntity()], total: 1 }));

    const res = await app.inject({ method: 'GET', url: '/users/list' });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { items: UserEntity[]; total: number } }>();
    expect(body.data.total).toBe(1);
  });

  it('DELETE /delete — NOT_FOUND returns 404', async () => {
    vi.mocked(service.delete).mockResolvedValue(fail([{ code: 'NOT_FOUND', message: 'Not found.' }]));

    const res = await app.inject({ method: 'DELETE', url: '/users/delete?id=missing' });

    expect(res.statusCode).toBe(404);
  });
});
