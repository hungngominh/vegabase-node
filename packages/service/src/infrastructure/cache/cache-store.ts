interface CacheEntry<T> {
  data: T;
  expiresAt: number | null;
}

export class CacheStore<TKey, TModel> {
  private readonly cache = new Map<TKey, CacheEntry<TModel>>();
  private allEntry: CacheEntry<TModel[]> | null = null;
  private readonly ttlMs: number | null;

  constructor(options: { ttlMs?: number } = {}) {
    this.ttlMs = options.ttlMs ?? null;
  }

  async getItem(key: TKey, loader: (key: TKey) => Promise<TModel | null>): Promise<TModel | null> {
    const entry = this.cache.get(key);
    if (entry && (entry.expiresAt === null || Date.now() < entry.expiresAt)) {
      return entry.data;
    }
    const data = await loader(key);
    if (data !== null) {
      this.cache.set(key, { data, expiresAt: this.ttlMs ? Date.now() + this.ttlMs : null });
    }
    return data;
  }

  async getAll(loader: () => Promise<TModel[]>): Promise<TModel[]> {
    if (this.allEntry && (this.allEntry.expiresAt === null || Date.now() < this.allEntry.expiresAt)) {
      return this.allEntry.data;
    }
    const data = await loader();
    this.allEntry = { data, expiresAt: this.ttlMs ? Date.now() + this.ttlMs : null };
    return data;
  }

  invalidate(key: TKey): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
    this.allEntry = null;
  }
}
