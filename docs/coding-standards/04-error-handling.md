# Error Handling

Service không throw. API layer là chỗ duy nhất chuyển exception thành HTTP response.

## Ba loại lỗi

| Loại | Đại diện | Nguồn | Đích |
|---|---|---|---|
| Business validation | `Errors.add(code, message, field?)` → `Result.fail` | `checkAddCondition`, custom logic | `Result.errors` → HTTP 400/403/404/409 |
| DB / infrastructure | `DbResult.error` (`{ code, message }`) | Prisma exception, timeout | `Result.fail([{ code: 'DB_TIMEOUT' \| 'DUPLICATE_KEY' \| ... }])` |
| Unexpected exception | `throw` | Bug, OOM, third-party crash | `errorHandlerPlugin` → HTTP 500 + traceId |

---

## EH-01 — Business errors dùng `Errors` (không throw)

```ts
import { Errors } from '@vegabase/core';

// ✅ Đúng
protected async checkAddCondition(p: UserParam, errors: Errors) {
  if (!p.email) errors.add('VALIDATION', 'Email bắt buộc', 'email');
  if (p.age && p.age < 18) errors.add('VALIDATION', 'Tuổi phải >= 18', 'age');
}

// ❌ Sai: throw → bị errorHandlerPlugin bắt → HTTP 500 (sai status, mất context)
protected async checkAddCondition(p: UserParam) {
  if (!p.email) throw new Error('Email required');
}
```

---

## EH-02 — Tích lũy errors qua `errors.add`, không exit sớm

```ts
// ✅ Đúng — báo cho user TẤT CẢ vấn đề trong 1 round-trip
protected async checkAddCondition(p: UserParam, errors: Errors) {
  if (!p.name)  errors.add('VALIDATION', 'Tên bắt buộc', 'name');
  if (!p.email) errors.add('VALIDATION', 'Email bắt buộc', 'email');
  if (p.price && p.price < 0) errors.add('VALIDATION', 'Giá phải >= 0', 'price');
}

// ❌ Sai — return sau lỗi đầu tiên
protected async checkAddCondition(p: UserParam, errors: Errors) {
  if (!p.name) { errors.add('VALIDATION', 'Tên bắt buộc', 'name'); return; }
  if (!p.email) { errors.add('VALIDATION', 'Email bắt buộc', 'email'); return; }
}
```

> `BaseService.add` đã short-circuit khi `errors.hasErrors()` — bạn không cần phải.

---

## EH-03 — Kiểm tra `DbResult.isSuccess` trước khi đọc `.data`

```ts
// ✅ Đúng
const result = await this.executor.queryAsync(this.delegate, { email: p.email });
if (!result.isSuccess) {
  errors.add('DB_TIMEOUT', result.error.message);
  return;
}
const items = result.data;

// ❌ Sai: TypeScript discriminated union ép typecheck, nhưng runtime vẫn crash nếu skip
const items = (await this.executor.queryAsync(...)).data;  // type error: data có thể không tồn tại
```

`DbResult<T>` là union `{ isSuccess: true; data: T; durationMs }` | `{ isSuccess: false; error: DbError; durationMs }`. TypeScript narrowing chỉ work sau khi check `.isSuccess`.

---

## EH-04 — Service KHÔNG throw — luôn trả `Result<T>`

```ts
// ✅ Đúng
async customAction(p: SomeParam): Promise<Result<SomeData>> {
  const r = await this.executor.queryAsync(...);
  if (!r.isSuccess) return fail([{ code: 'DB_TIMEOUT', message: r.error.message }]);
  return ok(r.data);
}

// ❌ Sai
async customAction(p: SomeParam) {
  const r = await this.executor.queryAsync(...);
  if (!r.isSuccess) throw new Error('DB failed');
  return r.data;
}
```

Lý do:
1. Caller phải xử lý lỗi tường minh — không quên try/catch.
2. HTTP status mapping ở `createBaseController` chỉ work với `Result.errors[].code`.
3. Throw bypass logic `traceId` → mất correlation với log.

Ngoại lệ: utility function thuần (vd `parseInt(...)` wrapper) có thể throw cho input invalid không thể recover. Nhưng public method của Service: KHÔNG.

---

## EH-05 — Không swallow exception

```ts
// ❌ Sai — nuốt lỗi, không log, không trả lỗi
protected async checkAddCondition(p, errors) {
  try {
    await this.someExternalCall();
  } catch { /* nothing */ }
}

// ❌ Sai — log rồi bỏ qua
try {
  await something();
} catch (e) {
  this.logger.error('failed', e);
  // không return, không add error → caller không biết
}

// ✅ Đúng — log + return error
try {
  await this.someExternalCall();
} catch (e) {
  this.logger.error('external call failed', e);
  errors.add('EXTERNAL_FAILURE', 'External service unavailable.');
}
```

---

## EH-06 — Không expose stack trace / nội bộ ra client

`errorHandlerPlugin` đã làm việc này — nó luôn trả message generic `"An unexpected error occurred."` cho HTTP 500 và log chi tiết server-side với `traceId`. KHÔNG bypass:

```ts
// ✅ Đúng — chuyển business error qua Errors (sẽ thành 4xx có message rõ ràng)
errors.add('VALIDATION', 'Email không hợp lệ', 'email');

// ❌ Sai — throw raw error → client thấy "TypeError: Cannot read properties of undefined"
if (!user) throw new TypeError(`User ${id} not found`);

// ❌ Sai — set custom error handler ghi đè plugin để leak detail
app.setErrorHandler((err, _req, reply) => {
  reply.status(500).send({ error: err.stack });   // leak trace
});
```

DB error code (vd `P2002`) cũng KHÔNG nên thấy ở client. `BaseService.add` đã map `P2002 → DUPLICATE_KEY` trước khi trả Result. Khi viết Service custom, làm tương tự — đừng để code Prisma raw lọt ra `Result.errors`.
