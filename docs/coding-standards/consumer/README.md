# Consumer Coding Standards

Bộ quy tắc dành cho developer **dùng các package `@vegabase/*` npm** để xây dựng ứng dụng.

## Audience

| Bạn là... | Đọc gì |
|---|---|
| Internal developer (contribute vào VegaBase Node) | Chỉ đọc `../01-08` |
| Consumer developer (dùng `@vegabase/*` npm) | Đọc `../01-08` (hiểu nguyên tắc) + `consumer/*` (cách áp dụng) |

## Mục lục

| # | File | Rule codes | Nội dung |
|---|---|---|---|
| 01 | [Project Setup](01-project-setup.md) | LA-07 → LA-12 | Project layout, plugin registration order, env vars, startup sequence |
| 02 | [Entity & Prisma](02-entity-prisma.md) | NS-09, DB-08 → DB-13 | Prisma model fields, soft-delete pattern, UUIDv7 PK, decimal precision |
| 03 | [Service & Controller](03-service-controller.md) | NS-10, BC-11 → BC-17 | BaseService, createBaseController, hooks, Param schema |

## Tất cả Rule Codes

| Code | Tiêu đề | File |
|---|---|---|
| LA-07 | Project layout mirror VegaBase Node | [01-project-setup.md](01-project-setup.md) |
| LA-08 | Prisma schema bridge bắt buộc | [01-project-setup.md](01-project-setup.md) |
| LA-09 | Plugin registration order cố định | [01-project-setup.md](01-project-setup.md) |
| LA-10 | Body limit / parser cấu hình ở app | [01-project-setup.md](01-project-setup.md) |
| LA-11 | Env vars bắt buộc validate khi startup | [01-project-setup.md](01-project-setup.md) |
| LA-12 | Startup sequence cố định | [01-project-setup.md](01-project-setup.md) |
| NS-09 | Module path theo domain | [02-entity-prisma.md](02-entity-prisma.md) |
| DB-08 | Prisma model có đủ BaseEntity fields | [02-entity-prisma.md](02-entity-prisma.md) |
| DB-09 | Index trên isDeleted | [02-entity-prisma.md](02-entity-prisma.md) |
| DB-10 | Unique constraint phải kèm filter isDeleted | [02-entity-prisma.md](02-entity-prisma.md) |
| DB-11 | id String không @default(uuid()) | [02-entity-prisma.md](02-entity-prisma.md) |
| DB-12 | Không dùng Prisma `delete` | [02-entity-prisma.md](02-entity-prisma.md) |
| DB-13 | Decimal phải khai báo precision | [02-entity-prisma.md](02-entity-prisma.md) |
| NS-10 | ScreenCode constants object | [03-service-controller.md](03-service-controller.md) |
| BC-11 | Inherit BaseService đúng generic | [03-service-controller.md](03-service-controller.md) |
| BC-12 | Override screenCode bắt buộc | [03-service-controller.md](03-service-controller.md) |
| BC-13 | Dùng hooks đúng mục đích | [03-service-controller.md](03-service-controller.md) |
| BC-14 | Param schema validate riêng cho add/update | [03-service-controller.md](03-service-controller.md) |
| BC-15 | Controller dùng createBaseController plugin | [03-service-controller.md](03-service-controller.md) |
| BC-16 | Custom route trả ApiResponse | [03-service-controller.md](03-service-controller.md) |
| BC-17 | Không inject PrismaClient vào Service | [03-service-controller.md](03-service-controller.md) |

## Cross-reference sang internal rules

Các consumer rules **mở rộng** internal rules — không lặp lại. Khi đọc consumer rule, tham chiếu về internal rule nền:

| Consumer rules | Mở rộng internal rules |
|---|---|
| LA-07 → LA-12 | [LA-01 → LA-06](../02-architecture.md) — dependency flow, layer responsibilities |
| DB-08 → DB-13 | [DB-01 → DB-07](../06-database.md) — soft delete, audit, transactions |
| BC-11 → BC-17 | [BC-01 → BC-10](../03-base-classes.md) — BaseService & createBaseController patterns |
| NS-09, NS-10 | [NS-01 → NS-08](../01-naming.md) — naming conventions |
