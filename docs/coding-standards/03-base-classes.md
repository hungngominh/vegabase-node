# Base Classes

Quy tắc extend và sử dụng `BaseService` và `createBaseController`.

## Tổng quan hooks của BaseService

| Hook | Mục đích | Khi nào override |
|---|---|---|
| `applyFilter` | Build Prisma `where` clause | Luôn override khi có filter param (luôn `super.applyFilter` trước) |
| `checkAddCondition` | Validate trước insert | Khi có business rule cho add |
| `checkUpdateCondition` | Validate trước update | Khi có business rule cho update |
| `applyUpdate` | Map param → entity | Khi cần custom mapping (default copy theo `allowedUpdateFields`) |
| `onChanged` | Sau write thành công | Khi có cache cần invalidate |
| `refineListData` | Enrich sau khi load | Khi cần join data in-memory |

Public methods không được override: `getList`, `add`, `updateField`, `delete`. Chúng wrap permission check + validation hook + executor + `onChanged()`.

---

## BC-01 — Service CRUD phải kế thừa `BaseService<TModel, TParam>`

```ts
// ✅ Đúng
import { BaseService } from '@vegabase/service';
import type { User } from '@prisma/client';

export class UserService extends BaseService<User, UserParam> { ... }

// ❌ Sai: tự implement CRUD từ đầu
export class UserService {
  async getList(p: UserParam) { /* viết lại toàn bộ */ }
}
```

---

## BC-02 — Generic constraints phải đúng kiểu

```ts
// ✅ Đúng
class UserService extends BaseService<User, UserParam> { }
// User : BaseEntity ✓ (vì Prisma model có đủ field theo DB-08)
// UserParam : BaseParamModel ✓

// ❌ Sai: TModel không thoả BaseEntity (thiếu logCreatedDate, …)
class UserService extends BaseService<{ id: string; name: string }, UserParam> { }
```

---

## BC-03 — `applyFilter` PHẢI gọi `super.applyFilter` trước

`super.applyFilter` thêm `isDeleted: false`. Quên gọi → list trả luôn cả record đã soft-delete:

```ts
// ✅ Đúng
protected applyFilter(where: Record<string, unknown>, p: UserParam) {
  const base = super.applyFilter(where, p);  // { isDeleted: false }
  if (p.keyword) return { ...base, name: { contains: p.keyword } };
  return base;
}

// ❌ Sai: bỏ qua super → trả cả record đã xóa
protected applyFilter(where: Record<string, unknown>, p: UserParam) {
  if (p.keyword) return { name: { contains: p.keyword } };
  return where;
}
```

---

## BC-04 — `checkAddCondition` cho business validation trước insert

```ts
// ✅ Đúng — push lỗi qua errors.add(code, message, field?)
protected async checkAddCondition(p: UserParam, errors: Errors) {
  const existing = await this.executor.queryAsync(this.delegate, { email: p.email, isDeleted: false });
  if (existing.isSuccess && existing.data.length > 0) {
    errors.add('VALIDATION', 'Email đã được sử dụng.', 'email');
  }
}

// ❌ Sai: throw exception
protected async checkAddCondition(p: UserParam) {
  if (await this.emailExists(p.email)) throw new Error('Email taken');  // EH-04 vi phạm
}
```

> Khi `errors.hasErrors()` là `true`, `BaseService.add` short-circuit trả `errors.toResult()` — KHÔNG gọi `executor.addAsync`.

---

## BC-05 — `onChanged` để invalidate cache sau write

`onChanged()` không có tham số, là synchronous, được gọi SAU khi DB write thành công:

```ts
// ✅ Đúng
protected onChanged(): void {
  this.userCache.invalidateAll();
}

// ✅ Cũng đúng: lưu Id ở applyUpdate, dùng trong onChanged
private lastChangedId: string | null = null;

protected applyUpdate(entity: User, param: UserParam) {
  this.lastChangedId = entity.id;
  super.applyUpdate(entity, param);
}
protected onChanged(): void {
  if (this.lastChangedId) this.userCache.invalidate(this.lastChangedId);
}

// ❌ Sai: async / có tham số
protected async onChanged(entity: User) {  // signature không khớp → không được gọi
  await this.userCache.invalidate(entity.id);
}
```

> Khác với .NET (catch + log exception), `BaseService` Node KHÔNG bắt lỗi của `onChanged`. Giữ nó thuần side-effect đơn giản.

---

## BC-06 — `hasField(param, fieldName)` cho partial update

```ts
import { hasField } from '@vegabase/service';

// ✅ Đúng — chỉ apply field client gửi
protected applyUpdate(entity: User, p: UserParam) {
  if (hasField(p, 'name'))  entity.name  = p.name!;
  if (hasField(p, 'email')) entity.email = p.email!;
}

// ❌ Sai: ghi đè cả field client không gửi → null hóa data
protected applyUpdate(entity: User, p: UserParam) {
  entity.name  = p.name!;     // undefined nếu client không gửi
  entity.email = p.email!;
}
```

> `hasField` trả `true` khi `param.updatedFields` rỗng (case `add`), trả `true/false` theo `updatedFields.includes(field)` khi có (case `updateField`).

---

## BC-07 — Không override public CRUD methods

Dùng hooks thay vì override `getList` / `add` / `updateField` / `delete`:

```ts
// ✅ Đúng
protected async checkAddCondition(...) { }
protected applyUpdate(...) { }

// ❌ Sai
async add(p: UserParam): Promise<Result<User>> {
  // bỏ qua permission check, validation hook, audit fields
  return ok(await this.delegate.create({ data: p }));
}
```

Override là valid cho rất ít trường hợp đặc biệt (ví dụ workflow đa bước cần transaction); khi đó dùng `UnitOfWork` và viết một public method tên khác (vd `submitWorkflow`), không che `add`.

---

## BC-08 — `allowedUpdateFields` whitelist BẮT BUỘC

`BaseService` dùng `allowedUpdateFields` để biết field nào được phép copy từ param sang entity. Để rỗng → `updateField` không update gì. Để `'*'` → cho phép over-posting (KHÔNG bao giờ làm vậy):

```ts
// ✅ Đúng — whitelist tường minh
protected readonly allowedUpdateFields = ['name', 'price', 'description'] as const;

// ❌ Sai — bỏ trống
protected readonly allowedUpdateFields = [] as const;  // updateField sẽ không làm gì

// ❌ Sai — kéo từ Object.keys của entity
protected readonly allowedUpdateFields = Object.keys({} as User);  // bao gồm cả id, audit fields → security hole
```

Khi consumer custom hoá hoàn toàn `applyUpdate`, vẫn phải khai báo `allowedUpdateFields` đầy đủ — `BaseService.updateField` dùng nó để build Prisma `data` payload sau khi `applyUpdate` chạy.

---

## BC-09 — Controller dùng `createBaseController` plugin, không tự viết route CRUD

```ts
// ✅ Đúng
await app.register(
  createBaseController({
    service: userService,
    prefix: '/api/v1/users',
    schemas: { add: userAddSchema, update: userUpdateSchema },
  }),
);

// ❌ Sai: tự viết 4 route CRUD lại
app.get('/api/v1/users/list', async (r, reply) => { /* gọi service.getList */ });
app.post('/api/v1/users/add', async (r, reply) => { /* gọi service.add */ });
// ...
```

`createBaseController` đã handle: traceId, Zod validation, **strip caller fields khỏi client input**, status code mapping, ApiResponse envelope. Tự viết là dễ thiếu một trong số đó.

---

## BC-10 — `refineListData` cho enrichment sau load, không query trong loop

```ts
// ✅ Đúng — batch load qua CacheStore (1 query)
protected async refineListData(items: User[], _p: UserParam, _err: Errors) {
  const roles = await this.roleCache.getAll(() => this.loadAllRoles());
  for (const u of items) {
    (u as any).roleName = roles.find(r => r.id === u.roleId)?.name;
  }
}

// ❌ Sai: N+1 query trong loop
protected async refineListData(items: User[], _p: UserParam, _err: Errors) {
  for (const u of items) {
    const r = await this.executor.getByIdAsync(this.roleDelegate, u.roleId);  // N queries
    (u as any).roleName = r.data?.name;
  }
}
```

`refineListData` được gọi SAU khi pagination — số `items` ≤ `pageSize`, nhưng N=20 vẫn là 20 query thừa.
