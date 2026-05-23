import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";

export type ContractSearchResult = {
  id: string;
  shortId: string;
  jobTitle: string | null;
  agencyName: string | null;
  talentName: string | null;
  workspaceId: string | null;
  status: string;
  paymentAmount: number;
  createdAt: string | null;
};

const SELECT =
  "id, job_id, agency_id, talent_id, workspace_id, status, payment_amount, created_at";

type ContractRaw = {
  id: string;
  job_id: string | null;
  agency_id: string | null;
  talent_id: string | null;
  workspace_id: string | null;
  status: string | null;
  payment_amount: number | null;
  created_at: string | null;
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const supabase = createServerClient({ useServiceRole: true });
  const MAX = 8;

  // Parallel text searches across name fields
  const [talentRes, agencyRes, jobRes] = await Promise.all([
    supabase.from("talent_profiles").select("id").ilike("full_name", `%${q}%`).limit(20),
    supabase.from("agencies").select("user_id").ilike("company_name", `%${q}%`).limit(20),
    supabase.from("jobs").select("id").ilike("title", `%${q}%`).limit(20),
  ]);

  const talentIds = (talentRes.data ?? []).map((t) => t.id);
  const agencyUserIds = (agencyRes.data ?? [])
    .map((a) => a.user_id)
    .filter((id): id is string => !!id);
  const jobIds = (jobRes.data ?? []).map((j) => j.id);

  const accumulated: ContractRaw[] = [];

  // UUID/ID prefix search (only when query looks like a hex fragment)
  if (/^[0-9a-f-]{2,36}$/i.test(q)) {
    try {
      const { data } = await supabase
        .from("contracts")
        .select(SELECT)
        .filter("id::text", "ilike", `${q}%`)
        .limit(5);
      for (const c of (data ?? []) as ContractRaw[]) accumulated.push(c);
    } catch {
      // PostgREST version may not support cast filter — silently skip
    }
  }

  // Contract queries by each dimension in parallel
  const [byTalent, byAgency, byJob] = await Promise.all([
    talentIds.length
      ? supabase.from("contracts").select(SELECT).in("talent_id", talentIds).limit(MAX)
      : { data: [] as ContractRaw[] },
    agencyUserIds.length
      ? supabase.from("contracts").select(SELECT).in("agency_id", agencyUserIds).limit(MAX)
      : { data: [] as ContractRaw[] },
    jobIds.length
      ? supabase.from("contracts").select(SELECT).in("job_id", jobIds).limit(MAX)
      : { data: [] as ContractRaw[] },
  ]);

  for (const r of [byTalent, byAgency, byJob]) {
    for (const c of (r.data ?? []) as ContractRaw[]) accumulated.push(c);
  }

  // Deduplicate (ID-prefix matches come first)
  const seen = new Set<string>();
  const unique: ContractRaw[] = [];
  for (const c of accumulated) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      unique.push(c);
    }
    if (unique.length >= MAX) break;
  }

  if (unique.length === 0) return NextResponse.json({ results: [] });

  // Resolve display names in parallel
  const jIds = [...new Set(unique.map((c) => c.job_id).filter((id): id is string => !!id))];
  const aIds = [...new Set(unique.map((c) => c.agency_id).filter((id): id is string => !!id))];
  const tIds = [...new Set(unique.map((c) => c.talent_id).filter((id): id is string => !!id))];

  const [jRes, aRes, tRes] = await Promise.all([
    jIds.length ? supabase.from("jobs").select("id, title").in("id", jIds) : { data: [] },
    aIds.length
      ? supabase.from("agencies").select("user_id, company_name").in("user_id", aIds)
      : { data: [] },
    tIds.length
      ? supabase.from("talent_profiles").select("id, full_name").in("id", tIds)
      : { data: [] },
  ]);

  const jobTitleMap = new Map(
    (jRes.data ?? []).map((j) => [j.id, j.title ?? "Vaga sem título"]),
  );
  const agencyNameMap = new Map(
    (aRes.data ?? []).map((a) => [a.user_id, a.company_name ?? "Agência"]),
  );
  const talentNameMap = new Map(
    (tRes.data ?? []).map((t) => [t.id, t.full_name ?? "Talento"]),
  );

  const results: ContractSearchResult[] = unique.map((c) => ({
    id: c.id,
    shortId: c.id.slice(0, 8),
    jobTitle: c.job_id ? (jobTitleMap.get(c.job_id) ?? null) : null,
    agencyName: c.agency_id ? (agencyNameMap.get(c.agency_id) ?? null) : null,
    talentName: c.talent_id ? (talentNameMap.get(c.talent_id) ?? null) : null,
    workspaceId: c.workspace_id ?? null,
    status: c.status ?? "unknown",
    paymentAmount: c.payment_amount ?? 0,
    createdAt: c.created_at ?? null,
  }));

  return NextResponse.json({ results });
}
