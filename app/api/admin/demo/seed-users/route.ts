/**
 * POST /api/admin/demo/seed-users
 *
 * Creates the 25 demo accounts via GoTrue's admin HTTP API.
 * This is the only reliable way to create users with:
 *   - specific UUIDs (so existing profile/agency/talent data stays valid)
 *   - proper auth.identities rows (so login works)
 *   - email confirmed (so no verification email needed)
 *
 * Safe to call multiple times — existing users are skipped.
 * Requires: admin session.
 *
 * After calling this endpoint, the demo accounts are fully functional.
 * No need to rerun SQL scripts 02–06.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";

const DEMO_PASSWORD = "Demo@BrisaHub2026";

const DEMO_USERS = [
  // ── Agencies ────────────────────────────────────────────
  { id: "a0000001-0000-4000-8000-000000000001", email: "wave@brisahub.demo",        name: "Wave Creative Agency" },
  { id: "a0000001-0000-4000-8000-000000000002", email: "bluehorizon@brisahub.demo", name: "Blue Horizon Casting" },
  { id: "a0000001-0000-4000-8000-000000000003", email: "prime@brisahub.demo",       name: "Prime Talent Group" },
  { id: "a0000001-0000-4000-8000-000000000004", email: "lighthouse@brisahub.demo",  name: "Lighthouse Media" },
  { id: "a0000001-0000-4000-8000-000000000005", email: "urban@brisahub.demo",       name: "Urban Vision Studios" },
  // ── Talents ─────────────────────────────────────────────
  { id: "b0000002-0000-4000-8000-000000000001", email: "isabella.f@brisahub.demo",  name: "Isabella Ferreira" },
  { id: "b0000002-0000-4000-8000-000000000002", email: "lucas.m@brisahub.demo",     name: "Lucas Mendes" },
  { id: "b0000002-0000-4000-8000-000000000003", email: "camila.s@brisahub.demo",    name: "Camila Souza" },
  { id: "b0000002-0000-4000-8000-000000000004", email: "rafael.c@brisahub.demo",    name: "Rafael Costa" },
  { id: "b0000002-0000-4000-8000-000000000005", email: "ana.p@brisahub.demo",       name: "Ana Paula Lima" },
  { id: "b0000002-0000-4000-8000-000000000006", email: "thiago.r@brisahub.demo",    name: "Thiago Rocha" },
  { id: "b0000002-0000-4000-8000-000000000007", email: "julia.n@brisahub.demo",     name: "Júlia Nunes" },
  { id: "b0000002-0000-4000-8000-000000000008", email: "pedro.a@brisahub.demo",     name: "Pedro Alves" },
  { id: "b0000002-0000-4000-8000-000000000009", email: "mariana.g@brisahub.demo",   name: "Mariana Gomes" },
  { id: "b0000002-0000-4000-8000-000000000010", email: "bruno.t@brisahub.demo",     name: "Bruno Torres" },
  { id: "b0000002-0000-4000-8000-000000000011", email: "beatriz.m@brisahub.demo",   name: "Beatriz Martins" },
  { id: "b0000002-0000-4000-8000-000000000012", email: "gabriel.o@brisahub.demo",   name: "Gabriel Oliveira" },
  { id: "b0000002-0000-4000-8000-000000000013", email: "larissa.b@brisahub.demo",   name: "Larissa Barbosa" },
  { id: "b0000002-0000-4000-8000-000000000014", email: "diego.v@brisahub.demo",     name: "Diego Vieira" },
  { id: "b0000002-0000-4000-8000-000000000015", email: "natalia.f@brisahub.demo",   name: "Natália Freitas" },
  { id: "b0000002-0000-4000-8000-000000000016", email: "victor.l@brisahub.demo",    name: "Victor Lima" },
  { id: "b0000002-0000-4000-8000-000000000017", email: "fernanda.c@brisahub.demo",  name: "Fernanda Castro" },
  { id: "b0000002-0000-4000-8000-000000000018", email: "mateus.r@brisahub.demo",    name: "Mateus Ribeiro" },
  { id: "b0000002-0000-4000-8000-000000000019", email: "carolina.s@brisahub.demo",  name: "Carolina Santos" },
  { id: "b0000002-0000-4000-8000-000000000020", email: "henrique.d@brisahub.demo",  name: "Henrique Dias" },
] as const;

export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabaseUrl      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const adminApiBase     = `${supabaseUrl}/auth/v1/admin/users`;

  const results: {
    email: string;
    status: "created" | "already_exists" | "error";
    error?: string;
  }[] = [];

  for (const u of DEMO_USERS) {
    // First check if the user already exists via the admin API
    const checkRes = await fetch(`${adminApiBase}/${u.id}`, {
      headers: {
        apikey:          serviceRoleKey,
        Authorization:   `Bearer ${serviceRoleKey}`,
      },
    });

    if (checkRes.ok) {
      results.push({ email: u.email, status: "already_exists" });
      continue;
    }

    // Create via GoTrue admin API — this populates auth.users + auth.identities
    // correctly so that login works. The `id` field forces our specific UUID.
    const createRes = await fetch(adminApiBase, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        apikey:          serviceRoleKey,
        Authorization:   `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        id:             u.id,
        email:          u.email,
        password:       DEMO_PASSWORD,
        email_confirm:  true,
        user_metadata:  { full_name: u.name },
        app_metadata:   { provider: "email", providers: ["email"] },
      }),
    });

    const body = await createRes.json().catch(() => ({})) as { message?: string };

    if (createRes.ok) {
      results.push({ email: u.email, status: "created" });
    } else {
      results.push({
        email:  u.email,
        status: "error",
        error:  body.message ?? `HTTP ${createRes.status}`,
      });
    }
  }

  const created  = results.filter((r) => r.status === "created").length;
  const existing = results.filter((r) => r.status === "already_exists").length;
  const errors   = results.filter((r) => r.status === "error");

  return NextResponse.json({
    ok:      errors.length === 0,
    created,
    existing,
    errors,
    message: `${created} created, ${existing} already existed${errors.length ? `, ${errors.length} errors` : ""}.`,
    results,
  });
}
