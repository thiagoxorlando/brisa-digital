/**
 * Resolves a user ID to a human-readable display name for "paid by" attribution.
 *
 * Priority chain:
 * 1. profiles.role = 'admin'  → "Admin"
 * 2. agencies.company_name WHERE agencies.user_id = actorId
 * 3. talent_profiles.full_name WHERE talent_profiles.user_id = actorId
 * 4. auth email via supabase.auth.admin.getUserById
 * 5. "—"  (legacy / unresolvable)
 */

import { createServerClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveActorName(
  actorId: string | null | undefined,
  supabase?: SupabaseClient,
): Promise<string | null> {
  if (!actorId) return null;

  const client = supabase ?? createServerClient({ useServiceRole: true });

  const [profileRes, agencyRes, talentRes] = await Promise.all([
    client.from("profiles").select("role, full_name").eq("id", actorId).maybeSingle(),
    client.from("agencies").select("company_name").eq("user_id", actorId).maybeSingle(),
    client.from("talent_profiles").select("full_name").eq("user_id", actorId).maybeSingle(),
  ]);

  if (profileRes.data?.role === "admin") {
    return "Admin";
  }

  if (agencyRes.data?.company_name) {
    return agencyRes.data.company_name;
  }

  if (talentRes.data?.full_name) {
    return talentRes.data.full_name;
  }

  // Last resort: auth email
  const { data: authUser } = await client.auth.admin.getUserById(actorId);
  const email = authUser?.user?.email;
  if (email) return email;

  return null;
}

/**
 * Batch-resolves actor names for a list of user IDs.
 * Returns a Map<userId, displayName | null>.
 */
export async function resolveActorNames(
  actorIds: string[],
  supabase?: SupabaseClient,
): Promise<Map<string, string | null>> {
  const uniqueIds = [...new Set(actorIds.filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const client = supabase ?? createServerClient({ useServiceRole: true });

  const [profilesRes, agenciesRes, talentsRes] = await Promise.all([
    client.from("profiles").select("id, role, full_name").in("id", uniqueIds),
    client.from("agencies").select("user_id, company_name").in("user_id", uniqueIds),
    client.from("talent_profiles").select("user_id, full_name").in("user_id", uniqueIds),
  ]);

  const profileMap = new Map<string, { role: string | null; full_name: string | null }>();
  for (const p of (profilesRes.data ?? []) as Array<{ id: string; role?: string | null; full_name?: string | null }>) {
    profileMap.set(p.id, { role: p.role ?? null, full_name: p.full_name ?? null });
  }

  const agencyMap = new Map<string, string>();
  for (const a of (agenciesRes.data ?? []) as Array<{ user_id?: string | null; company_name?: string | null }>) {
    if (a.user_id && a.company_name) agencyMap.set(a.user_id, a.company_name);
  }

  const talentMap = new Map<string, string>();
  for (const t of (talentsRes.data ?? []) as Array<{ user_id?: string | null; full_name?: string | null }>) {
    if (t.user_id && t.full_name) talentMap.set(t.user_id, t.full_name);
  }

  const result = new Map<string, string | null>();

  for (const uid of uniqueIds) {
    const profile = profileMap.get(uid);

    if (profile?.role === "admin") {
      result.set(uid, "Admin");
      continue;
    }

    const agencyName = agencyMap.get(uid);
    if (agencyName) {
      result.set(uid, agencyName);
      continue;
    }

    const talentName = talentMap.get(uid);
    if (talentName) {
      result.set(uid, talentName);
      continue;
    }

    // Fall back to auth email for unresolved IDs
    const { data: authUser } = await client.auth.admin.getUserById(uid);
    result.set(uid, authUser?.user?.email ?? null);
  }

  return result;
}
