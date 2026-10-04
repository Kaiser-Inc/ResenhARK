export class RateLimiter {
  // ponytail: in-memory per process; Redis counters for multiple API instances.
  private readonly hits = new Map<string, number[]>();
  private lastSweep = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now: number): boolean {
    this.sweep(now);
    const recent = (this.hits.get(key) ?? []).filter((at) => at > now - this.windowMs);
    const allowed = recent.length < this.limit;
    if (allowed) recent.push(now);
    this.hits.set(key, recent);
    return allowed;
  }

  /** Number of keys currently tracked. */
  size(): number {
    return this.hits.size;
  }

  // Once per window, drop keys with no hit inside it so the map stays bounded by active members.
  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, times] of this.hits) {
      if (times.every((at) => at <= now - this.windowMs)) this.hits.delete(key);
    }
  }
}
