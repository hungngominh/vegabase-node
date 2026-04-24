# Layer Architecture

Quy tắc phụ thuộc giữa các package và trách nhiệm từng layer.

## Sơ đồ

```
@vegabase/core    ←  @vegabase/service  ←  @vegabase/api
(types only)        (business logic)        (HTTP wiring)
```

Mũi tên = "depends on". Một chiều, không cycle.

---

## LA-01 — Dependency flow một chiều

`package.json` của mỗi layer phải tuân thủ:

| Package | Được phép import từ |
|---|---|
| `@vegabase/core` | (chỉ stdlib) |
| `@vegabase/service` | `@vegabase/core` |
| `@vegabase/api` | `@vegabase/core`, `@vegabase/service` |

```jsonc
// ✅ Đúng — packages/service/package.json
{
  "dependencies": {
    "@vegabase/core": "workspace:*",
    "@prisma/client": "^5.0.0"
  }
}

// ❌ Sai — Service không được phụ thuộc API
{
  "dependencies": {
    "@vegabase/api": "workspace:*"
  }
}
```

---

## LA-02 — `@vegabase/core` không được import Prisma / Fastify / argon2

Core chỉ chứa types và utility thuần — không runtime dependency nào ngoài stdlib:

```ts
// ✅ Đúng — packages/core/src/entities/base-entity.ts
export interface BaseEntity {
  id: string;
  isDeleted: boolean;
  logCreatedDate: Date;
  // ...
}

// ❌ Sai — kéo Prisma vào Core
import type { Prisma } from '@prisma/client';
export interface BaseEntity extends Prisma.UserCreateInput { ... }
```

`packages/core/package.json` phải KHÔNG có runtime `dependencies` (chỉ devDependencies).

---

## LA-03 — `@vegabase/service` không được import Fastify / HTTP types

Service không biết HTTP tồn tại:

```ts
// ✅ Đúng — Service nhận identity qua param.callerUsername
async add(param: TParam): Promise<Result<TModel>> { ... }

// ❌ Sai — Service biết Fastify request
import type { FastifyRequest } from 'fastify';
async add(req: FastifyRequest, param: TParam) { ... }
```

`packages/service/package.json` không được có `fastify` / `@fastify/*`.

---

## LA-04 — Business logic chỉ ở Service layer

API layer (`@vegabase/api`) **chỉ** làm: validate input bằng Zod → gọi Service → map Result thành HTTP response. Không validate business rule, không tính toán.

```ts
// ✅ Đúng — controller mỏng
app.post(`${prefix}/add`, async (r, reply) => {
  const param = buildParam(req(r), r.body, schemas.add);
  const result = await service.add(param);
  if (!result.ok) return reply.status(...).send(failResponse(result.errors, traceId));
  return reply.status(201).send(successResponse(result.data, traceId));
});

// ❌ Sai — business rule ở controller
app.post(`${prefix}/add`, async (r, reply) => {
  if (r.body.price < 0) return reply.status(400).send(...);   // → đẩy vào checkAddCondition
  const exists = await prisma.product.findFirst(...);          // → đẩy vào checkAddCondition
  // ...
});
```

---

## LA-05 — `@vegabase/api` chỉ làm HTTP wiring

Trách nhiệm của API layer:

| Module | Trách nhiệm |
|---|---|
| `plugins/jwt.ts` | Verify JWT, gắn `req.user` |
| `plugins/caller-info.ts` | Extract `caller` từ `req.user`, expose `req.caller` |
| `plugins/error-handler.ts` | Catch unhandled exception → 500 với traceId |
| `password/argon2id-hasher.ts` | Implementation của `PasswordHasher` |
| `controllers/create-base-controller.ts` | Factory mapping CRUD → Fastify routes |

Không có module nào trong `api/` được implement business logic.

---

## LA-06 — Type chung phải định nghĩa trong Core

Type được dùng **bởi từ 2 layer trở lên** phải đặt trong `@vegabase/core`. Type chỉ dùng nội bộ một layer thì giữ trong layer đó (không export ra index).

| Type | Đặt ở | Lý do |
|---|---|---|
| `BaseEntity` | core | Service + API đều cần |
| `Result<T>` | core | Service trả, API map |
| `ApiResponse<T>` | core | Shape envelope của response |
| `ServiceError` | core | Trao đổi giữa Service và API |
| `BaseParamModel` | service | API biết qua re-export, nhưng định nghĩa thuộc về Service |
| `DbResult<T>` | service | Internal Service infrastructure — API không cần |
| `PrismaDelegate<T>` | service | Service-only contract |
| `CallerInfo` | api | Chỉ HTTP layer cần |

Khi tạo type mới, hỏi: "Layer nào CẦN đọc/ghi nó?" — trả lời quyết định nơi đặt.
