# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Coding Standards (MANDATORY)

All code — human or AI-generated — must follow these standards. **Read the relevant file before editing any `.ts` file in that area.** If proposed code would violate a rule, point it out and suggest the compliant approach instead of silently proceeding.

### Internal rules (contributing to VegaBase Node)

| File | Rules |
|------|-------|
| [docs/coding-standards/01-naming.md](docs/coding-standards/01-naming.md) | NS-01–NS-08: Package names, file names, audit field prefix, async naming |
| [docs/coding-standards/02-architecture.md](docs/coding-standards/02-architecture.md) | LA-01–LA-06: Layer dependency, core purity, service/api responsibilities |
| [docs/coding-standards/03-base-classes.md](docs/coding-standards/03-base-classes.md) | BC-01–BC-10a: Which hooks to override, allowedUpdateFields, refineListData |
| [docs/coding-standards/04-error-handling.md](docs/coding-standards/04-error-handling.md) | EH-01–EH-06: Errors / Result\<T\>, DbResult, no silent catches |
| [docs/coding-standards/05-security.md](docs/coding-standards/05-security.md) | SEC-01–SEC-06: PermissionCache, Argon2id, JWT from env vars |
| [docs/coding-standards/06-database.md](docs/coding-standards/06-database.md) | DB-01–DB-07: Soft delete, no manual audit fields, UUIDv7, UnitOfWork |
| [docs/coding-standards/07-caching.md](docs/coding-standards/07-caching.md) | CA-01–CA-06: CacheStore usage, invalidation, what not to cache |
| [docs/coding-standards/08-testing.md](docs/coding-standards/08-testing.md) | TS-01–TS-05: Vitest, real DB, naming, AAA pattern |

### Consumer rules (applying VegaBase npm packages in downstream apps)

| File | Rules |
|------|-------|
| [docs/coding-standards/consumer/01-project-setup.md](docs/coding-standards/consumer/01-project-setup.md) | LA-07–LA-12: Project layout, plugin registration order, env vars, startup sequence |
| [docs/coding-standards/consumer/02-entity-prisma.md](docs/coding-standards/consumer/02-entity-prisma.md) | NS-09, DB-08–DB-13: Prisma model fields, soft-delete middleware, UUIDv7 PK, decimal precision |
| [docs/coding-standards/consumer/03-service-controller.md](docs/coding-standards/consumer/03-service-controller.md) | NS-10, BC-11–BC-17: ScreenCode constants, BaseService inheritance, controller plugin |

## Hard Rules (never break)

- **Never** set `logCreatedDate`, `logCreatedBy`, `logUpdatedDate`, `logUpdatedBy` manually — `DbActionExecutor` sets these.
- **Never** physical delete — use `executor.softDeleteAsync()`. `getList` auto-applies `isDeleted: false` via `applyFilter`; still add it manually in direct `executor.queryAsync()` calls (e.g. inside `checkAddCondition` for duplicate checks).
- **Never** hardcode role strings — use `permissions.hasPermission(roleId, screenCode, action)`.
- **Never** cache passwords, tokens, or PII.
- **Never** swallow exceptions in Service code — return a `Result` with errors instead.
- **Never** `throw` from a Service public method — return `fail([...])`. Throwing is reserved for `@vegabase/api` boundary (caught by `errorHandlerPlugin`).
- **Never** put business logic in Fastify route handlers, or HTTP types (`FastifyRequest`, `FastifyReply`) in Service / Core.
- **Never** override the public CRUD methods (`getList`, `add`, `updateField`, `delete`) on `BaseService` — use the protected hooks.
- **Never** inject `PrismaClient` into Service constructors. Service receives a `PrismaDelegate<T>` (the model-specific delegate, e.g. `prisma.product`) and uses it through `DbActionExecutor`.

## Coding Behavior

**Think before coding. State assumptions. Surface tradeoffs. Push back when warranted.**

- **Simplicity first** — no features beyond what was asked, no abstractions for single-use code, no speculative flexibility. If 200 lines could be 50, rewrite.
- **Surgical changes** — don't "improve" adjacent code, comments, or formatting. Match existing style. Only remove imports/variables your changes made unused.
- **Reuse before create** — before writing any new class, method, or utility, search the codebase for existing code that does the same or similar thing. Extend or call what exists; only create new code when there is no suitable match. If you find a near-match, state the difference and ask before duplicating.
- **Goal-driven** — transform tasks into verifiable goals first. "Fix the bug" → reproduce with a test, then fix. For multi-step tasks, state a brief plan with a verify step per item before touching code.

## Project Architecture

TypeScript monorepo (pnpm workspace), three packages, strict unidirectional dependency:

```
@vegabase/core    → Entities, types, Result<T>, ApiResponse (no Prisma, no Fastify)
@vegabase/service → Business logic (no Fastify, no HTTP types)
@vegabase/api     → Fastify plugins + controller factory (HTTP wiring only)
```

Each package:
- TypeScript strict mode, target ES2022, CommonJS modules
- Built by `tsc` to `dist/`, types emitted (`declaration: true`)
- Tested by Vitest

## Key Base Classes (quick index)

### `BaseService<TModel extends BaseEntity, TParam extends BaseParamModel>`

Constructor takes 3 dependencies: `executor: DbActionExecutor`, `permissions: PermissionCache`, `logger?: Logger` (defaults to `noopLogger`).

**Abstract members — must override (or won't compile):**

| Member | Purpose |
|------|---------|
| `protected readonly screenCode: string` | Screen code for `permissions.hasPermission` lookup. Empty string → all requests `PERMISSION_DENIED`. |
| `protected readonly delegate: PrismaDelegate<TModel>` | Prisma model delegate (e.g. `prisma.product`). Allows Service to query without importing `PrismaClient`. |
| `protected readonly allowedUpdateFields: ReadonlyArray<keyof TModel>` | Whitelist of fields the default `applyUpdate` will copy from `param` to `entity`. Prevents over-posting. |
| `protected buildNewEntity(param: TParam): Record<string, unknown>` | Map `param` to the field set for `prisma.create`. Audit + `id` + `isDeleted` are added by `DbActionExecutor`. |

**Virtual hooks — override when needed:**

| Hook | Purpose |
|------|---------|
| `applyFilter(where, param)` | Build Prisma `where` clause — receives `where` already containing `isDeleted: false`; add column filters here. Call `super.applyFilter` first to preserve the base condition. |
| `checkAddCondition(param, errors)` | Async business validation before insert; push errors via `errors.add(code, message, field?)` |
| `checkUpdateCondition(param, errors)` | Async business validation before update |
| `checkDeleteCondition(param, errors)` | Async business validation before soft-delete; push errors to abort the operation |
| `applyUpdate(entity, param)` | Custom mapping — default copies fields listed in `allowedUpdateFields` whose key passes `hasField(param, key)` |
| `onChanged()` | Synchronous cache invalidation, no params — exceptions are NOT caught here, so keep it side-effect-only |
| `refineListData(items, param, errors)` | Post-load enrichment — avoid N+1 (batch via `CacheStore` or single bulk query) |

Public methods (do NOT override): `getList`, `add`, `updateField`, `delete`. They handle permission check → validation hook → executor call → `onChanged()` → return `Result<T>`.

Details in [03-base-classes.md](docs/coding-standards/03-base-classes.md) (internal) and [consumer/03-service-controller.md](docs/coding-standards/consumer/03-service-controller.md) (how to apply in consumer apps).

### `createBaseController<TModel, TParam>(options)`

Factory that returns a `FastifyPluginAsync`. Registers four routes under `prefix`:

| Method + Path | Handler | Success status |
|---|---|---|
| `GET  {prefix}/list` | `service.getList` (input from `req.query`) | 200 |
| `POST {prefix}/add` | `service.add` (input from `req.body`) | 201 |
| `PUT  {prefix}/update-field` | `service.updateField` (input from `req.body`) | 200 |
| `DELETE {prefix}/delete` | `service.delete` (input from `req.query`) | 200 |

Each route:
1. Generates `traceId` via `crypto.randomUUID()`
2. Validates client input with the corresponding Zod schema
3. **Strips `callerUsername` / `callerRoles` from client input and overrides them from `req.caller`** (security — clients cannot impersonate)
4. Maps `Result.errors[0].code` → HTTP status via `STATUS_MAP` (`VALIDATION→400`, `PERMISSION_DENIED→403`, `NOT_FOUND→404`, `DUPLICATE_KEY→409`, `DB_TIMEOUT→503`, `UNKNOWN→500`)
5. Wraps response in `ApiResponse<T>` envelope (`{ success, data?, errors?, traceId }`)

### `BaseParamModel`

All param types extend this interface. Fields: `page?` (clamped ≥1), `pageSize?` (clamped 1–1000), `keyword?`, `sortBy?`, `sortDesc?`, `updatedFields?`, `callerUsername`, `callerRoles`, `id?`. Use `hasField(param, fieldName)` in `applyUpdate` to check partial updates — **v2 semantic: returns `false` when `updatedFields` is missing or empty** (no fields updated). Only returns `true` for fields explicitly listed. `updateField` with no `updatedFields` is a no-op (calls `onChanged()` then returns the existing entity).

## Infrastructure Quick Reference

- **Single-entity writes:** `DbActionExecutor` (retries non-`P2002/P2025/P2003` errors up to 2× with backoff, 30s timeout default).
- **Bulk inserts:** `DbActionExecutor.addRangeAsync(delegate, items, createdBy, chunkSize?)` — batches inserts in chunks of 500 (default) via `createMany`. Returns `DbResult<number>` (total inserted count).
- **Multi-entity writes:** `UnitOfWork` — wraps a Prisma `$transaction`. Enqueue `(tx) => tx.something(...)` callbacks, then `saveAsync()`.
- **Primary keys:** UUIDv7 generated by `DbActionExecutor.addAsync` / `addRangeAsync` (consumer's Prisma schema must declare `id String @id` without `@default(uuid())`).
- **getByIdAsync:** filters `isDeleted: false` by default (uses `findFirst`). Pass `{ includeDeleted: true }` to read soft-deleted records.
- **Validation errors:** push via `errors.add(code, message, field?)` — first error wins for HTTP status mapping.
- **DB results:** check `dbResult.isSuccess` before reading `.data`; on failure read `.error.code` (Prisma codes pass through).
- **HTTP responses:** `successResponse(data, traceId)` / `failResponse(errors, traceId)` — already wrapped by `createBaseController`.
- **Cache:** `CacheStore<TKey, TModel>` implements `ICacheStore<TKey, TModel>`. Single-flight prevents duplicate concurrent loads. `invalidate(key)` does NOT invalidate the `getAll` snapshot — only `invalidateAll()` does. `PermissionCache` for role→permission lookup (TTL 5 min default). Invalidate from `onChanged()`.

## Build & Run

```bash
pnpm install                           # restore workspaces
pnpm build                             # build all packages
pnpm test                              # vitest run all packages
pnpm --filter @vegabase/core build     # single package
pnpm --filter @vegabase/api test       # single package
```

### Publishing npm Packages

Each package is versioned independently. Bump `version` in `packages/<layer>/package.json`, then:

```bash
pnpm --filter @vegabase/<layer> build
pnpm --filter @vegabase/<layer> publish --access public
```

Commit message format: `feat(<layer>): <description> (v0.1.x)`

Workspace deps (`"@vegabase/core": "workspace:*"`) are rewritten by pnpm to a real version on publish.

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `JWT_SECRET` | Yes | — |
| `JWT_ISSUER` | No | — |
| `JWT_AUDIENCE` | No | — |
| `JWT_CLOCK_SKEW_SECONDS` | No | `30` (clamped to 0–300) — clock-drift tolerance for `iat`/`exp`/`nbf` |
| `DATABASE_URL` | Yes | — |

> Token issuance and expiry are the consumer's responsibility — `@vegabase/api` only verifies tokens at the `onRequest` hook.

## Contributor Workflow

This repo's `origin` is `https://github.com/hungngominh/vegabase-node.git`. If you are **not** `hungngominh`:

- Create a feature branch before editing: `git checkout -b <gh-username>/<short-desc>`
- After changes, push and open a PR targeting `main` via `gh pr create --base main`
- Never commit directly to `main` or `master`

Otherwise, follow the project's normal git flow.
