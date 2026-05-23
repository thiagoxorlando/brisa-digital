"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { brl } from "@/lib/brl";
import { formatJobVisibilityLabel } from "@/lib/jobVisibility";
import { jobStatusLabel, jobStatusTone } from "@/lib/jobStatus";
import { workspaceStatusLabel, workspaceStatusTone, agentStatusLabel, agentStatusTone } from "@/lib/workspaceStatus";
import type {
  AdminPremiumData,
  AdminPremiumSummary,
  AdminPremiumWorkspaceRow,
  AdminPremiumAgentRow,
  AdminPremiumJobRow,
} from "@/lib/readModels/adminPremium";
import { useT } from "@/lib/LanguageContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(s: string) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${workspaceStatusTone(s)}`}>{workspaceStatusLabel(s)}</span>;
}

function visibilityBadge(v: string) {
  if (v === "private_invite") {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-100">{formatJobVisibilityLabel({ visibility: v, workspaceId: "premium" })}</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-500 border border-zinc-200">{formatJobVisibilityLabel({ visibility: v, workspaceId: "premium" })}</span>;
}

function jobStatusBadge(s: string) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${jobStatusTone(s)}`}>{jobStatusLabel(s)}</span>;
}

function agentStatusBadge(s: string) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${agentStatusTone(s)}`}>{agentStatusLabel(s)}</span>;
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: AdminPremiumSummary }) {
  const cards = [
    { label: "Espaços ativos",        value: String(summary.activeWorkspaceCount), accent: "text-amber-600" },
    { label: "Agentes ativos",        value: String(summary.activeAgentCount),     accent: "text-indigo-600" },
    { label: "Vagas do portal",       value: String(summary.privateJobCount),      accent: "text-violet-600" },
    { label: "Convites pendentes",    value: String(summary.pendingInviteCount),   accent: "text-emerald-600" },
    {
      label: "Assentos usados",
      value: `${summary.totalUsedSeats} / ${summary.totalAllowedSeats}`,
      accent: summary.totalUsedSeats >= summary.totalAllowedSeats && summary.totalAllowedSeats > 0
        ? "text-rose-600" : "text-zinc-700",
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-5">
          <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">{c.label}</p>
          <p className={`text-[22px] font-bold ${c.accent}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function SeatUsageLabel({ ws }: { ws: AdminPremiumWorkspaceRow }) {
  return (
    <div>
      <p className={`text-[13px] font-semibold ${ws.usedSeats >= ws.totalSeats ? "text-rose-600" : "text-zinc-700"}`}>
        {ws.usedSeats}/{ws.totalSeats}
      </p>
      <p className="text-[10px] text-zinc-400">Usados</p>
    </div>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────

type Filters = {
  search: string;
  status: "active" | "suspended" | "cancelled" | "all";
  branding: "all" | "with_logo" | "without_logo";
  seats: "all" | "under" | "full";
  privateJobs: "all" | "has" | "none";
  orphan: "active_only" | "orphan" | "all";
};

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  function set<K extends keyof Filters>(k: K, v: Filters[K]) {
    onChange({ ...filters, [k]: v });
  }

  const selectCls = "rounded-xl border border-zinc-200 px-3 py-2 text-[13px] text-zinc-700 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white cursor-pointer";

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4 flex flex-wrap gap-3 items-center">
      <input
        type="text"
        value={filters.search}
        onChange={(e) => set("search", e.target.value)}
        placeholder="Buscar workspace, agência, e-mail…"
        className="flex-1 min-w-[200px] rounded-xl border border-zinc-200 px-3 py-2 text-[13px] text-zinc-700 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
      />
      <select value={filters.status} onChange={(e) => set("status", e.target.value as Filters["status"])} className={selectCls}>
        <option value="active">Ativo</option>
        <option value="suspended">Suspenso</option>
        <option value="cancelled">Cancelado</option>
        <option value="all">Todos os status</option>
      </select>
      <select value={filters.branding} onChange={(e) => set("branding", e.target.value as Filters["branding"])} className={selectCls}>
        <option value="all">Qualquer branding</option>
        <option value="with_logo">Com logo</option>
        <option value="without_logo">Sem logo</option>
      </select>
      <select value={filters.seats} onChange={(e) => set("seats", e.target.value as Filters["seats"])} className={selectCls}>
        <option value="all">Todos os assentos</option>
        <option value="under">Abaixo do limite</option>
        <option value="full">Limite atingido</option>
      </select>
      <select value={filters.privateJobs} onChange={(e) => set("privateJobs", e.target.value as Filters["privateJobs"])} className={selectCls}>
        <option value="all">Todas as vagas</option>
        <option value="has">Com vagas Premium</option>
        <option value="none">Sem vagas Premium</option>
      </select>
      <select value={filters.orphan} onChange={(e) => set("orphan", e.target.value as Filters["orphan"])} className={selectCls}>
        <option value="active_only">Ativos</option>
        <option value="orphan">Órfãos</option>
        <option value="all">Todos</option>
      </select>
    </div>
  );
}

// ── Expanded: Agents ──────────────────────────────────────────────────────────

function AgentsTable({ agents }: { agents: AdminPremiumAgentRow[] }) {
  const active = agents.filter((a) => a.status !== "removed");
  const removed = agents.filter((a) => a.status === "removed");
  const [showRemoved, setShowRemoved] = useState(false);

  function AgentRow({ a }: { a: AdminPremiumAgentRow }) {
    return (
      <tr className="border-b border-zinc-50 last:border-0">
        <td className="py-2.5 pr-4">
          <p className="text-[13px] font-medium text-zinc-800">{a.displayName}</p>
          <p className="text-[11px] text-zinc-400">{a.email}</p>
        </td>
        <td className="py-2.5 pr-4">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${a.role === "owner" ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-indigo-50 text-indigo-600 border-indigo-100"}`}>
            {a.role === "owner" ? "Proprietário" : "Agente"}
          </span>
        </td>
        <td className="py-2.5 pr-4">{agentStatusBadge(a.status)}</td>
        <td className="py-2.5 pr-4 text-[12px] text-zinc-600">
          {brl(a.allocatedAmount)}
        </td>
        <td className="py-2.5 pr-4 text-[12px] text-zinc-600">
          {a.committedAmount > 0 ? brl(a.committedAmount) : "—"}
        </td>
        <td className="py-2.5 pr-4 text-[12px] text-zinc-600">
          {brl(a.availableAmount)}
        </td>
        <td className="py-2.5 text-[11px] text-zinc-400">{fmtDate(a.createdAt)}</td>
      </tr>
    );
  }

  return (
    <div>
      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Membros</p>
      {active.length === 0 ? (
        <p className="text-[13px] text-zinc-400">Nenhum membro ativo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-100">
                {["Nome", "Função", "Status", "Alocado", "Comprometido", "Disponível", "Desde"].map((h) => (
                  <th key={h} className="pb-2 pr-4 text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map((a) => <AgentRow key={a.memberId} a={a} />)}
            </tbody>
          </table>
        </div>
      )}
      {removed.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowRemoved(!showRemoved)}
            className="text-[11px] text-zinc-400 hover:text-zinc-600 underline cursor-pointer"
          >
            {showRemoved ? "Ocultar" : `Ver ${removed.length} removido${removed.length !== 1 ? "s" : ""}`}
          </button>
          {showRemoved && (
            <div className="mt-2 opacity-60">
              <table className="w-full text-left">
                <tbody>
                  {removed.map((a) => <AgentRow key={a.memberId} a={a} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Expanded: Invites ─────────────────────────────────────────────────────────

function InvitesTable({ invites }: { invites: AdminPremiumWorkspaceRow["pendingInvites"] }) {
  if (invites.length === 0) {
    return (
      <div>
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Convites pendentes</p>
        <p className="text-[13px] text-zinc-400">Nenhum convite pendente.</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Convites pendentes ({invites.length})</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-zinc-100">
              {["E-mail", "Status", "Limite", "Expira em", "Criado"].map((h) => (
                <th key={h} className="pb-2 pr-4 text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invites.map((inv) => (
              <tr key={inv.id} className="border-b border-zinc-50 last:border-0">
                <td className="py-2.5 pr-4 text-[13px] text-zinc-700">{inv.invitedEmail}</td>
                <td className="py-2.5 pr-4">{statusBadge(inv.status)}</td>
                <td className="py-2.5 pr-4 text-[12px] text-zinc-600">
                  {inv.spendingLimit != null ? brl(inv.spendingLimit) : "—"}
                </td>
                <td className="py-2.5 pr-4 text-[11px] text-zinc-400">{fmtDateTime(inv.expiresAt)}</td>
                <td className="py-2.5 text-[11px] text-zinc-400">{fmtDate(inv.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Expanded: Jobs ────────────────────────────────────────────────────────────

function JobsTable({ jobs }: { jobs: AdminPremiumJobRow[] }) {
  if (jobs.length === 0) {
    return (
      <div>
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Vagas recentes</p>
        <p className="text-[13px] text-zinc-400">Nenhuma vaga criada no workspace.</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Vagas recentes ({jobs.length})</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-zinc-100">
              {["Título", "Visibilidade", "Status", "Orçamento", "Criada por", "Candidatos", "Data"].map((h) => (
                <th key={h} className="pb-2 pr-4 text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-b border-zinc-50 last:border-0">
                <td className="py-2.5 pr-4">
                  <Link
                    href={`/admin/jobs/${j.id}`}
                    className="text-[13px] font-medium text-zinc-800 hover:text-[#1ABC9C] transition-colors"
                  >
                    {j.title || "(sem título)"}
                  </Link>
                </td>
                <td className="py-2.5 pr-4">{visibilityBadge(j.visibility)}</td>
                <td className="py-2.5 pr-4">{jobStatusBadge(j.status)}</td>
                <td className="py-2.5 pr-4 text-[12px] text-zinc-600">
                  {j.budget != null && j.budget > 0 ? brl(j.budget) : "—"}
                </td>
                <td className="py-2.5 pr-4 text-[11px] text-zinc-500">{j.createdByDisplayName ?? "—"}</td>
                <td className="py-2.5 pr-4 text-[12px] text-zinc-600">{j.candidateCount}</td>
                <td className="py-2.5 text-[11px] text-zinc-400">{fmtDate(j.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Expanded: Branding ────────────────────────────────────────────────────────

function BrandingSection({ ws }: { ws: AdminPremiumWorkspaceRow }) {
  const primary = ws.brandPrimaryColor ?? "#1ABC9C";
  const accent = ws.brandAccentColor ?? "#27C1D6";
  const initials = ws.name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

  return (
    <div>
      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-3">Branding</p>
      <div className="flex items-start gap-5">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden border border-zinc-200"
          style={{ background: ws.logoUrl ? "#f4f4f5" : primary }}
        >
          {ws.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ws.logoUrl} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[16px] font-bold text-white">{initials}</span>
          )}
        </div>
        <div className="space-y-2 flex-1">
          <div className="flex flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Nome</p>
              <p className="text-[13px] text-zinc-800">{ws.name}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Cor principal</p>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded border border-zinc-200" style={{ background: primary }} />
                <span className="text-[12px] font-mono text-zinc-600">{ws.brandPrimaryColor ?? "padrão"}</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Cor de destaque</p>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded border border-zinc-200" style={{ background: accent }} />
                <span className="text-[12px] font-mono text-zinc-600">{ws.brandAccentColor ?? "padrão"}</span>
              </div>
            </div>
          </div>
          {ws.welcomeMessage && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Mensagem de boas-vindas</p>
              <p className="text-[13px] text-zinc-600 mt-0.5">{ws.welcomeMessage}</p>
            </div>
          )}
          <div
            className="h-1 rounded-full w-32"
            style={{ background: `linear-gradient(to right, ${primary}, ${accent})` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Expanded: Portal ─────────────────────────────────────────────────────────

function PortalSection({ ws }: { ws: AdminPremiumWorkspaceRow }) {
  const portalUrl = ws.slug ? `brisahub.com.br/${ws.slug}` : null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Portal público</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase">Slug</p>
          <p className="text-[13px] font-mono text-zinc-800">{ws.slug ?? <span className="text-zinc-400 font-sans">não definido</span>}</p>
        </div>
        {portalUrl && (
          <div>
            <p className="text-[10px] font-semibold text-zinc-400 uppercase">URL</p>
            <Link
              href={`/${ws.slug}`}
              target="_blank"
              className="text-[13px] text-[#1ABC9C] hover:underline font-mono"
            >
              {portalUrl}
            </Link>
          </div>
        )}
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase">Talentos no portal</p>
          <p className="text-[13px] font-semibold text-zinc-800">{ws.portalTalentCount}</p>
        </div>
      </div>
    </div>
  );
}

// ── Expanded: Owner ───────────────────────────────────────────────────────────

function OwnerSection({ ws }: { ws: AdminPremiumWorkspaceRow }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Proprietário</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase">Agência</p>
          <p className="text-[13px] text-zinc-800">{ws.ownerCompanyName}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase">E-mail</p>
          <p className="text-[13px] text-zinc-600">{ws.ownerEmail || "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase">Plano</p>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 capitalize">
            {ws.ownerPlan}
          </span>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase">Saldo carteira</p>
          <p className="text-[13px] font-semibold text-emerald-600">{brl(ws.ownerWalletBalance)}</p>
        </div>
        <div>
          <Link
            href={`/admin/users/${ws.ownerUserId}`}
            className="text-[12px] font-semibold text-[#1ABC9C] hover:underline"
          >
            Ver perfil →
          </Link>
        </div>
      </div>
    </div>
  );
}

function SeatAdminSection({
  ws,
  onWorkspaceUpdate,
}: {
  ws: AdminPremiumWorkspaceRow;
  onWorkspaceUpdate: (next: Partial<AdminPremiumWorkspaceRow>) => void;
}) {
  const [extraSeats, setExtraSeats] = useState(String(ws.extraSeats));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/admin/premium/workspaces/${ws.id}/seats`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraAgentSeats: Number(extraSeats),
          reason,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        usage?: { totalAllowed: number; usedSeats: number; remaining: number };
      };

      if (!res.ok) {
        setFeedback({ ok: false, message: data.error ?? "Não foi possível atualizar os assentos extras." });
        return;
      }

      onWorkspaceUpdate({
        extraSeats: Number(extraSeats),
        totalSeats: ws.includedSeats + Number(extraSeats),
        usedSeats: data.usage?.usedSeats ?? ws.usedSeats,
        remainingSeats: data.usage?.remaining ?? Math.max(0, ws.includedSeats + Number(extraSeats) - ws.usedSeats),
      });
      setFeedback({ ok: true, message: data.message ?? "Assentos extras atualizados com sucesso." });
      setReason("");
    } catch {
      setFeedback({ ok: false, message: "Não foi possível atualizar os assentos extras." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-3">Assentos</p>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Incluídos</p>
          <p className="mt-1 text-[15px] font-semibold text-zinc-900">{ws.includedSeats}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Extras</p>
          <p className="mt-1 text-[15px] font-semibold text-zinc-900">{ws.extraSeats}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Total</p>
          <p className="mt-1 text-[15px] font-semibold text-zinc-900">{ws.totalSeats}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Uso atual</p>
          <p className="mt-1 text-[15px] font-semibold text-zinc-900">
            {ws.usedSeats} / {ws.totalSeats}
          </p>
          <p className="mt-1 text-[11px] text-zinc-400">
            {ws.activeAgentCount} ativos • {ws.pendingInviteCount} pendentes
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-700">
        Assentos extras são controlados manualmente nesta versão. Cobrança automática será adicionada depois.
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Assentos extras
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={extraSeats}
            onChange={(e) => setExtraSeats(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[13px] text-zinc-700 focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Motivo da alteração
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: ajuste comercial aprovado pelo suporte"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[13px] text-zinc-700 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !reason.trim() || extraSeats.trim() === ""}
            className="inline-flex h-[42px] items-center rounded-xl bg-amber-500 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Atualizar"}
          </button>
        </div>
      </div>

      {feedback ? (
        <p className={`mt-3 text-[12px] font-medium ${feedback.ok ? "text-emerald-600" : "text-rose-600"}`}>
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}

// ── Expanded panel ────────────────────────────────────────────────────────────

function ExpandedPanel({
  ws,
  onWorkspaceUpdate,
}: {
  ws: AdminPremiumWorkspaceRow;
  onWorkspaceUpdate: (next: Partial<AdminPremiumWorkspaceRow>) => void;
}) {
  return (
    <div className="border-t border-zinc-50 bg-zinc-50/50 px-5 py-5 space-y-6">
      <OwnerSection ws={ws} />
      <div className="border-t border-zinc-100 pt-5">
        <SeatAdminSection ws={ws} onWorkspaceUpdate={onWorkspaceUpdate} />
      </div>
      <div className="border-t border-zinc-100 pt-5"><AgentsTable agents={ws.agents} /></div>
      <div className="border-t border-zinc-100 pt-5"><InvitesTable invites={ws.pendingInvites} /></div>
      <div className="border-t border-zinc-100 pt-5"><JobsTable jobs={ws.recentJobs} /></div>
      <div className="border-t border-zinc-100 pt-5"><BrandingSection ws={ws} /></div>
      <div className="border-t border-zinc-100 pt-5"><PortalSection ws={ws} /></div>
    </div>
  );
}

// ── Workspace row ─────────────────────────────────────────────────────────────

function WorkspaceRow({
  ws,
  onWorkspaceChange,
}: {
  ws: AdminPremiumWorkspaceRow;
  onWorkspaceChange: (workspaceId: string, next: Partial<AdminPremiumWorkspaceRow>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const workspace = ws;
  const primary = workspace.brandPrimaryColor ?? "#1ABC9C";
  const initials = workspace.name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

  return (
    <div className="border-b border-zinc-50 last:border-0">
      <div
        className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-50/50 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Logo/initials */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden border border-zinc-200 text-[11px] font-bold text-white"
          style={{ background: workspace.logoUrl ? "#f4f4f5" : primary }}
        >
          {workspace.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={workspace.logoUrl} alt="" className="w-full h-full object-cover" />
          ) : initials}
        </div>

        {/* Name + owner */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-semibold text-zinc-900 truncate">{workspace.name}</p>
            {statusBadge(workspace.status)}
            {workspace.isOrphan && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-100">
                Workspace órfão
              </span>
            )}
            {workspace.hasLogo && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">Logo</span>
            )}
            {workspace.hasWelcomeMessage && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Mensagem</span>
            )}
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
            {workspace.ownerCompanyName} · {workspace.ownerEmail}
          </p>
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-5 flex-shrink-0 text-center">
          <SeatUsageLabel ws={workspace} />
          <div>
            <p className="text-[13px] font-semibold text-violet-600">{workspace.privateJobCount}</p>
            <p className="text-[10px] text-zinc-400">Privadas</p>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-zinc-700">{workspace.totalJobCount}</p>
            <p className="text-[10px] text-zinc-400">Total vagas</p>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-amber-600">{workspace.pendingInviteCount}</p>
            <p className="text-[10px] text-zinc-400">Convites</p>
          </div>
          <div>
            <p className="text-[12px] text-zinc-500">{fmtDate(workspace.createdAt)}</p>
            <p className="text-[10px] text-zinc-400">Criado</p>
          </div>
        </div>

        {/* Expand chevron */}
        <div className="flex-shrink-0 ml-2">
          <svg
            className={`w-4 h-4 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <ExpandedPanel
          ws={workspace}
          onWorkspaceUpdate={(next) => onWorkspaceChange(workspace.id, next)}
        />
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminPremium({ data }: { data: AdminPremiumData }) {
  const { t } = useT();
  const [workspaces, setWorkspaces] = useState<AdminPremiumWorkspaceRow[]>(data.workspaces);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    status: "active",
    branding: "all",
    seats: "all",
    privateJobs: "all",
    orphan: "active_only",
  });

  const summary = useMemo<AdminPremiumSummary>(() => {
    const activeRows = workspaces.filter((row) => row.status === "active" && !row.deletedAt && !row.isOrphan);
    return {
      activeWorkspaceCount: activeRows.length,
      activeAgentCount: activeRows.reduce((sum, row) => sum + row.activeAgentCount, 0),
      privateJobCount: activeRows.reduce((sum, row) => sum + row.privateJobCount, 0),
      pendingInviteCount: activeRows.reduce((sum, row) => sum + row.pendingInviteCount, 0),
      totalUsedSeats: activeRows.reduce((sum, row) => sum + row.usedSeats, 0),
      totalAllowedSeats: activeRows.reduce((sum, row) => sum + row.totalSeats, 0),
    };
  }, [workspaces]);

  const filtered = useMemo(() => {
    return workspaces.filter((ws) => {
      // Status filter
      if (filters.status !== "all") {
        if (filters.status === "active" && (ws.status !== "active" || ws.deletedAt)) return false;
        if (filters.status === "suspended" && ws.status !== "suspended") return false;
        if (filters.status === "cancelled" && ws.status !== "cancelled") return false;
      }

      // Search
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase();
        const match =
          ws.name.toLowerCase().includes(q) ||
          ws.ownerCompanyName.toLowerCase().includes(q) ||
          ws.ownerEmail.toLowerCase().includes(q) ||
          ws.agents.some((a) => a.email.toLowerCase().includes(q) || a.displayName.toLowerCase().includes(q));
        if (!match) return false;
      }

      if (filters.orphan === "active_only" && ws.isOrphan) return false;
      if (filters.orphan === "orphan" && !ws.isOrphan) return false;

      // Branding filter
      if (filters.branding === "with_logo" && !ws.hasLogo) return false;
      if (filters.branding === "without_logo" && ws.hasLogo) return false;

      // Seat usage
      if (filters.seats === "under" && ws.usedSeats >= ws.totalSeats) return false;
      if (filters.seats === "full" && ws.usedSeats < ws.totalSeats) return false;

      // Private jobs
      if (filters.privateJobs === "has" && ws.privateJobCount === 0) return false;
      if (filters.privateJobs === "none" && ws.privateJobCount > 0) return false;

      return true;
    });
  }, [workspaces, filters]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold text-zinc-900">Premium</h1>
        <p className="text-[13px] text-zinc-500 mt-0.5">
          Monitore os espaços Premium, agentes, vagas privadas e uso das agências.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-700">
        Assentos extras são controlados manualmente nesta versão. Cobrança automática será adicionada depois.
      </div>

      {/* Summary cards */}
      <SummaryCards summary={summary} />

      {/* Filters */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* Workspace list */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="h-[3px] bg-gradient-to-r from-amber-400 to-amber-600" />
        <div className="px-5 py-4 border-b border-zinc-50 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-zinc-900">Workspaces Premium</p>
            <p className="text-[12px] text-zinc-400 mt-0.5">
              {filtered.length} workspace{filtered.length !== 1 ? "s" : ""}
              {filtered.length !== workspaces.length && ` (${workspaces.length} total)`}
            </p>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
            Premium
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[14px] text-zinc-400">Nenhum workspace encontrado com os filtros aplicados.</p>
          </div>
        ) : (
          <div>
            {filtered.map((ws) => (
              <WorkspaceRow
                key={ws.id}
                ws={ws}
                onWorkspaceChange={(workspaceId, next) =>
                  setWorkspaces((current) =>
                    current.map((row) => (row.id === workspaceId ? { ...row, ...next } : row))
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



