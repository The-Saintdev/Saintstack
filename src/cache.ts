// In-Memory Edge Cache for Cloudflare Workers
// Dramatically reduces latency by serving repeated reads from warm isolate memory (< 5ms)

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class EdgeCache {
  private store = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number = 60): void {
    // Keep map bounded to prevent memory growth
    if (this.store.size > 500) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.store.clear();
      return;
    }

    for (const key of this.store.keys()) {
      if (key.includes(pattern)) {
        this.store.delete(key);
      }
    }
  }
}

export const memoryCache = new EdgeCache();
