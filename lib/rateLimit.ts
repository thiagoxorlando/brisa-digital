import { NextRequest, NextResponse } from "next/server";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
  message?: string;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const RATE_LIMIT_STORE_KEY = "__brisahubRateLimitStore";

function getRateLimitStore(): Map<string, RateLimitEntry> {
  const globalState = globalThis as typeof globalThis & {
    __brisahubRateLimitStore?: Map<string, RateLimitEntry>;
  };

  if (!globalState[RATE_LIMIT_STORE_KEY]) {
    globalState[RATE_LIMIT_STORE_KEY] = new Map<string, RateLimitEntry>();
  }

  return globalState[RATE_LIMIT_STORE_KEY];
}

function pruneExpiredEntries(store: Map<string, RateLimitEntry>, now: number) {
  if (store.size < 500) return;

  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function getRequestIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function buildRateLimitKey(scope: string, ...parts: Array<string | null | undefined>): string {
  const normalizedParts = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return [scope, ...normalizedParts].join(":");
}

export function checkRateLimit({
  key,
  limit,
  windowMs,
  message = "Too many requests. Please try again later.",
}: RateLimitOptions): NextResponse | null {
  const now = Date.now();
  const store = getRateLimitStore();

  pruneExpiredEntries(store, now);

  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (current.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return NextResponse.json(
      { error: message },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
        },
      },
    );
  }

  current.count += 1;
  store.set(key, current);
  return null;
}
