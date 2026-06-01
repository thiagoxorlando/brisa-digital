import { NextRequest, NextResponse } from "next/server";

// Per Next.js 16 docs: proxy should only do optimistic cookie reads, not
// network calls. Full session verification happens in each layout server
// component via createSessionClient(). A network call here (getUser()) would
// run on every request and can corrupt the forwarded session cookies when
// @supabase/ssr decides to clear an unverifiable token before layouts run.
export function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";

  // ── www → non-www handling ────────────────────────────────────────────────
  // Stripe (and other webhook senders) do not follow HTTP redirects.
  // If the Host header is www.*, API routes must be REWRITTEN (not redirected)
  // so POST bodies and Stripe-Signature headers reach the handler intact.
  if (host.startsWith("www.")) {
    const canonicalHost = host.slice(4); // "www.brisahub.com.br" → "brisahub.com.br"
    const { pathname } = req.nextUrl;

    if (pathname.startsWith("/api/")) {
      // Internal rewrite: no redirect response sent to caller, body preserved.
      const url = req.nextUrl.clone();
      url.host = canonicalHost;
      return NextResponse.rewrite(url);
    }

    // Non-API paths: canonical redirect is safe for browsers and crawlers.
    const url = req.nextUrl.clone();
    url.host = canonicalHost;
    return NextResponse.redirect(url, 308);
  }

  // ── Pass pathname to server layouts via header ────────────────────────────
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
