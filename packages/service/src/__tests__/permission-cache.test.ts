import { describe, it, expect, vi } from 'vitest';
import { PermissionCache } from '../infrastructure/cache/permission-cache';

describe('PermissionCache', () => {
  it('hasPermission_roleHasPermission_returnsTrue', async () => {
    const loader = vi.fn().mockResolvedValue(['USERS:READ', 'USERS:CREATE']);
    const cache = new PermissionCache(loader);

    const result = await cache.hasPermission('admin', 'USERS', 'READ');

    expect(result).toBe(true);
  });

  it('hasPermission_roleMissingPermission_returnsFalse', async () => {
    const loader = vi.fn().mockResolvedValue(['USERS:READ']);
    const cache = new PermissionCache(loader);

    const result = await cache.hasPermission('viewer', 'USERS', 'DELETE');

    expect(result).toBe(false);
  });

  it('hasPermission_calledTwice_loaderCalledOnce', async () => {
    const loader = vi.fn().mockResolvedValue(['USERS:READ']);
    const cache = new PermissionCache(loader);
    await cache.hasPermission('admin', 'USERS', 'READ');

    await cache.hasPermission('admin', 'USERS', 'READ');

    expect(loader).toHaveBeenCalledOnce();
  });

  it('invalidate_clearsRole_loaderCalledAgain', async () => {
    const loader = vi.fn().mockResolvedValue(['USERS:READ']);
    const cache = new PermissionCache(loader);
    await cache.hasPermission('admin', 'USERS', 'READ');
    cache.invalidate('admin');

    await cache.hasPermission('admin', 'USERS', 'READ');

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('invalidate_callsOnInvalidateCallback', async () => {
    const onInvalidate = vi.fn();
    const cache = new PermissionCache(async () => [], { onInvalidate });

    cache.invalidate('role-1');

    expect(onInvalidate).toHaveBeenCalledWith('role-1');
  });
});
