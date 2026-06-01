/**
 * Edge middleware — runs before routing on every request.
 *
 * Primary job: prevent POST requests to /api/webhooks/* from being
 * caught by the www→non-www permanent redirect (308).
 * Stripe (and other webhook senders) do not follow redirects, so a
 * 308 on the webhook endpoint means events are never delivered.
 *
 * Strategy:
 *  - /api/webhooks/* on www host  → internal rewrite (no redirect sent)
 *  - /api/*              on www   → internal rewrite (APIs must never redirect)
 *  - Everything else     on www   → 308 to non-www canonical
 *
 * No authentication, no language handling — those stay in their own layers.
 */

import { NextRequest, NextResponse } from "next/server";

/** Paths that must NEVER receive a redirect response (POST callers can't follow). */
const API_PREFIX = "/api/";

export function middleware(request: NextRequest): NextResponse {
  const host = request.headers.get("host") ?? "";

  if (!host.startsWith("www.")) {
    // Already on canonical host — nothing to do.
    return NextResponse.next();
  }

  const canonicalHost = host.slice(4); // "www.brisahub.com.br" → "brisahub.com.br"
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(API_PREFIX)) {
    // API routes (including webhooks): rewrite, never redirect.
    // A rewrite forwards the request internally without telling the caller
    // about the host change, so POST bodies and headers are preserved.
    const url = request.nextUrl.clone();
    url.host = canonicalHost;
    return NextResponse.rewrite(url);
  }

  // All other paths: canonical redirect (308 is fine for browsers/crawlers).
  const url = request.nextUrl.clone();
  url.host = canonicalHost;
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Run on all paths except Next.js internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
