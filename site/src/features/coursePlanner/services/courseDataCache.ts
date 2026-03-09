type CacheEntry<T> = {
  value: Promise<T>;
  updatedAt: number;
};

export class CourseDataCache<T> {
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly cache = new Map<string, CacheEntry<T>>();

  constructor(maxEntries = 20, ttlMs = 5 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  getOrSet(key: string, fetcher: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const existing = this.cache.get(key);

    if (existing && now - existing.updatedAt < this.ttlMs) {
      this.cache.delete(key);
      this.cache.set(key, existing);
      return existing.value;
    }

    const value = fetcher().catch((error) => {
      this.cache.delete(key);
      throw error;
    });

    this.cache.set(key, { value, updatedAt: now });

    if (this.cache.size > this.maxEntries) {
      const first = this.cache.keys().next().value;
      if (first) this.cache.delete(first);
    }

    return value;
  }

  getUpdatedAt(key: string): number | undefined {
    const existing = this.cache.get(key);
    if (!existing) return undefined;
    return existing.updatedAt;
  }

  clear(): void {
    this.cache.clear();
  }
}
