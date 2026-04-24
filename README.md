# VegaBase Node

Thư viện Node.js / TypeScript nội bộ cung cấp nền tảng chuẩn cho các dự án CRUD có phân quyền: entities, services, controllers, authentication, và caching. Port của [VegaBase (.NET)](https://github.com/hungngominh/vegabase) sang stack Fastify + Prisma.

## Tính năng chính

- **Base classes** cho CRUD (`BaseService`, `createBaseController`, `BaseParamModel`) với các hook mở rộng — validate, filter, update, cache invalidation.
- **Phân quyền theo role + screen code** qua `PermissionCache` (TTL 5 phút mặc định).
- **Audit fields tự động** (`logCreatedDate`, `logCreatedBy`, …) và **soft delete** chuẩn hoá.
- **Authentication** JWT (`@fastify/jwt`) + password hashing Argon2id (OWASP defaults).
- **DB executor** với retry / timeout, không lộ Prisma vào Service.
- **Read-through cache** cho master data (`CacheStore<TKey, TModel>`).
- **Result\<T\>** pattern — Service không throw, lỗi business trả về `{ ok: false, errors }`.

## Tech Stack

| Thành phần | Phiên bản | Mục đích |
|---|---|---|
| Node.js | ≥ 20 | Runtime |
| TypeScript | ^5.4 | Strict mode, ES2022 target, CommonJS modules |
| Fastify | ^5.0 | HTTP framework |
| @fastify/jwt | ^9.0 | JWT verify plugin |
| fastify-plugin | ^5.0 | Plugin encapsulation |
| Prisma Client | ^5.0 | ORM (consumer cung cấp schema) |
| argon2 | ^0.31 | Password hashing (Argon2id) |
| zod | ^3.22 | Schema validation cho request body / query |
| uuid | ^10 | UUIDv7 cho primary key |
| Vitest | ^2.0 | Test runner |
| pnpm | — | Workspace manager |

## Cấu trúc

```
vegabase-node/
├── packages/
│   ├── core/      ← Entities, types, contracts (@vegabase/core)
│   ├── service/   ← Business logic, infrastructure (@vegabase/service)
│   └── api/       ← Fastify plugins, controllers (@vegabase/api)
└── docs/coding-standards/  ← Bộ quy tắc lập trình (internal + consumer)
```

Dependency flow: `core ← service ← api` (một chiều). Mỗi package publish npm độc lập với version riêng.

## Bắt đầu

### Yêu cầu

- Node.js ≥ 20
- pnpm
- PostgreSQL hoặc bất kỳ DB nào Prisma hỗ trợ (consumer tự cấu hình)

### Cài đặt (consumer)

```bash
pnpm add @vegabase/core @vegabase/service @vegabase/api
pnpm add @prisma/client fastify zod
pnpm add -D prisma
```

### Chạy workspace (contributor)

```bash
pnpm install
pnpm build      # build tất cả packages
pnpm test       # chạy vitest cho tất cả packages
```

Build / test riêng từng package:

```bash
pnpm --filter @vegabase/core build
pnpm --filter @vegabase/service test
```

## Ví dụ sử dụng

Định nghĩa một entity + service + controller cho domain mới:

```ts
// 1. Prisma schema (consumer định nghĩa) — schema.prisma
// model Product {
//   id              String    @id
//   name            String
//   price           Decimal   @db.Decimal(18, 2)
//   isDeleted       Boolean   @default(false)
//   logCreatedDate  DateTime
//   logCreatedBy    String
//   logUpdatedDate  DateTime?
//   logUpdatedBy    String?
// }

// 2. Param + schema validation (Service layer)
import { z } from 'zod';
import type { BaseParamModel } from '@vegabase/service';

interface ProductParam extends BaseParamModel {
  name?: string;
  price?: number;
  searchTerm?: string;
}

const productAddSchema = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
}) as unknown as z.ZodType<ProductParam>;

// 3. Service — extend BaseService<TModel, TParam>, override abstract members
import { BaseService, type Logger } from '@vegabase/service';
import type { Product, PrismaClient } from '@prisma/client';

export class ProductService extends BaseService<Product, ProductParam> {
  protected readonly screenCode = 'PRD_PRODUCT';
  protected readonly delegate;
  protected readonly allowedUpdateFields = ['name', 'price'] as const;

  constructor(prisma: PrismaClient, executor, permissions, logger?: Logger) {
    super(executor, permissions, logger);
    this.delegate = prisma.product;
  }

  protected applyFilter(where: Record<string, unknown>, p: ProductParam) {
    const base = super.applyFilter(where, p); // luôn gọi super để giữ isDeleted: false
    if (p.searchTerm) return { ...base, name: { contains: p.searchTerm } };
    return base;
  }

  protected async checkAddCondition(p: ProductParam, errors) {
    if ((p.price ?? 0) < 0) errors.add('VALIDATION', 'Giá phải >= 0', 'price');
  }

  protected buildNewEntity(p: ProductParam) {
    return { name: p.name, price: p.price };
  }
}

// 4. Controller — register plugin vào Fastify app
import Fastify from 'fastify';
import {
  createBaseController,
  vegabaseJwtPlugin,
  callerInfoPlugin,
  errorHandlerPlugin,
} from '@vegabase/api';

const app = Fastify({ logger: true });
await app.register(errorHandlerPlugin);
await app.register(vegabaseJwtPlugin, { secret: process.env.JWT_SECRET! });
await app.register(callerInfoPlugin);
await app.register(
  createBaseController({
    service: productService,
    prefix: '/api/v1/products',
    schemas: { add: productAddSchema, update: productAddSchema },
  }),
);
```

Chi tiết các hook và pattern:
- [docs/coding-standards/03-base-classes.md](docs/coding-standards/03-base-classes.md) — internal rules (BC-01 → BC-10)
- [docs/coding-standards/consumer/03-service-controller.md](docs/coding-standards/consumer/03-service-controller.md) — consumer rules (NS-10, BC-11 → BC-17)

## Environment Variables

| Biến | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|
| `JWT_SECRET` | Có | — | Khóa ký JWT — **không commit vào git** |
| `JWT_ISSUER` | Không | — | JWT issuer claim (verify) |
| `JWT_AUDIENCE` | Không | — | JWT audience claim (verify) |
| `DATABASE_URL` | Có | — | Prisma datasource URL |

> JWT expiry và token issuance là trách nhiệm của consumer app — `@vegabase/api` chỉ verify token tại middleware. Xem [05-security.md](docs/coding-standards/05-security.md).

## Tài liệu

- [Coding standards (internal)](docs/coding-standards/README.md) — quy tắc cho developer contribute vào VegaBase Node
- [Consumer coding standards](docs/coding-standards/consumer/README.md) — quy tắc cho developer dùng `@vegabase/*` npm packages
- [CLAUDE.md](CLAUDE.md) — hướng dẫn cho Claude Code khi làm việc trên repo

## Publishing npm (maintainer)

Mỗi package version độc lập. Khi sửa package nào, bump `version` trong `packages/<layer>/package.json`:

```jsonc
// packages/service/package.json
{
  "name": "@vegabase/service",
  "version": "0.1.1"
}
```

**Quy tắc semver nội bộ:** `1.0.0` breaking · `0.x.0` feature · `0.0.x` fix/bump (đang ở giai đoạn 0.x).

```bash
# Build trước khi publish
pnpm --filter @vegabase/service build

# Publish (cần npm login)
pnpm --filter @vegabase/service publish --access public

# Commit kèm version trong message
git commit -m "feat(service): <mô tả> (v0.1.1)"
```

Workspace dependency dùng `workspace:*` — pnpm tự rewrite thành version cụ thể khi publish.
