import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePremiumWorkspacePageContext } from "@/lib/premiumWorkspaceApp.server";
import { createServerClient } from "@/lib/supabase";
import { resolveSupportUsers } from "@/lib/resolveSupportUsers";
import { DISPUTE_STATUS_LABEL, DISPUTE_STATUS_TONE, type DisputeStatus } from "@/lib/disputePolicy";
import { resolveContractAmounts } from "@/lib/contractStatus";
import { brl } from "@/lib/brl";

export const metadata: Metadata = { title: "Detalhe da Disputa Premium — BrisaHub" };

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

function PartyCard({ label, name, email, role, avatarUrl, sublabel }: {
  label: string;
  name: string;
  email?: string;
  role?: string;
  avatarUrl?: string | null;
  sublabel?: string | null;
}) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-zinc-50 p-4">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-200 text-[11px] font-bold text-zinc-600">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
        ) : initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{label}</p>
        <p className="mt-0.5 text-[14px] font-semibold text-zinc-900 truncate">{name}</p>
        {sublabel ? <p className="text-[12px] text-zinc-500">{sublabel}</p> : null}
        {email ? <p className="text-[11px] text-zinc-400 truncate">{email}</p> : null}
        {role ? (
          <span className="mt-1 inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 ring-1 ring-zinc-200">
            {role}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default async function WorkspaceDisputeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const context = await requirePremiumWorkspacePageContext();
  const supabase = createServerClient({ useServiceRole: true });

  const { data: dispute } = await supabase
    .from("contract_disputes")
    .select("id, contract_id, status, reason, created_at, resolved_at, resolution_note, resolution_action, talent_amount, agency_refund_amount, opened_by_user_id")
    .eq("id", id)
    .maybeSingle();

  if (!dispute) notFound();

  const { data: contract } = await supabase
    .from("contracts")
    .select("id, job_id, job_description, job_date, job_time, payment_amount, commission_amount, net_amount, status, payment_status, workspace_id, talent_id, talent_user_id")
    .eq("id", dispute.contract_id)
    .maybeSingle();

  if (!contract) notFound();

  // Permission check: must be a job/contract in this workspace
  const isWorkspaceContract = contract.workspace_id === context.workspace.id;
  let isAllowed = isWorkspaceContract;
  let jobRow: { id: string; title: string | null; workspace_id: string | null; created_by_user_id: string | null } | null = null;

  if (contract.job_id) {
    const { data: job } = await supabase
      .from("jobs")
      .select("id, title, workspace_id, created_by_user_id")
      .eq("id", contract.job_id)
      .maybeSingle();
    jobRow = job ?? null;
    if (!isAllowed && job?.workspace_id === context.workspace.id) {
      isAllowed = context.isOwner || job.created_by_user_id === context.userId;
    }
  }

  if (!isAllowed) notFound();

  const talentUserId = contract.talent_user_id ?? null;

  // Only look up agent membership when the job creator is not the workspace owner
  const potentialAgentId = (jobRow?.created_by_user_id && jobRow.created_by_user_id !== context.workspace.ownerUserId)
    ? jobRow.created_by_user_id
    : null;

  // Resolve all party user IDs in one batch call
  const partyIds = [
    talentUserId,
    context.workspace.ownerUserId,
    dispute.opened_by_user_id,
    jobRow?.created_by_user_id,
  ].filter((uid): uid is string => !!uid);

  const uniquePartyIds = [...new Set(partyIds)];

  const [resolvedUsers, notesResult, talentProfileResult, agentMembershipResult] = await Promise.all([
    resolveSupportUsers(uniquePartyIds),
    supabase
      .from("contract_dispute_notes")
      .select("id, body, created_at")
      .eq("dispute_id", id)
      .eq("visibility", "public")
      .order("created_at", { ascending: false }),
    talentUserId
      ? supabase.from("talent_profiles").select("id, full_name, avatar_url").eq("user_id", talentUserId).maybeSingle()
      : Promise.resolve({ data: null }),
    potentialAgentId
      ? supabase.from("workspace_agents").select("id").eq("workspace_id", context.workspace.id).eq("user_id", potentialAgentId).eq("status", "active").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const publicNotes = notesResult.data ?? [];
  const amounts = resolveContractAmounts(contract);
  const status = dispute.status as DisputeStatus;
  const isResolved = !["open", "under_review"].includes(dispute.status);

  const jobTitle = jobRow?.title ?? contract.job_description ?? "Vaga";

  const talentUser = talentUserId ? resolvedUsers.get(talentUserId) : null;
  const talentName = talentProfileResult.data?.full_name ?? talentUser?.name ?? "Talento";
  const talentEmail = talentUser?.email ?? null;
  const talentAvatar = talentProfileResult.data?.avatar_url ?? talentUser?.avatarUrl ?? null;

  const ownerUser = resolvedUsers.get(context.workspace.ownerUserId);
  const ownerName = ownerUser?.name ?? "Proprietário";
  const ownerEmail = ownerUser?.email ?? null;

  const openedByUser = dispute.opened_by_user_id ? resolvedUsers.get(dispute.opened_by_user_id) : null;
  const openedByName = openedByUser?.name ?? "Sistema";
  const openedByRole = openedByUser?.roleLabel ?? null;
  const openedByEmail = openedByUser?.email ?? null;

  const isVerifiedAgent = potentialAgentId !== null && agentMembershipResult.data !== null;
  const agentUser = isVerifiedAgent ? resolvedUsers.get(potentialAgentId!) : null;

  return (
    <div className="max-w-5xl space-y-6 px-4 pb-10 sm:px-6">
      <div>
        <Link href="/agency/workspace/disputes" className="text-[12px] font-semibold text-teal-700 hover:text-teal-800">
          ← Voltar para disputas
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${DISPUTE_STATUS_TONE[status]}`}>
            {DISPUTE_STATUS_LABEL[status]}
          </span>
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-100">
            Premium · {context.workspace.name}
          </span>
        </div>
        <h1 className="mt-3 text-[1.75rem] font-semibold tracking-tight text-zinc-950">{jobTitle}</h1>
        <p className="mt-2 text-[14px] leading-6 text-zinc-500">{dispute.reason}</p>
      </div>

      {/* Party context section */}
      <section className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Partes envolvidas</p>
        <h2 className="mt-1 text-[18px] font-semibold text-zinc-950">Contexto completo</h2>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <PartyCard
            label="Talento"
            name={talentName}
            email={talentEmail ?? undefined}
            role="Talento"
            avatarUrl={talentAvatar}
            sublabel={talentUserId ? `ID: ${talentUserId.slice(0, 8)}` : null}
          />
          <PartyCard
            label="Proprietário do workspace"
            name={ownerName}
            email={ownerEmail ?? undefined}
            role="Agência"
            sublabel={context.workspace.name}
          />
          {agentUser ? (
            <PartyCard
              label="Agente responsável pela vaga"
              name={agentUser.name}
              email={agentUser.email}
              role="Agente"
              sublabel={`ID: ${potentialAgentId!.slice(0, 8)}`}
            />
          ) : null}
          <PartyCard
            label="Aberta por"
            name={openedByName}
            email={openedByEmail ?? undefined}
            role={openedByRole ?? undefined}
            sublabel={fmtDateTime(dispute.created_at)}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3 border-t border-zinc-100 pt-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Contrato</p>
            <p className="mt-1 font-mono text-[13px] text-zinc-700">{contract.id.slice(0, 8)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Data da vaga</p>
            <p className="mt-1 text-[13px] text-zinc-700">
              {contract.job_date ? fmtDate(contract.job_date) : "-"}
              {contract.job_time ? ` · ${contract.job_time}` : ""}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Disputa aberta em</p>
            <p className="mt-1 text-[13px] text-zinc-700">{fmtDateTime(dispute.created_at)}</p>
          </div>
        </div>
      </section>

      {/* Financial context */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Valor bruto</p>
          <p className="mt-2 text-[20px] font-semibold text-zinc-900">{brl(amounts.gross)}</p>
          <p className="mt-1 text-[11px] text-zinc-400">Valor contratado</p>
        </div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Líquido talento</p>
          <p className="mt-2 text-[20px] font-semibold text-zinc-900">{brl(amounts.net)}</p>
          <p className="mt-1 text-[11px] text-zinc-400">Após comissão da plataforma</p>
        </div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Custódia em risco</p>
          <p className="mt-2 text-[20px] font-semibold text-zinc-900">{brl(amounts.gross)}</p>
          <p className="mt-1 text-[11px] text-zinc-400">
            {isResolved ? "Disputa resolvida" : "Payout bloqueado pela disputa"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Contrato</p>
          <h2 className="mt-1 text-[18px] font-semibold text-zinc-950">Detalhes financeiros</h2>

          <div className="mt-5 space-y-3">
            <div className="flex justify-between text-[13px]">
              <span className="text-zinc-500">Valor contratado</span>
              <span className="font-semibold text-zinc-900">{brl(amounts.gross)}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-zinc-500">Taxa da plataforma</span>
              <span className="font-medium text-zinc-700">{brl(amounts.commission)}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-zinc-500">Líquido talento</span>
              <span className="font-semibold text-zinc-900">{brl(amounts.net)}</span>
            </div>
            {isResolved && dispute.resolved_at ? (
              <>
                <div className="h-px bg-zinc-100" />
                <div className="flex justify-between text-[13px]">
                  <span className="text-zinc-500">Resolvida em</span>
                  <span className="font-medium text-zinc-700">{fmtDateTime(dispute.resolved_at)}</span>
                </div>
              </>
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
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600">Reembolso para a agencia</p>
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
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Nota de resolução</p>
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
                A disputa está sendo analisada pela equipe BrisaHub. As partes serão notificadas quando houver uma decisão.
              </div>
              <div className="mt-4 rounded-2xl bg-amber-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-600">Custódia bloqueada</p>
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
