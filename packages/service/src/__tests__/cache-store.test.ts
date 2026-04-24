import { describe, it, expect, vi } from 'vitest';
import { CacheStore } from '../infrastructure/cache/cache-store';

describe('CacheStore', () => {
  it('getItem_cacheMiss_callsLoader', async () => {
    const store = new CacheStore<string, string>();
    const loader = vi.fn().mockResolvedValue('value');

    const result = await store.getItem('key', loader);

    expect(loader).toHaveBeenCalledWith('key');
    expect(result).toBe('value');
  });

  it('getItem_cacheHit_doesNotCallLoader', async () => {
    const store = new CacheStore<string, string>();
    const loader = vi.fn().mockResolvedValue('value');
    await store.getItem('key', loader);

    await store.getItem('key', loader);

    expect(loader).toHaveBeenCalledOnce();
  });

  it('invalidate_removesEntry_loaderCalledAgain', async () => {
    const store = new CacheStore<string, string>();
    const loader = vi.fn().mockResolvedValue('value');
    await store.getItem('key', loader);
    store.invalidate('key');

    await store.getItem('key', loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('getAll_cacheMiss_callsLoader', async () => {
    const store = new CacheStore<string, string>();
    const loader = vi.fn().mockResolvedValue(['a', 'b']);

    const result = await store.getAll(loader);

    expect(result).toEqual(['a', 'b']);
    expect(loader).toHaveBeenCalledOnce();
  });

  it('getAll_cacheHit_doesNotCallLoader', async () => {
    const store = new CacheStore<string, string>();
    const loader = vi.fn().mockResolvedValue(['a']);
    await store.getAll(loader);

    await store.getAll(loader);

    expect(loader).toHaveBeenCalledOnce();
  });

  it('invalidateAll_clearsItemAndAllCache', async () => {
    const store = new CacheStore<string, string>();
    const itemLoader = vi.fn().mockResolvedValue('v');
    const allLoader = vi.fn().mockResolvedValue(['v']);
    await store.getItem('k', itemLoader);
    await store.getAll(allLoader);
    store.invalidateAll();

    await store.getItem('k', itemLoader);
    await store.getAll(allLoader);

    expect(itemLoader).toHaveBeenCalledTimes(2);
    expect(allLoader).toHaveBeenCalledTimes(2);
  });

  it('invalidate_singleKey_doesNotClearAllEntry', async () => {
    const store = new CacheStore<string, string>();
    const allLoader = vi.fn().mockResolvedValue(['a', 'b']);
    await store.getAll(allLoader);
    store.invalidate('a');

    await store.getAll(allLoader);

    expect(allLoader).toHaveBeenCalledOnce();
  });

  it('getAll_loaderFailure_preservesStalSnapshot', async () => {
    const store = new CacheStore<string, string>({ ttlMs: 1 });
    const allLoader = vi.fn().mockResolvedValue(['stale']);
    await store.getAll(allLoader);

    await new Promise(r => setTimeout(r, 5));
    allLoader.mockRejectedValueOnce(new Error('network error'));

    const result = await store.getAll(allLoader);

    expect(result).toEqual(['stale']);
  });

  it('getItem_concurrentRequests_loaderCalledOnce', async () => {
    const store = new CacheStore<string, string>();
    let resolve!: (v: string) => void;
    const loader = vi.fn().mockReturnValue(new Promise<string>(r => { resolve = r; }));

    const [r1, r2] = await Promise.all([
      (async () => { const p = store.getItem('k', loader); resolve('v'); return p; })(),
      store.getItem('k', loader),
    ]);

    expect(loader).toHaveBeenCalledOnce();
    expect(r1).toBe('v');
    expect(r2).toBe('v');
  });
});
