# Project Setup

Quy tắc tổ chức project, đăng ký Fastify plugin, env vars cho consumer app dùng `@vegabase/*`.

> **Prerequisite:** Đọc [02-architecture.md](../02-architecture.md) trước — consumer rules này mở rộng, không lặp lại.

---

## LA-07 — Project layout mirror VegaBase Node

Consumer app dùng layout 3-tầng theo domain (không bắt buộc monorepo, nhưng phải tách rõ folder):

```
my-app/
├── prisma/
│   └── schema.prisma                    ← Prisma model (DB-08)
├── src/
│   ├── core/                            ← types, constants, ScreenCodes (NS-10)
│   │   ├── screen-codes.ts
│   │   └── types/...
│   ├── service/                         ← BaseService implementations
│   │   ├── products/
│   │   │   ├── product-service.ts
│   │   │   └── product-param.ts
│   │   └── users/...
│   ├── api/                             ← Fastify plugins, routes setup
│   │   ├── plugins/
│   │   ├── routes/
│   │   └── server.ts                    ← entry point (LA-12)
│   └── infrastructure/                  ← Prisma client + executor + permission cache singletons
│       ├── prisma.ts
│       ├── executor.ts
│       └── permission-cache.ts
└── package.json
```

Tránh đặt Service và route handler chung folder — khó enforce LA-04.

---

## LA-08 — Prisma schema bridge bắt buộc

`@vegabase/service` không cung cấp Prisma schema. Consumer phải:

1. Khai báo Prisma schema với đủ field theo `BaseEntity` (xem [DB-08](02-entity-prisma.md))
2. Tạo singleton `PrismaClient` ở `src/infrastructure/prisma.ts`
3. Service nhận `PrismaDelegate<T>` (vd `prisma.product`) qua constructor — KHÔNG nhận `PrismaClient` (xem [BC-17](03-service-controller.md))

```ts
// src/infrastructure/prisma.ts
import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

// src/infrastructure/executor.ts
import { DbActionExecutor, PermissionCache } from '@vegabase/service';
import { prisma } from './prisma';

export const executor = new DbActionExecutor({ retries: 2, timeoutMs: 30_000 });
export const permissionCache = new PermissionCache(async roleId => {
  const perms = await prisma.rolePermission.findMany({
    where: { roleId, isDeleted: false },
    select: { screenCode: true, action: true },
  });
  return perms.map(p => `${p.screenCode}:${p.action}`);
}, { ttlMs: 300_000 });
```

---

## LA-09 — Plugin registration order CỐ ĐỊNH

Thứ tự register plugin **ảnh hưởng hành vi runtime** (`onRequest` → `preHandler` → handler). Sai thứ tự = `req.caller` undefined hoặc 401 không có traceId.

```ts
// ✅ Đúng — thứ tự bắt buộc
import Fastify from 'fastify';
import {
  errorHandlerPlugin,
  vegabaseJwtPlugin,
  callerInfoPlugin,
  createBaseController,
} from '@vegabase/api';

const app = Fastify({ logger: true });

// 1. Error handler — phải đầu tiên để catch bất cứ throw nào ở plugin sau
await app.register(errorHandlerPlugin);

// 2. JWT — verify token, gắn req.user, từ chối 401 nếu thiếu/sai
await app.register(vegabaseJwtPlugin, {
  secret: process.env.JWT_SECRET!,
  issuer: process.env.JWT_ISSUER,
  audience: process.env.JWT_AUDIENCE,
});

// 3. CallerInfo — dùng req.user (do JWT plugin set) → expose req.caller
await app.register(callerInfoPlugin);

// 4. Controllers — đăng ký sau cùng để mọi route được protect
await app.register(productController);
await app.register(userController);

// ❌ Sai — JWT đăng ký SAU controller → route public hết
await app.register(productController);
await app.register(vegabaseJwtPlugin, { ... });
```

---

## LA-10 — Body limit / parser cấu hình ở app, không trong plugin

`@vegabase/api` không set body limit. Consumer cấu hình theo nhu cầu app:

```ts
// ✅ Đúng
const app = Fastify({
  logger: true,
  bodyLimit: 1 * 1024 * 1024,    // 1 MB cho JSON body
  trustProxy: true,               // nếu đứng sau load balancer
});

// Nếu cần upload file lớn → đăng ký plugin riêng cho route đó
import multipart from '@fastify/multipart';
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
```

KHÔNG set `bodyLimit` quá lớn (vd 100MB) cho instance dùng chung — DoS risk.

---

## LA-11 — Env vars BẮT BUỘC validate khi startup

Fail-fast nếu thiếu — đừng chờ request đầu tiên crash:

```ts
// src/api/server.ts
const REQUIRED = ['JWT_SECRET', 'DATABASE_URL'] as const;
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}
```

Optional env (`JWT_ISSUER`, `JWT_AUDIENCE`) chỉ cần check khi consumer thực sự dùng. Cân nhắc dùng [Zod](https://zod.dev/) schema cho env validation:

```ts
import { z } from 'zod';

const envSchema = z.object({
  JWT_SECRET: z.string().min(32),
  DATABASE_URL: z.string().url(),
  JWT_ISSUER: z.string().optional(),
  JWT_AUDIENCE: z.string().optional(),
  PORT: z.coerce.number().default(3000),
});

export const env = envSchema.parse(process.env);   // throw nếu invalid
```

---

## LA-12 — Startup sequence cố định

```ts
// src/api/server.ts
async function main() {
  // 1. Env validation (LA-11)
  const env = validateEnv();

  // 2. DB connection check
  await prisma.$connect();

  // 3. Optional: warm caches (master data, permissions cho role hot)
  // await categoryCache.getAll(loadAllCategories);

  // 4. Build Fastify app + register plugins (LA-09 order)
  const app = Fastify({ logger: true });
  await app.register(errorHandlerPlugin);
  await app.register(vegabaseJwtPlugin, { secret: env.JWT_SECRET });
  await app.register(callerInfoPlugin);

  // 5. Register controllers
  await app.register(productController);
  await app.register(userController);

  // 6. Listen
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

// 7. Graceful shutdown
process.on('SIGTERM', async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
});

main().catch(err => { console.error(err); process.exit(1); });
```

KHÔNG bỏ qua `await app.close()` / `await prisma.$disconnect()` — request đang xử lý sẽ bị giết giữa chừng + connection pool leak.
