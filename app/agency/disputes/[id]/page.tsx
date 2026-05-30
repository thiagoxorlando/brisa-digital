import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getGlobalPaymentDefaults } from "@/lib/platformSettings.server";
import { DISPUTE_STATUS_LABEL, DISPUTE_STATUS_TONE, type DisputeStatus } from "@/lib/disputePolicy";
import { resolveContractAmounts } from "@/lib/contractStatus";
import { brl } from "@/lib/brl";

export const metadata: Metadata = { title: "Dispute Detail — BrisaHub" };

type PageProps = { params: Promise<{ id: string }> };

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const RESOLUTION_LABEL: Record<string, string> = {
  release: "Custodia liberada ao talento",
  refund:  "Reembolso para a agencia",
  split:   "Divisao parcial",
  close:   "Encerrada sem movimentacao",
};

export default async function AgencyDisputeDetailPage({ params }: PageProps) {
  const { id } = await params;

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");

  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: agencyRow }, globalDefaults] = await Promise.all([
    supabase.from("agencies").select("payment_mode").eq("id", user.id).maybeSingle(),
    getGlobalPaymentDefaults(),
  ]);
  const resolvedMode = (agencyRow?.payment_mode as string | null) ?? globalDefaults.default_payment_mode;
  if (resolvedMode === "internal") redirect("/agency/dashboard");

  const { data: dispute } = await supabase
    .from("contract_disputes")
    .select("id, contract_id, status, reason, created_at, resolved_at, resolution_note, resolution_action, talent_amount, agency_refund_amount")
    .eq("id", id)
    .maybeSingle();

  if (!dispute) notFound();

  // contracts.agency_id stores the auth user.id — not the agencies table PK
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, job_id, job_description, job_date, job_time, payment_amount, commission_amount, net_amount, status, payment_status, talent_id, talent_user_id")
    .eq("id", dispute.contract_id)
    .eq("agency_id", user.id)
    .maybeSingle();

  if (!contract) notFound();

  const talentUserId = contract.talent_user_id ?? contract.talent_id ?? null;
  const [jobResult, notesResult, talentResult] = await Promise.all([
    contract.job_id
      ? supabase.from("jobs").select("id, title").eq("id", contract.job_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("contract_dispute_notes")
      .select("id, body, created_at")
      .eq("dispute_id", id)
      .eq("visibility", "public")
      .order("created_at", { ascending: false }),
    talentUserId
      ? supabase.from("talent_profiles").select("id, full_name, user_id").eq("user_id", talentUserId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const jobTitle = jobResult.data?.title ?? contract.job_description ?? "Vaga";
  const publicNotes = notesResult.data ?? [];
  const talentName = talentResult.data?.full_name ?? "Talento";
  const amounts = resolveContractAmounts(contract);
  const status = dispute.status as DisputeStatus;
  const isResolved = !["open", "under_review"].includes(dispute.status);

  return (
    <div className="max-w-4xl space-y-6 px-4 pb-10 sm:px-6">
      <div>
        <Link href="/agency/disputes" className="text-[12px] font-semibold text-teal-700 hover:text-teal-800">
          ← Voltar para disputas
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${DISPUTE_STATUS_TONE[status]}`}>
            {DISPUTE_STATUS_LABEL[status]}
          </span>
        </div>
        <h1 className="mt-3 text-[1.75rem] font-semibold tracking-tight text-zinc-950">{jobTitle}</h1>
        <p className="mt-2 text-[14px] leading-6 text-zinc-500">{dispute.reason}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Contrato</p>
          <h2 className="mt-1 text-[18px] font-semibold text-zinc-950">Detalhes</h2>

          <div className="mt-5 space-y-3">
            <div className="flex justify-between text-[13px]">
              <span className="text-zinc-500">ID do contrato</span>
              <span className="font-mono font-medium text-zinc-700">{contract.id.slice(0, 8)}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-zinc-500">Talento</span>
              <span className="font-medium text-zinc-700">{talentName}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-zinc-500">Data da vaga</span>
              <span className="font-medium text-zinc-700">
                {contract.job_date ? fmtDate(contract.job_date) : "-"}
                {contract.job_time ? ` · ${contract.job_time}` : ""}
              </span>
            </div>
            <div className="h-px bg-zinc-100" />
            <div className="flex justify-between text-[13px]">
              <span className="text-zinc-500">Valor contratado</span>
              <span className="font-semibold text-zinc-900">{brl(amounts.gross)}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-zinc-500">Taxa da plataforma</span>
              <span className="font-medium text-zinc-700">{brl(amounts.commission)}</span>
            </div>
            <div className="h-px bg-zinc-100" />
            <div className="flex justify-between text-[13px]">
              <span className="text-zinc-500">Disputa aberta em</span>
              <span className="font-medium text-zinc-700">{fmtDateTime(dispute.created_at)}</span>
            </div>
            {isResolved && dispute.resolved_at ? (
              <div className="flex justify-between text-[13px]">
                <span className="text-zinc-500">Resolvida em</span>
                <span className="font-medium text-zinc-700">{fmtDateTime(dispute.resolved_at)}</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
          {isResolved ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Resultado</p>
              <h2 className="mt-1 text-[18px] font-semibold text-zinc-950">
                {dispute.resolution_action ? (RESOLUTION_LABEL[dispute.resolution_action] ?? "Resolvida") : "Resolvida"}
              </h2>

              <div className="mt-5 space-y-3">
                {dispute.agency_refund_amount != null && Number(dispute.agency_refund_amount) > 0 ? (
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600">Reembolso para você</p>
                    <p className="mt-1 text-[22px] font-semibold text-emerald-900">{brl(Number(dispute.agency_refund_amount))}</p>
                  </div>
                ) : null}
                {dispute.talent_amount != null && Number(dispute.talent_amount) > 0 ? (
                  <div className="rounded-2xl bg-zinc-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Liberado ao talento</p>
                    <p className="mt-1 text-[22px] font-semibold text-zinc-900">{brl(Number(dispute.talent_amount))}</p>
                  </div>
                ) : null}
                {dispute.resolution_note ? (
                  <div className="rounded-2xl border border-zinc-100 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Nota</p>
                    <p className="mt-2 text-[13px] leading-5 text-zinc-600">{dispute.resolution_note}</p>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</p>
              <h2 className="mt-1 text-[18px] font-semibold text-zinc-950">Em andamento</h2>
              <div className="mt-5 rounded-2xl bg-zinc-50 p-4 text-[13px] leading-6 text-zinc-600">
                Sua disputa foi recebida e está sendo analisada pela equipe BrisaHub. Você será notificado quando houver uma decisão.
              </div>
              <div className="mt-4 rounded-2xl bg-amber-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-600">Custodia bloqueada</p>
                <p className="mt-1 text-[22px] font-semibold text-amber-900">{brl(amounts.gross)}</p>
                <p className="mt-1 text-[12px] text-amber-700">Valor retido até a resolução da disputa.</p>
              </div>
            </>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
        <h2 className="text-[18px] font-semibold text-zinc-950">Comunicações da BrisaHub</h2>
        <p className="mt-1 text-[12px] text-zinc-400">Atualizações públicas da equipe de suporte sobre esta disputa.</p>

        <div className="mt-5 space-y-3">
          {publicNotes.map((note) => (
            <div key={note.id} className="rounded-2xl bg-zinc-50 p-4">
              <p className="text-[13px] leading-5 text-zinc-700">{note.body}</p>
              <p className="mt-2 text-[11px] text-zinc-400">{fmtDateTime(note.created_at)}</p>
            </div>
          ))}
          {publicNotes.length === 0 ? (
            <p className="text-[13px] text-zinc-400">Nenhuma atualização disponível no momento.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
