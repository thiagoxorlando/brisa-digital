import { NextRequest, NextResponse } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase";

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient(req, res);
  // Refreshes the session and writes updated auth cookies to the response,
  // so server components always receive a valid non-expired token.
  await supabase.auth.getUser();
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
