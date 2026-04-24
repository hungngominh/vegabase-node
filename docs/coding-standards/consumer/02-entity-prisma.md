# Entity & Prisma Schema

Quy tắc khai báo Prisma model trong consumer app để tương thích với `BaseService`.

> **Prerequisite:** Đọc [06-database.md](../06-database.md) trước.

---

## NS-09 — Module path theo domain

Service / Param / ScreenCode cùng domain đặt cùng folder:

```
src/
├── core/screen-codes.ts                ← const PRD_PRODUCT, USR_USER, …
└── service/
    ├── products/
    │   ├── product-service.ts
    │   ├── product-param.ts
    │   └── product-schemas.ts          ← Zod schemas (BC-14)
    └── users/
        ├── user-service.ts
        ├── user-param.ts
        └── user-schemas.ts
```

KHÔNG đặt theo type (`services/`, `params/`, `schemas/`) — đổi 1 domain phải nhảy 3 folder.

---

## DB-08 — Prisma model PHẢI có đủ field của `BaseEntity`

```prisma
// ✅ Đúng — match interface BaseEntity
model Product {
  id              String    @id              // DB-11: KHÔNG @default
  name            String
  price           Decimal   @db.Decimal(18, 2)   // DB-13
  isDeleted       Boolean   @default(false)
  logCreatedDate  DateTime
  logCreatedBy    String
  logUpdatedDate  DateTime?
  logUpdatedBy    String?

  @@index([isDeleted])                       // DB-09
}

// ❌ Sai — thiếu logUpdated*, type sai
model Product {
  id        String   @id @default(uuid())    // vi phạm DB-11
  name      String
  isDeleted Boolean  @default(false)
  createdAt DateTime @default(now())         // tên sai → BaseService không set được
}
```

Việc field hiện diện đủ là tiền đề để `Product` thoả `extends BaseEntity` ở generic constraint của `BaseService<Product, ProductParam>`.

> Cân nhắc tạo Prisma `mixin` hoặc generator để tự động thêm các field này — hiện chưa có công cụ chính thức, viết tay là cách an toàn nhất.

---

## DB-09 — Index trên `isDeleted` cho mọi entity

```prisma
model Product {
  // ...
  @@index([isDeleted])                            // single column
  @@index([categoryId, isDeleted])                // composite cho query thường gặp
}
```

Mọi `applyFilter` đều có `isDeleted: false` (xem DB-06) — index này avoid full table scan khi table lớn.

---

## DB-10 — Unique constraint phải kèm filter `isDeleted` (partial index)

Prisma chưa support partial unique index trực tiếp. Cách work-around:

```prisma
// ❌ Vấn đề — unique cứng → không thể recreate user với cùng email sau khi soft-delete
model User {
  id    String @id
  email String @unique
}

// ✅ Đúng — composite unique với isDeleted
model User {
  id        String  @id
  email     String
  isDeleted Boolean @default(false)

  @@unique([email, isDeleted])
}
```

Trade-off: vẫn không cho phép 2 record cùng email sau khi 1 cái đã bị soft-delete (vì cả 2 record đều có `isDeleted=false`). Nếu muốn cho phép re-create, viết check trong `checkAddCondition`:

```ts
protected async checkAddCondition(p: UserParam, errors: Errors) {
  const r = await this.executor.queryAsync(this.delegate, { email: p.email, isDeleted: false });
  if (r.isSuccess && r.data.length > 0) errors.add('VALIDATION', 'Email đã tồn tại', 'email');
}
```

Khi unique constraint bị Prisma từ chối (`P2002`), `BaseService.add` map thành `DUPLICATE_KEY` → HTTP 409.

---

## DB-11 — `id String @id` KHÔNG có `@default(uuid())`

```prisma
// ✅ Đúng
model Product {
  id String @id        // executor.addAsync sinh UUIDv7
}

// ❌ Sai — Prisma sinh UUIDv4 ngẫu nhiên, kém index B-tree
model Product {
  id String @id @default(uuid())
}

// ❌ Sai — autoincrement int không match BaseEntity (id phải string)
model Product {
  id Int @id @default(autoincrement())
}
```

Migration import data với ID có sẵn: insert raw qua Prisma `createMany` với `id` thẳng tay — KHÔNG gọi `executor.addAsync` (sẽ overwrite).

---

## DB-12 — KHÔNG dùng `prisma.<model>.delete()` — chỉ soft delete

```ts
// ❌ Sai
await prisma.user.delete({ where: { id } });
await prisma.user.deleteMany({ where: { ... } });

// ✅ Đúng — qua BaseService.delete (đã wrap)
await userService.delete({ id, callerUsername: ..., callerRoles: [...] });

// ✅ Đúng — qua executor trong custom Service method
await this.executor.softDeleteAsync(this.delegate, id, callerUsername);
```

Hard delete chỉ chấp nhận trong:
- Migration script (rõ ràng, có review)
- Job dọn dữ liệu sau retention period (vd xóa record `isDeleted=true` quá 90 ngày)

Mọi hard delete phải có comment lý do + tên job/migration.

---

## DB-13 — `Decimal` PHẢI khai báo precision

```prisma
// ✅ Đúng
model Product {
  price       Decimal @db.Decimal(18, 2)        // tiền — 2 chữ số sau dấu thập phân
  quantity    Decimal @db.Decimal(10, 0)        // số lượng nguyên
  exchangeRate Decimal @db.Decimal(18, 6)       // tỷ giá — 6 chữ số
}

// ❌ Sai — không precision → Postgres dùng default (variable), SQL Server dùng (18,0) → mất phần thập phân
model Product {
  price Decimal
}
```

JS không có Decimal native — Prisma trả về `Decimal` từ `decimal.js`. KHÔNG dùng `Number(price)` cho phép tính tiền (mất precision). Dùng `price.add(other)`, `price.mul(qty)`, etc.

```ts
import { Decimal } from '@prisma/client/runtime/library';

const total = items.reduce(
  (sum, it) => sum.add(it.price.mul(it.quantity)),
  new Decimal(0),
);
```
