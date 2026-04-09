import type { Metadata } from "next";
import AdminTrash, { type TrashItem } from "@/features/admin/AdminTrash";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Trash — Brisa Digital" };

export default async function AdminTrashPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const [jobs, bookings, contracts, talent, agencies] = await Promise.all([
    supabase.from("jobs").select("id, title, created_at, deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    supabase.from("bookings").select("id, job_title, status, created_at, deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    supabase.from("contracts").select("id, payment_amount, status, created_at, deleted_at, talent_id, agency_id").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    supabase.from("talent_profiles").select("id, full_name, deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    supabase.from("agencies").select("id, company_name, deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
  ]);

  // Resolve names for contracts
  const contractRows = contracts.data ?? [];
  const talentIds  = [...new Set(contractRows.map((c) => c.talent_id).filter(Boolean))] as string[];
  const agencyIds  = [...new Set(contractRows.map((c) => c.agency_id).filter(Boolean))] as string[];

  const [talentRes, agencyRes] = await Promise.all([
    talentIds.length ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds) : Promise.resolve({ data: [] }),
    agencyIds.length ? supabase.from("agencies").select("id, company_name").in("id", agencyIds)     : Promise.resolve({ data: [] }),
  ]);

  function usd(n: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  }

  const talentMap = new Map<string, string>((talentRes.data ?? []).map((t: any) => [t.id, t.full_name ?? ""]));
  const agencyMap = new Map<string, string>((agencyRes.data ?? []).map((a: any) => [a.id, a.company_name ?? ""]));

  const items: TrashItem[] = [
    ...(jobs.data ?? []).map((j) => ({
      id:        j.id,
      table:     "jobs" as const,
      label:     j.title ?? "Untitled Job",
      detail:    "",
      deletedAt: j.deleted_at ?? "",
    })),
    ...(bookings.data ?? []).map((b) => ({
      id:        b.id,
      table:     "bookings" as const,
      label:     b.job_title ?? "Booking",
      detail:    b.status ?? "",
      deletedAt: b.deleted_at ?? "",
    })),
    ...contractRows.map((c) => ({
      id:        c.id,
      table:     "contracts" as const,
      label:     [
        c.talent_id ? talentMap.get(c.talent_id) : null,
        c.agency_id ? agencyMap.get(c.agency_id) : null,
      ].filter(Boolean).join(" ↔ ") || "Contract",
      detail:    c.payment_amount ? usd(Number(c.payment_amount)) : "",
      deletedAt: c.deleted_at ?? "",
    })),
    ...(talent.data ?? []).map((t) => ({
      id:        t.id,
      table:     "talent_profiles" as const,
      label:     t.full_name ?? "Unknown Talent",
      detail:    "",
      deletedAt: t.deleted_at ?? "",
    })),
    ...(agencies.data ?? []).map((a) => ({
      id:        a.id,
      table:     "agencies" as const,
      label:     a.company_name ?? "Unknown Agency",
      detail:    "",
      deletedAt: a.deleted_at ?? "",
    })),
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  return <AdminTrash items={items} />;
}
