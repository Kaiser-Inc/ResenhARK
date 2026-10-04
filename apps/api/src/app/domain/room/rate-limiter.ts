export class RateLimiter {
  // ponytail: in-memory per process, entries are never evicted (a few timestamps per member); Redis counters for multiple API instances.
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((at) => at > now - this.windowMs);
    const allowed = recent.length < this.limit;
    if (allowed) recent.push(now);
    this.hits.set(key, recent);
    return allowed;
  }
}
