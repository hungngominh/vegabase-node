export interface ICacheStore<TKey, TModel> {
  getItem(key: TKey, loader: (key: TKey) => Promise<TModel | null>): Promise<TModel | null>;
  getAll(loader: () => Promise<TModel[]>): Promise<TModel[]>;
  invalidate(key: TKey): void;
  invalidateAll(): void;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number | null;
}

export class CacheStore<TKey, TModel> implements ICacheStore<TKey, TModel> {
  private readonly cache = new Map<TKey, CacheEntry<TModel>>();
  private allEntry: CacheEntry<TModel[]> | null = null;
  private readonly ttlMs: number | null;

  /** In-flight single-flight guards */
  private readonly inflight = new Map<TKey, Promise<TModel | null>>();
  private allInflight: Promise<TModel[]> | null = null;

  constructor(options: { ttlMs?: number } = {}) {
    this.ttlMs = options.ttlMs ?? null;
  }

  async getItem(key: TKey, loader: (key: TKey) => Promise<TModel | null>): Promise<TModel | null> {
    const entry = this.cache.get(key);
    if (entry && (entry.expiresAt === null || Date.now() < entry.expiresAt)) {
      return entry.data;
    }

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = loader(key)
      .then(data => {
        this.inflight.delete(key);
        if (data !== null) {
          this.cache.set(key, { data, expiresAt: this.ttlMs ? Date.now() + this.ttlMs : null });
        }
        return data;
      })
      .catch(err => {
        this.inflight.delete(key);
        throw err;
      });

    this.inflight.set(key, promise);
    return promise;
  }

  async getAll(loader: () => Promise<TModel[]>): Promise<TModel[]> {
    const entry = this.allEntry;
    if (entry && (entry.expiresAt === null || Date.now() < entry.expiresAt)) {
      return entry.data;
    }

    if (this.allInflight) return this.allInflight;

    this.allInflight = loader()
      .then(data => {
        this.allInflight = null;
        // Don't cache an empty result without a TTL — would permanently lock out future
        // reloads when the underlying table is later populated. Caller can still force
        // reload via invalidateAll() if needed.
        if (data.length === 0 && this.ttlMs === null) return data;
        this.allEntry = { data, expiresAt: this.ttlMs ? Date.now() + this.ttlMs : null };
        return data;
      })
      .catch(err => {
        this.allInflight = null;
        // Preserve stale snapshot so callers aren't left with empty data on transient failure
        if (this.allEntry) return this.allEntry.data;
        throw err;
      });

    return this.allInflight;
  }

  invalidate(key: TKey): void {
    this.cache.delete(key);
    // Does NOT reset allEntry — single-key invalidation must not force a full reload
  }

  invalidateAll(): void {
    this.cache.clear();
    this.allEntry = null;
  }
}
