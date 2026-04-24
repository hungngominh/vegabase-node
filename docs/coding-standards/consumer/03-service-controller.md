# Service & Controller

Quy tắc kế thừa `BaseService` và đăng ký `createBaseController` trong consumer app.

> **Prerequisite:** Đọc [03-base-classes.md](../03-base-classes.md) trước — consumer rules này mở rộng, không lặp lại.

---

## NS-10 — `ScreenCodes` constants object

Consumer tạo file `src/core/screen-codes.ts`:

```ts
// src/core/screen-codes.ts

// Master list — sync vào bảng Screen khi startup (seed)
export const ScreenCodes = {
  PRD_PRODUCT: 'PRD_PRODUCT',
  USR_USER:    'USR_USER',
  VHC_VEHICLE: 'VHC_VEHICLE',
  // ... mỗi screen 1 entry
} as const;

export type ScreenCode = typeof ScreenCodes[keyof typeof ScreenCodes];

// Optional: label cho UI / seed Screen table
export const ScreenLabels: Record<ScreenCode, string> = {
  PRD_PRODUCT: 'Quản lý sản phẩm',
  USR_USER:    'Quản lý người dùng',
  VHC_VEHICLE: 'Quản lý phương tiện',
};
```

**Format:** `MODULE_ENTITY` UPPER_SNAKE — match với screen code lưu trong DB (Screen / RolePermission table). Đồng nhất giữa code và DB giúp dễ search log + grep.

DbInitializer / seed script dùng `ScreenLabels` để upsert Screen table khi startup.

---

## BC-11 — Inherit `BaseService` đúng generic

```ts
// src/service/products/product-service.ts
import { BaseService, type Logger } from '@vegabase/service';
import type { Product, PrismaClient } from '@prisma/client';
import type { ProductParam } from './product-param';
import { ScreenCodes } from '../../core/screen-codes';
import type { DbActionExecutor, PermissionCache } from '@vegabase/service';

export class ProductService extends BaseService<Product, ProductParam> {
  protected readonly screenCode = ScreenCodes.PRD_PRODUCT;
  protected readonly delegate;
  protected readonly allowedUpdateFields = ['name', 'price', 'description'] as const;

  constructor(
    prisma: PrismaClient,
    executor: DbActionExecutor,
    permissions: PermissionCache,
    logger?: Logger,
  ) {
    super(executor, permissions, logger);
    this.delegate = prisma.product;
  }

  protected buildNewEntity(p: ProductParam) {
    return { name: p.name, price: p.price, description: p.description };
  }
}
```

Generic order: `TModel` (∈ Prisma generated) → `TParam` (extends `BaseParamModel`). Sai order → compile error.

Constructor PHẢI pass đủ `executor`, `permissions`, optional `logger` lên `super()`.

---

## BC-12 — Override `screenCode` BẮT BUỘC

```ts
// ✅ Đúng
protected readonly screenCode = ScreenCodes.PRD_PRODUCT;

// ❌ Sai — empty string → permissions.hasPermission lookup fail → mọi request 403
protected readonly screenCode = '';

// ❌ Sai — hardcode magic string
protected readonly screenCode = 'PRD_PRODUCT';   // không type-safe, dễ typo
```

Khó debug vì `BaseService` không throw khi `screenCode` rỗng — chỉ trả `Result.fail([{ code: 'PERMISSION_DENIED' }])` → user nhìn thấy 403 không có context.

---

## BC-13 — Dùng hooks đúng mục đích

| Hook | Khi nào dùng | KHÔNG dùng để |
|---|---|---|
| `applyFilter` | Build Prisma `where` clause đồng bộ | Async query cross-table |
| `checkAddCondition` | Validate duplicate / constraint trước Add | Filter list |
| `checkUpdateCondition` | Validate khi update, kết hợp `hasField` | Apply mutation |
| `checkDeleteCondition` | Validate trước soft-delete | Filter list |
| `applyUpdate` | Map `param` → `entity` | Validate (đã có `checkUpdateCondition`) |
| `refineListData` | Post-load enrich (label, count) | Filter (đã paginate rồi) |
| `onChanged` | Invalidate cache sau write | Query DB / async |

**applyFilter** — sync, return Prisma `where`:

```ts
protected applyFilter(where: Record<string, unknown>, p: ProductParam) {
  const base = super.applyFilter(where, p);
  const cond: Record<string, unknown> = { ...base };
  if (p.statusCode) cond.statusCode = p.statusCode;
  if (p.searchTerm) cond.name = { contains: p.searchTerm, mode: 'insensitive' };
  return cond;
}
```

**Khi cần async cross-table filter** → viết Service method custom (vd `getListByFuelType`), KHÔNG nhét async vào `applyFilter`. `BaseService.getList` vẫn handle CRUD chung; method custom của bạn handle case đặc biệt và vẫn tự gọi `permissions.hasPermission` + audit pattern.

---

## BC-14 — Param + Zod schema validate riêng cho add / update

```ts
// src/service/products/product-param.ts
import type { BaseParamModel } from '@vegabase/service';

export interface ProductParam extends BaseParamModel {
  name?: string;
  price?: number;
  description?: string;
  // filter fields
  statusCode?: string;
  searchTerm?: string;
}

// src/service/products/product-schemas.ts
import { z } from 'zod';

const callerOmit = { callerUsername: true, callerRoles: true } as const;

export const productAddSchema = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  description: z.string().optional(),
}) as unknown as z.ZodType<any>;

export const productUpdateSchema = z.object({
  id: z.string().uuid(),
  updatedFields: z.array(z.string()),
  name: z.string().min(1).optional(),
  price: z.number().nonnegative().optional(),
  description: z.string().optional(),
}) as unknown as z.ZodType<any>;
```

**Quan trọng:** schema KHÔNG include `callerUsername` / `callerRoles` — `createBaseController.buildParam` strip mọi value client gửi cho 2 field này và override bằng `req.caller` (security pattern). Nếu schema yêu cầu các field đó, client có thể gửi nhưng sẽ bị thay thế trước khi vào Service.

`BaseParamModel` cung cấp sẵn các field common: `page`, `pageSize`, `keyword`, `sortBy`, `sortDesc`, `updatedFields`, `id`, `callerUsername`, `callerRoles`. Schema add/update chỉ cần khai báo các field domain-specific.

---

## BC-15 — Controller dùng `createBaseController` plugin

```ts
// src/api/routes/products.ts
import type { FastifyPluginAsync } from 'fastify';
import { createBaseController } from '@vegabase/api';
import { productService } from '../../service/products';
import { productAddSchema, productUpdateSchema } from '../../service/products/product-schemas';

export const productRoutes: FastifyPluginAsync = createBaseController({
  service: productService,
  prefix: '/api/v1/products',
  schemas: {
    add: productAddSchema,
    update: productUpdateSchema,
    // list / delete optional — fallback dùng add schema
  },
});

// src/api/server.ts
await app.register(productRoutes);
```

`createBaseController` đăng ký 4 routes:

| Method | Path | Service method | Status thành công |
|---|---|---|---|
| GET | `{prefix}/list` | `getList` | 200 |
| POST | `{prefix}/add` | `add` | 201 |
| PUT | `{prefix}/update-field` | `updateField` | 200 |
| DELETE | `{prefix}/delete` | `delete` | 200 |

Toàn bộ:
- Tự generate `traceId`
- Validate Zod schema
- Strip caller fields, override từ `req.caller` (security)
- Map error code → HTTP status (`VALIDATION→400`, `PERMISSION_DENIED→403`, `NOT_FOUND→404`, `DUPLICATE_KEY→409`, `DB_TIMEOUT→503`, fallback 500)
- Wrap response trong `ApiResponse<T>` envelope

---

## BC-16 — Custom route TRẢ `ApiResponse`

Route ngoài CRUD (vd `/products/options`, `/reports/...`) phải wrap response trong `successResponse(data, traceId)`:

```ts
import { successResponse, failResponse } from '@vegabase/core';

// ✅ Đúng
app.get('/api/v1/products/options', async (req, reply) => {
  const traceId = crypto.randomUUID();
  const data = await categoryService.getOptions();
  return reply.send(successResponse(data, traceId));
});

// ❌ Sai — raw object → frontend response handler không parse được
app.get('/api/v1/products/options', async (req, reply) => {
  const data = await categoryService.getOptions();
  return reply.send({ items: data });
});
```

Frontend expect envelope `{ success: boolean, data?: T, errors?: ServiceError[], traceId: string }`. Mỗi response không follow envelope → break global response interceptor.

Khi cần extend ApiResponse với extra field:

```ts
interface ApiResponseWithSuggestions<T, S> extends ApiResponse<T> {
  suggestions: S[];
}

// Build thủ công khi `successResponse` không đủ
return reply.send({
  success: true,
  data: products,
  suggestions: relatedProducts,
  traceId,
});
```

---

## BC-17 — KHÔNG inject `PrismaClient` vào Service

Service chỉ nhận `PrismaDelegate<T>` qua constructor (vd `prisma.product`):

```ts
// ❌ Sai — Service biết toàn bộ schema
class ProductService extends BaseService<Product, ProductParam> {
  constructor(private prisma: PrismaClient, ...) {
    super(...);
  }
  async findRelated(id: string) {
    return this.prisma.product.findMany({ ... });   // bypass executor — mất retry/audit
  }
}

// ✅ Đúng — chỉ delegate
class ProductService extends BaseService<Product, ProductParam> {
  constructor(prisma: PrismaClient, executor, permissions, logger?) {
    super(executor, permissions, logger);
    this.delegate = prisma.product;       // chỉ delegate cho 1 model
  }
}
```

Trường hợp ngoại lệ — Service custom CẦN multiple delegate (vd join 2-3 bảng):
- Truyền các delegate cụ thể, KHÔNG truyền `PrismaClient` đầy đủ:

```ts
constructor(
  prisma: PrismaClient,
  executor: DbActionExecutor,
  permissions: PermissionCache,
) {
  super(executor, permissions);
  this.delegate = prisma.order;
  this.itemDelegate = prisma.orderItem;
}
```

Trường hợp cần transaction → dùng `UnitOfWork` (cần `PrismaClient` đầy đủ) — đăng ký một dependency riêng `prisma: PrismaClient` chỉ cho mục đích transaction, KHÔNG dùng cho query lẻ:

```ts
constructor(
  private readonly prisma: PrismaClient,    // chỉ dùng cho UnitOfWork
  executor: DbActionExecutor,
  permissions: PermissionCache,
) {
  super(executor, permissions);
  this.delegate = prisma.order;
}

async createOrderWithItems(p: OrderParam): Promise<Result<Order>> {
  const uow = new UnitOfWork(this.prisma);
  // ... enqueue các operation
  return await uow.saveAsync().then(...);
}
```
