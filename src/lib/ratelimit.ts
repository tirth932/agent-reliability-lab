import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 10;
const hits = new Map<string, number[]>();

let upstash: Ratelimit | null = null;

function memoryLimit(ip: string): { ok: boolean; remaining: number } {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(ip, recent);
    return { ok: false, remaining: 0 };
  }
  recent.push(now);
  hits.set(ip, recent);
  return { ok: true, remaining: LIMIT - recent.length };
}

export async function rateLimit(ip: string): Promise<{ ok: boolean; remaining: number }> {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (!upstash) {
      upstash = new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(LIMIT, "1 h"),
        prefix: "agent-reliability-lab",
      });
    }
    const result = await upstash.limit(ip);
    return { ok: result.success, remaining: result.remaining };
  }
  return memoryLimit(ip);
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "local";
  return request.headers.get("x-real-ip") ?? "local";
}
