# Database

Quy tắc soft delete, audit, primary key, transaction.

---

## DB-01 — Chỉ dùng `executor.softDeleteAsync`, không bao giờ Prisma `delete`

```ts
// ✅ Đúng — BaseService.delete đã làm sẵn
async delete(param: TParam): Promise<Result<boolean>> {
  // ...
  const result = await this.executor.softDeleteAsync(this.delegate, param.id, param.callerUsername);
  // ...
}

// ❌ Sai — physical delete
await prisma.user.delete({ where: { id } });
await this.delegate.delete({ where: { id } });
```

`softDeleteAsync` set `isDeleted = true` + cập nhật audit `logUpdatedDate / logUpdatedBy`. Record vẫn còn trong DB cho audit trail và possible recovery.

> Hard delete vẫn cần cho data retention compliance — implement riêng ở admin tool, KHÔNG qua `BaseService`.

---

## DB-02 — KHÔNG set audit field thủ công

```ts
// ❌ Sai
return await this.delegate.create({
  data: {
    ...payload,
    logCreatedDate: new Date(),       // sai — executor set
    logCreatedBy: user,                // sai — executor set
  },
});

// ✅ Đúng — gọi executor, audit field tự động
return await this.executor.addAsync(this.delegate, payload, user);
```

`DbActionExecutor.addAsync` set: `id` (UUIDv7), `isDeleted: false`, `logCreatedDate`, `logCreatedBy`, `logUpdatedDate: null`, `logUpdatedBy: null`. `updateAsync` set `logUpdatedDate / logUpdatedBy`.

Set thủ công → bypass audit, lệch giữa các record, khó debug.

---

## DB-03 — Multi-entity write phải qua `UnitOfWork`

```ts
import { UnitOfWork } from '@vegabase/service';

// ✅ Đúng — atomic
async createOrderWithItems(p: OrderParam): Promise<Result<Order>> {
  const uow = new UnitOfWork(this.prisma);
  let createdOrder: Order;
  uow.enqueue(async tx => { createdOrder = await tx.order.create({ data: ... }); });
  for (const item of p.items) {
    uow.enqueue(async tx => { await tx.orderItem.create({ data: { ...item, orderId: createdOrder.id } }); });
  }
  const result = await uow.saveAsync();
  if (!result.isSuccess) return fail([{ code: 'TRANSACTION_FAILED', message: result.error.message }]);
  return ok(createdOrder!);
}

// ❌ Sai — multiple addAsync không atomic
await this.executor.addAsync(this.orderDelegate, ...);     // ✓
await this.executor.addAsync(this.itemDelegate, ...);      // ✗ thất bại → order mồ côi
```

---

## DB-04 — Single-entity write dùng `DbActionExecutor`

```ts
// ✅ Đúng — retry + timeout có sẵn
const result = await this.executor.addAsync(this.delegate, data, callerUsername);

// ❌ Sai — gọi delegate trực tiếp, mất retry/timeout/audit
const data = await this.delegate.create({ data: payload });
```

`DbActionExecutor` cấu hình retry default: 2 lần, backoff 200ms × attempt, timeout 30s. Bỏ qua = mất resilience.

Lỗi không retry: `P2002` (unique violation), `P2025` (record not found), `P2003` (FK constraint) — vì chúng chắc chắn fail lại.

---

## DB-05 — Raw SQL phải có comment giải thích lý do

Prisma `$queryRaw` / `$executeRaw` là last resort. Chỉ dùng khi:

- Query phức tạp Prisma client không express được
- Performance critical (bulk insert, full-text search)
- Migration script

```ts
// ✅ Đúng
// Lý do dùng raw: Prisma chưa support PostgreSQL full-text search ts_rank — perf critical cho /search
const results = await prisma.$queryRaw<Product[]>`
  SELECT * FROM "Product"
  WHERE to_tsvector('english', name) @@ plainto_tsquery(${term})
  AND "isDeleted" = false
`;

// ❌ Sai — không comment, có thể viết bằng Prisma client
const u = await prisma.$queryRaw`SELECT * FROM "User" WHERE id = ${id}`;
```

PHẢI dùng tagged template (`` $queryRaw`...` ``), không string concat — tránh SQL injection.

---

## DB-06 — Filter `isDeleted` trong `applyFilter` (qua super)

```ts
// ✅ Đúng
protected applyFilter(where: Record<string, unknown>, p: UserParam) {
  const base = super.applyFilter(where, p);   // { isDeleted: false }
  return { ...base, ...customFilter };
}

// ❌ Sai — bỏ qua super
protected applyFilter(where: Record<string, unknown>, p: UserParam) {
  return { name: { contains: p.keyword } };   // soft-deleted records lộ ra
}
```

Cũng áp dụng khi query trong `checkAddCondition` (check duplicate):

```ts
// ✅ Đúng
const existing = await this.executor.queryAsync(this.delegate, { email: p.email, isDeleted: false });

// ❌ Sai — check trùng cả với record đã xóa → cho phép tạo email đã từng tồn tại
const existing = await this.executor.queryAsync(this.delegate, { email: p.email });
```

---

## DB-07 — Primary key là UUIDv7 do `DbActionExecutor` sinh

```ts
// ✅ Đúng — Prisma schema KHÔNG có @default
model User {
  id String @id      // executor sẽ set UUIDv7 khi addAsync
  // ...
}

// ❌ Sai
model User {
  id String @id @default(uuid())   // Prisma sinh UUIDv4, không có time-ordered → index kém
}
model User {
  id Int @id @default(autoincrement())   // không phù hợp pattern
}
```

UUIDv7 (timestamp prefix) cho index B-tree friendly hơn v4 (ngẫu nhiên). Hữu ích khi table lớn.

> Khi import data từ hệ thống cũ với ID có sẵn, viết script migration set ID trực tiếp — KHÔNG dùng `addAsync` (sẽ bị overwrite). Sau migration, mọi insert qua `addAsync` để giữ nhất quán.
