# Testing

Vitest standards cho VegaBase Node.

## Setup

Mỗi package có `vitest.config.ts` riêng + script `pnpm test`. Test file đặt trong `src/__tests__/<source>.test.ts`.

```bash
pnpm --filter @vegabase/service test                # run all
pnpm --filter @vegabase/service test -- --watch     # watch mode
pnpm --filter @vegabase/service test base-service   # filter theo tên file
```

---

## TS-01 — Unit test cho mọi business logic hook

Mỗi hook custom (`checkAddCondition`, `applyUpdate` custom, `refineListData`) phải có test riêng. Test với mock của `executor` và `permissions` — không cần real DB cho hook logic.

```ts
// ✅ Đúng — test isolation từng hook
import { describe, it, expect, vi } from 'vitest';
import { Errors } from '@vegabase/core';

describe('UserService.checkAddCondition', () => {
  it('reports VALIDATION when email already exists', async () => {
    const executor = { queryAsync: vi.fn().mockResolvedValue({ isSuccess: true, data: [{ id: 'x' }] }) };
    const service = new UserService(prismaStub, executor as any, permissionsStub);
    const errors = new Errors();
    await (service as any).checkAddCondition({ email: 'a@b.com', callerUsername: 'u', callerRoles: [] }, errors);
    expect(errors.hasErrors()).toBe(true);
    expect(errors.all[0]).toEqual({ code: 'VALIDATION', message: expect.stringContaining('Email'), field: 'email' });
  });
});

// ❌ Sai — chỉ test public method, không cover hook
it('add returns fail for duplicate email', async () => { /* black-box test */ });
// → khi refactor hook, không biết hook bị break
```

---

## TS-02 — Integration test cho `BaseService` hành vi end-to-end DÙNG REAL DB

`BaseService` orchestration (permission check → validation → executor → onChanged) chỉ test ý nghĩa khi đi qua DB thực:

```ts
// ✅ Đúng — vitest + Prisma + Postgres test container
describe('UserService.add (integration)', () => {
  let prisma: PrismaClient;
  beforeAll(async () => { prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } }); });
  beforeEach(async () => { await prisma.user.deleteMany(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('persists user with audit fields populated', async () => {
    const service = new UserService(prisma, executor, permissions);
    const result = await service.add({
      callerUsername: 'admin', callerRoles: ['SUPER_ADMIN'],
      name: 'Test', email: 't@x.com',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.logCreatedBy).toBe('admin');
    expect(result.data.id).toMatch(/^[0-9a-f-]{36}$/);   // UUIDv7
  });
});

// ❌ Sai — mock Prisma → không catch lỗi schema mismatch / migration
const prismaMock = { user: { create: vi.fn().mockResolvedValue({ id: 'fake' }) } };
```

Integration test chậm hơn — group vào `*.integration.test.ts` và chạy CI riêng nếu cần.

---

## TS-03 — Test naming: `<unit>_<scenario>_<expected>`

```ts
// ✅ Đúng
it('hasField_returnsTrue_whenUpdatedFieldsEmpty', () => { ... });
it('add_returnsFailValidation_whenEmailMissing', () => { ... });
it('softDeleteAsync_setsIsDeletedTrue_keepsRowInDb', () => { ... });

// ❌ Sai — test name không kể chuyện
it('works', () => { ... });
it('test 1', () => { ... });
it('email validation', () => { ... });
```

Khi test fail, name là dòng đầu tiên ai đó đọc — phải đủ thông tin để biết "cái gì bị break".

---

## TS-04 — AAA pattern, một assertion chính

```ts
// ✅ Đúng — Arrange / Act / Assert tách bạch
it('updateField_returnsNotFound_whenIdMissing', async () => {
  // Arrange
  const service = makeService();
  const param = { id: 'non-existent', callerUsername: 'u', callerRoles: ['admin'] };

  // Act
  const result = await service.updateField(param);

  // Assert
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors[0].code).toBe('NOT_FOUND');   // assertion chính
  }
});

// ❌ Sai — multiple assertion độc lập trong 1 test
it('add does many things', async () => {
  expect(await s1()).toBe(true);
  expect(await s2()).toBe(false);     // nếu fail, ai biết "many things" cụ thể là gì?
  expect(await s3()).toEqual({ ... });
});
```

Tách thành nhiều `it(...)`. Một test = một fact.

---

## TS-05 — Test file đặt trong `__tests__/` cùng package

```
packages/service/src/
├── base-service.ts
├── __tests__/
│   ├── base-service.test.ts
│   ├── base-param-model.test.ts
│   └── ...
└── infrastructure/
    ├── cache/
    │   ├── cache-store.ts
    │   └── ...
    └── ...
```

Lý do giữ test cùng package thay vì root `tests/`:
1. Vitest pick up tự động theo `**/*.test.ts`
2. Khi xoá module, test cùng folder dễ thấy → xoá luôn
3. CI per-package có thể chạy độc lập

KHÔNG đặt test trong `dist/` (build output) hay ở ngoài `src/`.
