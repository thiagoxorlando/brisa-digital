import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createMiddlewareClient } from "@/lib/supabase";
import type { UserRole } from "@/lib/auth";

// Which path prefixes each role is allowed to access
const ROLE_ALLOWED: Record<UserRole, string[]> = {
  agency: ["/agency"],
  talent: ["/talent"],
  admin:  ["/agency", "/talent", "/admin"],
};

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient(req, res);
  const { pathname } = req.nextUrl;

  // Refresh session cookie on every request
  const { data: { user } } = await supabase.auth.getUser();

  const isProtected =
    pathname.startsWith("/agency") ||
    pathname.startsWith("/talent") ||
    pathname.startsWith("/admin");

  // Not a protected route — let through
  if (!isProtected) return res;

  // No session → send to login
  if (!user) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Fetch role using service role to bypass any RLS on the profiles table
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role as UserRole | undefined;

  // No role found — send to onboarding
  if (!role) return NextResponse.redirect(new URL("/onboarding/role", req.url));

  // Wrong role for this path — redirect to their home
  const allowed = ROLE_ALLOWED[role] ?? [];
  const hasAccess = allowed.some((prefix) => pathname.startsWith(prefix));
  if (!hasAccess) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/agency/:path*", "/talent/:path*", "/admin/:path*"],
};
