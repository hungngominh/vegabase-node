interface CacheEntry {
  permissions: Set<string>;
  expiresAt: number;
}

export interface PermissionCacheOptions {
  ttlMs?: number;
  onInvalidate?: (roleId: string) => void;
}

export class PermissionCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly onInvalidate?: (roleId: string) => void;

  constructor(
    private readonly loader: (roleId: string) => Promise<string[]>,
    options: PermissionCacheOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? 300_000;
    this.onInvalidate = options.onInvalidate;
  }

  async hasPermission(roleId: string, screenCode: string, action: string): Promise<boolean> {
    const perms = await this.getPermissions(roleId);
    return perms.has(`${screenCode}:${action}`);
  }

  invalidate(roleId: string): void {
    this.cache.delete(roleId);
    this.onInvalidate?.(roleId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  private async getPermissions(roleId: string): Promise<Set<string>> {
    const entry = this.cache.get(roleId);
    if (entry && Date.now() < entry.expiresAt) {
      return entry.permissions;
    }
    const perms = await this.loader(roleId);
    const set = new Set(perms);
    this.cache.set(roleId, { permissions: set, expiresAt: Date.now() + this.ttlMs });
    return set;
  }
}
