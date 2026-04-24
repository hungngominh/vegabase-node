# Naming Conventions

Quy tắc đặt tên cho package, file, type, và field trong VegaBase Node.

---

## NS-01 — Package name dạng `@vegabase/<layer>`

3 package chính của repo dùng scope `@vegabase`:

```jsonc
// ✅ Đúng — packages/core/package.json
{ "name": "@vegabase/core" }
{ "name": "@vegabase/service" }
{ "name": "@vegabase/api" }

// ❌ Sai
{ "name": "vegabase-core" }    // không có scope
{ "name": "@vegabase/Core" }   // không lowercase
```

---

## NS-02 — Entity / model interface không có suffix

Type mô tả "row trong DB" không thêm `Model` / `Entity`:

```ts
// ✅ Đúng — Prisma generate ra type tên trùng model
import type { User } from '@prisma/client';

// ❌ Sai
type UserModel = { ... };
interface UserEntity { ... };
```

`BaseEntity` interface trong `@vegabase/core` là ngoại lệ duy nhất — nó là "shape contract" mà mọi entity phải có.

---

## NS-03 — Param interface phải suffix `Param`

Mọi type dùng làm input cho Service method dùng suffix `Param` và extend `BaseParamModel`:

```ts
// ✅ Đúng
interface ProductParam extends BaseParamModel {
  name?: string;
  price?: number;
}

// ❌ Sai
interface ProductInput extends BaseParamModel { ... }     // sai suffix
interface ProductParam { name?: string; }                 // không extend BaseParamModel
```

---

## NS-04 — File name kebab-case

Tất cả file `.ts` dùng kebab-case, không PascalCase / camelCase:

```
✅  base-service.ts          db-action-executor.ts        argon2id-hasher.ts
❌  BaseService.ts           dbActionExecutor.ts          Argon2idHasher.ts
```

Test file: `<source>.test.ts` đặt trong thư mục `__tests__/` cùng cấp với module được test.

---

## NS-05 — Interface không dùng prefix `I`

TypeScript convention — không Hungarian prefix:

```ts
// ✅ Đúng
export interface Logger { info(...): void; }
export interface PasswordHasher { hash(p: string): Promise<string>; }

// ❌ Sai
export interface ILogger { ... }
export interface IPasswordHasher { ... }
```

---

## NS-06 — Audit fields prefix `log` camelCase

Khác với .NET (dùng `Log_CreatedDate` PascalCase + underscore), TypeScript / Prisma convention:

```ts
// ✅ Đúng — match BaseEntity interface
interface BaseEntity {
  id: string;
  isDeleted: boolean;
  logCreatedDate: Date;
  logCreatedBy: string;
  logUpdatedDate: Date | null;
  logUpdatedBy: string | null;
}

// ❌ Sai — PascalCase với underscore (kiểu .NET)
interface BaseEntity {
  Log_CreatedDate: Date;
  Log_CreatedBy: string;
}
```

Prisma model phải khai báo đúng tên field này — xem [DB-08](consumer/02-entity-prisma.md).

---

## NS-07 — Method async phải suffix `Async`

Method trong infrastructure layer (`DbActionExecutor`, `UnitOfWork`) suffix `Async`:

```ts
// ✅ Đúng
class DbActionExecutor {
  async addAsync<T>(...) { ... }
  async updateAsync<T>(...) { ... }
  async queryAsync<T>(...) { ... }
}

// ❌ Sai
class DbActionExecutor {
  async add<T>(...) { ... }      // thiếu suffix
  async query<T>(...) { ... }
}
```

**Ngoại lệ:** method public của `BaseService` (`getList`, `add`, `updateField`, `delete`) KHÔNG suffix `Async` — chúng map 1-1 với HTTP route nên dùng tên ngắn theo HTTP semantics. Đây là quyết định có chủ ý, không phải vi phạm.

---

## NS-08 — Screen codes UPPER_SNAKE

Screen code dùng làm key cho `permissions.hasPermission` đặt theo dạng `MODULE_ENTITY`:

```ts
// ✅ Đúng
const screenCode = 'PRD_PRODUCT';
const screenCode = 'USR_USER';
const screenCode = 'VHC_VEHICLE';

// ❌ Sai
const screenCode = 'PrdProduct';     // PascalCase
const screenCode = 'prd-product';    // kebab-case
const screenCode = 'product';        // không có module prefix
```

Format này nhất quán giữa internal lib và consumer app. Xem chi tiết tổ chức `ScreenCodes` constants tại [consumer/03-service-controller.md NS-10](consumer/03-service-controller.md).
