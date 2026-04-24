# Security

Quy tắc bắt buộc cho permission, authentication, password hashing, và data exposure.

---

## SEC-01 — Permission check qua `PermissionCache`, không hardcode role

```ts
// ✅ Đúng — BaseService đã làm sẵn cho 4 CRUD action
const allowed = await this.permissions.hasPermission(
  param.callerRoles[0] ?? '',
  this.screenCode,
  'READ',
);

// ✅ Đúng — custom action cũng phải gọi tương tự
async exportCsv(p: UserParam): Promise<Result<string>> {
  const ok = await this.permissions.hasPermission(p.callerRoles[0] ?? '', this.screenCode, 'EXPORT');
  if (!ok) return fail([{ code: 'PERMISSION_DENIED', message: 'Access denied.' }]);
  // ...
}

// ❌ Sai: hardcode role string
if (param.callerRoles.includes('admin')) { /* allow */ }
```

> `BaseService` hiện check role đầu tiên (`callerRoles[0]`). Khi cần multi-role check, viết Service method custom — không sửa `BaseService`.

---

## SEC-02 — Mọi route phải qua `vegabaseJwtPlugin` trừ public endpoint

`vegabaseJwtPlugin` add `onRequest` hook gọi `req.jwtVerify()` — token invalid → 401 ngay. Đăng ký plugin trước khi register route:

```ts
// ✅ Đúng
await app.register(errorHandlerPlugin);
await app.register(vegabaseJwtPlugin, { secret: process.env.JWT_SECRET! });
await app.register(callerInfoPlugin);
await app.register(createBaseController({ ... }));    // tự động được protect

// Public endpoint (login, healthcheck) → register vào instance riêng:
const publicApp = Fastify();
publicApp.post('/auth/login', loginHandler);
await app.register(async sub => {
  await sub.register(publicApp);
}, { prefix: '/public' });
```

KHÔNG bỏ qua plugin với hi vọng "internal route". Nếu route lên production, nó protected.

---

## SEC-03 — Chỉ dùng `Argon2idHasher` cho password

```ts
// ✅ Đúng
import { Argon2idHasher } from '@vegabase/api';
const hasher = new Argon2idHasher();   // OWASP defaults: timeCost 3, memoryCost 64MB, parallelism 4

const hash = await hasher.hash(plainPassword);
const valid = await hasher.verify(plainPassword, hash);

// ❌ Sai
import bcrypt from 'bcrypt';                                  // không dùng — Argon2id mạnh hơn
import crypto from 'crypto';
crypto.createHash('sha256').update(plainPassword).digest();   // không phải password hash function
```

Khi cần custom OWASP parameters (vd app low-traffic muốn mạnh hơn), pass options:

```ts
new Argon2idHasher({ timeCost: 4, memoryCost: 131072 });  // 128MB
```

KHÔNG hạ thấp default để tăng performance. Nếu hash chậm, scale theo CPU thay vì giảm cost.

---

## SEC-04 — JWT secret PHẢI từ env var

```ts
// ✅ Đúng
await app.register(vegabaseJwtPlugin, {
  secret: process.env.JWT_SECRET!,
  issuer: process.env.JWT_ISSUER,
  audience: process.env.JWT_AUDIENCE,
});

// ❌ Sai — hardcode trong code
await app.register(vegabaseJwtPlugin, { secret: 'super-secret-123' });

// ❌ Sai — đọc từ file commit vào git
await app.register(vegabaseJwtPlugin, { secret: require('./config.json').jwtSecret });
```

Validate khi startup — fail-fast nếu thiếu:

```ts
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET env var is required');
  process.exit(1);
}
```

---

## SEC-05 — Không log sensitive data

| KHÔNG log | OK log |
|---|---|
| Password (plain hoặc hash) | `"login attempt"` + username |
| JWT token | jwt `sub` claim hoặc `traceId` |
| Bearer header | `"authenticated"` boolean |
| PII (CMND, SĐT đầy đủ, địa chỉ) | userId, role |
| API key của 3rd party | "calling vendor X" |

```ts
// ❌ Sai
this.logger.info('user login', { username, password });

// ✅ Đúng
this.logger.info('user login attempt', { username, traceId });
```

`errorHandlerPlugin` log full error object — đảm bảo error object không chứa password (vd `argon2.verify` exception KHÔNG bao gồm input password — an toàn).

---

## SEC-06 — Không trả sensitive data trong response

```ts
// ❌ Sai — service trả nguyên user entity → password hash bị serialize
return ok(userResult.data);

// ✅ Đúng — service shape lại, loại bỏ field nhạy cảm
const { passwordHash, ...safe } = userResult.data;
return ok(safe);
```

Cách bền vững hơn: tạo `UserPublicModel` interface chỉ chứa field public. Map từ `User` entity sang `UserPublicModel` trước khi `ok(...)`. Khi schema thay đổi, TypeScript bắt buộc update mapping.

`createBaseController` không filter response — Service trả gì, client thấy nấy. Trách nhiệm là của Service.
