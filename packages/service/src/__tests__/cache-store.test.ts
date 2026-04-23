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
});
