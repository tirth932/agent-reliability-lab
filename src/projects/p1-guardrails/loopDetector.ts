import { canonicalJson } from "@/core/canonical";

export class LoopDetector {
  private readonly counts = new Map<string, number>();

  constructor(private readonly limit = 3) {
    if (limit < 2) throw new Error("Loop repeat limit must be at least 2");
  }

  /** Records this call. Returns true when it is the Nth identical call. */
  observe(name: string, args: unknown): boolean {
    const key = `${name}:${canonicalJson(args)}`;
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next >= this.limit;
  }

  count(name: string, args: unknown): number {
    return this.counts.get(`${name}:${canonicalJson(args)}`) ?? 0;
  }
}
