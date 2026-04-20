import { supabase } from "@/lib/supabase";

/**
 * Determines where an agency user should land after login.
 * - Has paid bookings → /agency/talent-history (rehire-first UX)
 * - Has any jobs      → /agency/dashboard      (active agency, no paid jobs yet)
 * - Neither           → /agency/first-job      (first login only)
 */
export async function getAgencyLanding(userId?: string): Promise<string> {
  const id =
    userId ?? (await supabase.auth.getUser()).data.user?.id;

  if (!id) return "/agency/first-job";

  const [{ count: paidCount }, { count: jobCount }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", id)
      .eq("status", "paid"),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", id),
  ]);

  if (paidCount && paidCount > 0) return "/agency/talent-history";
  if (jobCount  && jobCount  > 0) return "/agency/dashboard";
  return "/agency/first-job";
}
