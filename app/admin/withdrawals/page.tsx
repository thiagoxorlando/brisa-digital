import type { Metadata } from "next";
import AdminWithdrawals, { type AdminWithdrawalRow } from "@/features/admin/AdminWithdrawals";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Administração — Saques — BrisaHub" };

export default async function AdminWithdrawalsPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: withdrawalTxs } = await supabase
    .from("wallet_transactions")
    .select("id, user_id, amount, fee_amount, net_amount, status, processed_at, admin_note, provider, provider_transfer_id, provider_status, created_at")
    .eq("type", "withdrawal")
    .order("created_at", { ascending: false });

  const txRows       = withdrawalTxs ?? [];
  const userIds      = [...new Set(txRows.map((t) => t.user_id).filter(Boolean))] as string[];

  const roleMap          = new Map<string, string>();
  const talentNameMap    = new Map<string, string>();
  const talentPixMap     = new Map<string, { pix_key_type: string | null; pix_key_value: string | null; pix_holder_name: string | null }>();
  const agencyNameMap    = new Map<string, string>();
  const agencyPixMap     = new Map<string, { pix_key_type: string | null; pix_key_value: string | null; pix_holder_name: string | null }>();

  if (userIds.length) {
    const [authUsersRes, profilesRes] = await Promise.all([
      // TODO: paginate auth users for platforms with >1000 users
      supabase.auth.admin.listUsers({ perPage: 1000 }),
      supabase.from("profiles").select("id").is("deleted_at", null),
    ]);
    const validUserIds    = new Set((authUsersRes.data?.users ?? []).map((u) => u.id));
    const validProfileIds = new Set((profilesRes.data ?? []).map((p) => p.id));

    await Promise.all([
      supabase.from("profiles").select("id, role").in("id", userIds).then(({ data }) => {
        for (const p of data ?? []) roleMap.set(p.id, p.role ?? "unknown");
      }),
      supabase
        .from("talent_profiles")
        .select("id, full_name, pix_key_type, pix_key_value, pix_holder_name")
        .in("id", userIds)
        .then(({ data }) => {
          for (const t of data ?? []) {
            talentNameMap.set(t.id, t.full_name ?? "Talento sem nome");
            talentPixMap.set(t.id, {
              pix_key_type:   (t as Record<string, unknown>).pix_key_type   as string | null ?? null,
              pix_key_value:  (t as Record<string, unknown>).pix_key_value  as string | null ?? null,
              pix_holder_name:(t as Record<string, unknown>).pix_holder_name as string | null ?? null,
            });
          }
        }),
      supabase
        .from("agencies")
        .select("id, user_id, company_name, pix_key_type, pix_key_value, pix_holder_name")
        .in("id", userIds)
        .is("deleted_at", null)
        .then(({ data }) => {
          for (const a of data ?? []) {
            const ownerId  = (a as { user_id?: string | null }).user_id ?? a.id;
            const isOrphan = !ownerId || !validUserIds.has(ownerId) || !validProfileIds.has(ownerId);
            agencyNameMap.set(a.id, isOrphan ? "Agência órfã / usuário deletado" : (a.company_name ?? "Agência sem nome"));
            agencyPixMap.set(a.id, {
              pix_key_type:   (a as Record<string, unknown>).pix_key_type   as string | null ?? null,
              pix_key_value:  (a as Record<string, unknown>).pix_key_value  as string | null ?? null,
              pix_holder_name:(a as Record<string, unknown>).pix_holder_name as string | null ?? null,
            });
          }
        }),
    ]);
  }

  const rows: AdminWithdrawalRow[] = txRows.map((w) => {
    const raw      = w as Record<string, unknown>;
    const role     = roleMap.get(w.user_id) ?? "unknown";
    const isTalent = role === "talent";
    const pix      = isTalent ? talentPixMap.get(w.user_id) : agencyPixMap.get(w.user_id);
    const userRole = role === "agency" || role === "talent" ? role : "unknown";

    return {
      id:                 w.id,
      userName:           isTalent
        ? (talentNameMap.get(w.user_id) ?? "Talento sem nome")
        : (agencyNameMap.get(w.user_id) ?? "Agência sem nome"),
      userRole,
      amount:             Math.abs(w.amount ?? 0),
      feeAmount:          typeof raw.fee_amount === "number" ? raw.fee_amount : 0,
      netAmount:          typeof raw.net_amount === "number" ? raw.net_amount : Math.abs(w.amount ?? 0),
      status:             w.status ?? "pending",
      createdAt:          w.created_at ?? "",
      processedAt:        w.processed_at ?? null,
      provider:           typeof raw.provider === "string" ? raw.provider : null,
      providerTransferId: typeof raw.provider_transfer_id === "string" ? raw.provider_transfer_id : null,
      providerStatus:     typeof raw.provider_status === "string" ? raw.provider_status : null,
      pixKeyType:         pix?.pix_key_type   ?? null,
      pixKeyValue:        pix?.pix_key_value  ?? null,
      pixHolderName:      pix?.pix_holder_name ?? null,
      adminNote:          typeof raw.admin_note === "string" ? raw.admin_note : null,
    };
  });

  return <AdminWithdrawals rows={rows} />;
}
