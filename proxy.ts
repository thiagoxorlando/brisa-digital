import { NextRequest, NextResponse } from "next/server";

// Per Next.js 16 docs: proxy should only do optimistic cookie reads, not
// network calls. Full session verification happens in each layout server
// component via createSessionClient(). A network call here (getUser()) would
// run on every request and can corrupt the forwarded session cookies when
// @supabase/ssr decides to clear an unverifiable token before layouts run.
export function proxy(req: NextRequest) {
  return NextResponse.next({ request: req });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
