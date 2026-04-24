# Caching

Quy tắc dùng `CacheStore` và `PermissionCache`.

## Khi nào cache

| Loại dữ liệu | Cache? | Lý do |
|---|---|---|
| Master data (role, permission, category, lookup) | ✅ | Đọc nhiều, ghi rất ít, an toàn TTL |
| Reference dictionary (country, currency) | ✅ | Hầu như không đổi |
| Aggregate report (top-N, stats trong ngày) | ⚠️ | OK với TTL ngắn (1-5 phút) |
| User profile của caller hiện tại | ❌ | Đã có trong `req.caller` từ JWT |
| Transactional data (order, transaction) | ❌ | Phải nhất quán tức thời |
| Sensitive data (token, password hash, PII) | ❌ | SEC-05 / CA-04 |

---

## CA-01 — Chỉ cache dữ liệu ít thay đổi

```ts
// ✅ Đúng — Permission, Category
private readonly categoryCache = new CacheStore<string, Category>({ ttlMs: 600_000 });  // 10 min

// ❌ Sai — order trạng thái đang đổi liên tục
private readonly orderCache = new CacheStore<string, Order>({ ttlMs: 60_000 });
// → user thấy stale trạng thái 1 phút
```

Quy tắc heuristic: nếu invalidation pattern phức tạp hơn `onChanged() => cache.invalidateAll()`, có lẽ data đó không nên cache.

---

## CA-02 — Dùng `CacheStore<TKey, TModel>`, không tự build cache logic

```ts
// ✅ Đúng
import { CacheStore } from '@vegabase/service';

class CategoryService extends BaseService<Category, CategoryParam> {
  private readonly cache = new CacheStore<string, Category>({ ttlMs: 600_000 });

  async getByCode(code: string) {
    return this.cache.getItem(code, async key => {
      const r = await this.executor.queryAsync(this.delegate, { code: key, isDeleted: false });
      return r.isSuccess && r.data.length > 0 ? r.data[0] : null;
    });
  }
}

// ❌ Sai — tự viết Map + TTL, dễ leak / sai logic expiration
private readonly cache = new Map<string, Category>();
private readonly cacheTime = new Map<string, number>();
async getByCode(code: string) { /* manual TTL check */ }
```

`CacheStore.getAll(loader)` dành cho list toàn bộ; `getItem(key, loader)` cho lookup theo key.

---

## CA-03 — Invalidate qua `onChanged`, không invalidate ngầm trong handler

```ts
// ✅ Đúng — tập trung
protected onChanged(): void {
  this.cache.invalidateAll();
}

// ❌ Sai — rải khắp các method, dễ bỏ sót
async createCategory(p: CategoryParam) {
  const r = await this.executor.addAsync(...);
  this.cache.invalidateAll();   // OK ở đây
  return r;
}
async bulkImport(...) {
  // quên invalidate → cache stale sau bulk import
}
```

`BaseService` đã gọi `onChanged()` sau mỗi `add` / `updateField` / `delete` thành công. Custom write method cũng phải gọi `this.onChanged()`.

---

## CA-04 — KHÔNG cache sensitive data

```ts
// ❌ Sai
private readonly userCache = new CacheStore<string, User>(...);   // chứa passwordHash, email PII

// ❌ Sai
private readonly tokenCache = new CacheStore<string, string>(...);  // JWT/refresh token

// ✅ Đúng — chỉ cache trường non-sensitive đã shape
private readonly userPublicCache = new CacheStore<string, UserPublicModel>(...);
// UserPublicModel = { id, displayName, avatarUrl }
```

Memory dump / heap snapshot có thể leak — đừng để password hash sống trong Map.

---

## CA-05 — `PermissionCache` invalidation phải gọi đúng lúc

`PermissionCache` TTL default 5 phút. Khi role permission thay đổi, gọi `invalidate(roleId)` để effect tức thời:

```ts
// ✅ Đúng — RoleService gọi invalidation sau khi update permissions
class RoleService extends BaseService<Role, RoleParam> {
  constructor(executor, permissions, private readonly permissionCache: PermissionCache, logger?) {
    super(executor, permissions, logger);
  }
  protected onChanged(): void {
    this.permissionCache.invalidateAll();  // role đổi → mọi cache permission stale
  }
}

// ✅ Đúng — invalidate cho 1 role cụ thể nếu biết
async updateRolePermissions(roleId: string, ...) {
  // ...
  this.permissionCache.invalidate(roleId);
}

// ❌ Sai — không invalidate → user mất 5 phút mới thấy permission mới
async updateRolePermissions(roleId: string, ...) {
  await prisma.rolePermission.deleteMany(...);
  await prisma.rolePermission.createMany(...);
  // không gọi permissionCache.invalidate
}
```

Trade-off: `invalidateAll` đơn giản nhưng mất hết hot cache; `invalidate(roleId)` precise nhưng cần biết role bị ảnh hưởng. Default an toàn = `invalidateAll`, optimize sau nếu thấy thrashing.

---

## CA-06 — Cache là optimization, không phải dependency

Code phải chạy đúng khi cache rỗng. Cache miss = đi xuống loader = vẫn đúng. KHÔNG để logic dựa vào "data nhất định trong cache":

```ts
// ❌ Sai — assume cache populated bởi background job
async hasPermission(roleId, ...) {
  const perms = this.cache.get(roleId);
  if (!perms) throw new Error('Cache not warmed');   // app chết khi restart
  return perms.has(...);
}

// ✅ Đúng — `PermissionCache` đã làm — lazy load on miss
async hasPermission(roleId, screenCode, action) {
  const perms = await this.getPermissions(roleId);   // load nếu cache miss
  return perms.has(`${screenCode}:${action}`);
}
```

Tương tự, không bao giờ "cache invalidation = xóa khỏi cache + KHÔNG reload" với logic "next request sẽ reload" — `getItem(key, loader)` đã làm exact điều đó.
