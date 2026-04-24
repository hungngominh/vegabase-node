# VegaBase Node Coding Standards

Bộ quy tắc lập trình cho VegaBase Node — áp dụng cho developer mới, team nội bộ, và người tích hợp các package `@vegabase/*`.

## Cách sử dụng

- Khi review PR: tham chiếu mã rule trong comment (ví dụ: `vi phạm NS-03`)
- Khi onboarding: đọc tuần tự từ 01 → 08
- Khi tích hợp npm packages: đọc 02, 03, 04 + toàn bộ `consumer/`

## Audience

| Người dùng | Đọc gì |
|---|---|
| **Internal developer** (contribute vào VegaBase Node) | 01–08 |
| **Consumer developer** (dùng `@vegabase/*` npm) | 01–08 (hiểu nguyên tắc) + [`consumer/`](consumer/README.md) (cách áp dụng) |

## Mục lục

| # | File | Nội dung |
|---|---|---|
| 01 | [Naming Conventions](01-naming.md) | Đặt tên package, file, class, interface, field |
| 02 | [Layer Architecture](02-architecture.md) | Dependency flow, trách nhiệm từng package |
| 03 | [Base Classes](03-base-classes.md) | Cách extend BaseService & dùng createBaseController |
| 04 | [Error Handling](04-error-handling.md) | Errors, Result\<T\>, DbResult, exceptions |
| 05 | [Security](05-security.md) | Password, JWT, RBAC |
| 06 | [Database](06-database.md) | Soft delete, audit, transactions |
| 07 | [Caching](07-caching.md) | Cache rules và invalidation |
| 08 | [Testing](08-testing.md) | Vitest standards |
| — | [Consumer Standards](consumer/README.md) | Setup project, Prisma model, Service/Controller cho consumer app |

## Tất cả Rule Codes

| Code | Tiêu đề | File |
|---|---|---|
| NS-01 | Package name `@vegabase/<layer>` | [01-naming.md](01-naming.md) |
| NS-02 | Entity / model interface không suffix | [01-naming.md](01-naming.md) |
| NS-03 | Param interface suffix | [01-naming.md](01-naming.md) |
| NS-04 | File name kebab-case | [01-naming.md](01-naming.md) |
| NS-05 | Interface không I prefix | [01-naming.md](01-naming.md) |
| NS-06 | Audit fields `log` prefix camelCase | [01-naming.md](01-naming.md) |
| NS-07 | Async method suffix `Async` | [01-naming.md](01-naming.md) |
| NS-08 | Screen codes UPPER_SNAKE | [01-naming.md](01-naming.md) |
| LA-01 | Dependency flow một chiều | [02-architecture.md](02-architecture.md) |
| LA-02 | Core không có Prisma / Fastify | [02-architecture.md](02-architecture.md) |
| LA-03 | Service không có Fastify types | [02-architecture.md](02-architecture.md) |
| LA-04 | Business logic chỉ trong Service | [02-architecture.md](02-architecture.md) |
| LA-05 | API chỉ là HTTP wiring | [02-architecture.md](02-architecture.md) |
| LA-06 | Type chung phải định nghĩa trong Core | [02-architecture.md](02-architecture.md) |
| BC-01 | Extend BaseService cho CRUD | [03-base-classes.md](03-base-classes.md) |
| BC-02 | Generic constraints đúng | [03-base-classes.md](03-base-classes.md) |
| BC-03 | applyFilter phải call super | [03-base-classes.md](03-base-classes.md) |
| BC-04 | checkAddCondition cho validation | [03-base-classes.md](03-base-classes.md) |
| BC-05 | onChanged cho cache invalidation | [03-base-classes.md](03-base-classes.md) |
| BC-06 | hasField cho partial update | [03-base-classes.md](03-base-classes.md) |
| BC-07 | Không override public CRUD methods | [03-base-classes.md](03-base-classes.md) |
| BC-08 | allowedUpdateFields whitelist bắt buộc | [03-base-classes.md](03-base-classes.md) |
| BC-09 | Controller dùng createBaseController | [03-base-classes.md](03-base-classes.md) |
| BC-10 | refineListData cho post-load enrichment | [03-base-classes.md](03-base-classes.md) |
| EH-01 | Errors cho business errors | [04-error-handling.md](04-error-handling.md) |
| EH-02 | Tích lũy errors qua errors.add | [04-error-handling.md](04-error-handling.md) |
| EH-03 | Kiểm tra DbResult.isSuccess | [04-error-handling.md](04-error-handling.md) |
| EH-04 | Service không throw — trả Result | [04-error-handling.md](04-error-handling.md) |
| EH-05 | Không swallow exceptions | [04-error-handling.md](04-error-handling.md) |
| EH-06 | Không expose stack trace cho client | [04-error-handling.md](04-error-handling.md) |
| SEC-01 | Permission qua PermissionCache | [05-security.md](05-security.md) |
| SEC-02 | jwtPlugin trên mọi route trừ public | [05-security.md](05-security.md) |
| SEC-03 | Chỉ dùng Argon2idHasher | [05-security.md](05-security.md) |
| SEC-04 | JWT_SECRET từ env var | [05-security.md](05-security.md) |
| SEC-05 | Không log sensitive data | [05-security.md](05-security.md) |
| SEC-06 | Không trả sensitive data trong response | [05-security.md](05-security.md) |
| DB-01 | Chỉ dùng softDeleteAsync | [06-database.md](06-database.md) |
| DB-02 | Không set audit fields thủ công | [06-database.md](06-database.md) |
| DB-03 | Multi-entity dùng UnitOfWork | [06-database.md](06-database.md) |
| DB-04 | Single-entity dùng DbActionExecutor | [06-database.md](06-database.md) |
| DB-05 | Raw SQL phải có comment | [06-database.md](06-database.md) |
| DB-06 | Filter isDeleted trong applyFilter | [06-database.md](06-database.md) |
| DB-07 | Primary key là UUIDv7 từ executor | [06-database.md](06-database.md) |
| CA-01 | Chỉ cache dữ liệu ít thay đổi | [07-caching.md](07-caching.md) |
| CA-02 | Dùng CacheStore<K,V> | [07-caching.md](07-caching.md) |
| CA-03 | Invalidate qua onChanged | [07-caching.md](07-caching.md) |
| CA-04 | Không cache sensitive data | [07-caching.md](07-caching.md) |
| CA-05 | PermissionCache invalidation đúng lúc | [07-caching.md](07-caching.md) |
| CA-06 | Cache là optimization, không phải dependency | [07-caching.md](07-caching.md) |
| TS-01 | Unit test cho hooks | [08-testing.md](08-testing.md) |
| TS-02 | Integration test dùng real DB | [08-testing.md](08-testing.md) |
| TS-03 | Test naming convention | [08-testing.md](08-testing.md) |
| TS-04 | AAA pattern, một assertion chính | [08-testing.md](08-testing.md) |
| TS-05 | Test file đặt trong `__tests__/` | [08-testing.md](08-testing.md) |
| **Consumer Rules** | | |
| LA-07 | Project layout mirror VegaBase Node | [consumer/01-project-setup.md](consumer/01-project-setup.md) |
| LA-08 | Prisma schema bridge bắt buộc | [consumer/01-project-setup.md](consumer/01-project-setup.md) |
| LA-09 | Plugin registration order cố định | [consumer/01-project-setup.md](consumer/01-project-setup.md) |
| LA-10 | Body limit / parser cấu hình ở app | [consumer/01-project-setup.md](consumer/01-project-setup.md) |
| LA-11 | Env vars bắt buộc validate khi startup | [consumer/01-project-setup.md](consumer/01-project-setup.md) |
| LA-12 | Startup sequence cố định | [consumer/01-project-setup.md](consumer/01-project-setup.md) |
| NS-09 | Module path theo domain | [consumer/02-entity-prisma.md](consumer/02-entity-prisma.md) |
| DB-08 | Prisma model có đủ BaseEntity fields | [consumer/02-entity-prisma.md](consumer/02-entity-prisma.md) |
| DB-09 | Index trên isDeleted | [consumer/02-entity-prisma.md](consumer/02-entity-prisma.md) |
| DB-10 | Unique constraint phải kèm filter isDeleted | [consumer/02-entity-prisma.md](consumer/02-entity-prisma.md) |
| DB-11 | id String không @default(uuid()) | [consumer/02-entity-prisma.md](consumer/02-entity-prisma.md) |
| DB-12 | Không dùng Prisma `delete` | [consumer/02-entity-prisma.md](consumer/02-entity-prisma.md) |
| DB-13 | Decimal phải khai báo precision | [consumer/02-entity-prisma.md](consumer/02-entity-prisma.md) |
| NS-10 | ScreenCode constants object | [consumer/03-service-controller.md](consumer/03-service-controller.md) |
| BC-11 | Inherit BaseService đúng generic | [consumer/03-service-controller.md](consumer/03-service-controller.md) |
| BC-12 | Override screenCode bắt buộc | [consumer/03-service-controller.md](consumer/03-service-controller.md) |
| BC-13 | Dùng hooks đúng mục đích | [consumer/03-service-controller.md](consumer/03-service-controller.md) |
| BC-14 | Param schema validate riêng cho add/update | [consumer/03-service-controller.md](consumer/03-service-controller.md) |
| BC-15 | Controller dùng createBaseController plugin | [consumer/03-service-controller.md](consumer/03-service-controller.md) |
| BC-16 | Custom route trả ApiResponse | [consumer/03-service-controller.md](consumer/03-service-controller.md) |
| BC-17 | Không inject PrismaClient vào Service | [consumer/03-service-controller.md](consumer/03-service-controller.md) |
