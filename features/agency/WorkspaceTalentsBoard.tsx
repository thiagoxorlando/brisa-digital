"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

export type WorkspaceTalentContractHistory = {
  id: string;
  jobTitle: string;
  statusLabel: string;
  statusTone: string;
  grossLabel: string;
  netLabel: string;
  paidAt: string | null;
  createdAt: string;
};

export type WorkspaceTalentCard = {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  lastActivity: string;
  applicationCount: number;
  contractCount: number;
  jobsCount: number;
  jobTitles: string[];
  isPortalMember: boolean;
  isCandidate: boolean;
  isContracted: boolean;
  city?: string | null;
  country?: string | null;
  bio?: string | null;
  sourceLabel: string;
  contractHistory: WorkspaceTalentContractHistory[];
  marketplaceVisible: boolean;
};

type Props = {
  talents: WorkspaceTalentCard[];
  workspaceSlug: string | null;
  brandPrimary?: string;
  brandAccent?: string;
};

type FilterKey = "all" | "members" | "candidates" | "contracted";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "members", label: "Membros" },
  { key: "candidates", label: "Candidatos" },
  { key: "contracted", label: "Contratados" },
];

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMonthKey(value: string) {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
}

function cardStatus(talent: WorkspaceTalentCard) {
  if (talent.isContracted) {
    return {
      label: "Contratado",
      className: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (talent.isCandidate) {
    return {
      label: "Candidato",
      className: "border border-sky-200 bg-sky-50 text-sky-700",
    };
  }
  return {
    label: "Membro do portal",
    className: "border border-[#CFEAE4] bg-[#ECFBF7] text-[#0E7C86]",
  };
}

function relationshipBadges(talent: WorkspaceTalentCard) {
  return [
    talent.isPortalMember ? { label: "Portal", className: "bg-[#EEF8F6] text-[#0E7C86]" } : null,
    talent.isCandidate ? { label: "Direto", className: "bg-sky-50 text-sky-700" } : null,
    talent.isContracted ? { label: "Com contrato", className: "bg-emerald-50 text-emerald-700" } : null,
  ].filter(Boolean) as Array<{ label: string; className: string }>;
}

function matchesFilter(talent: WorkspaceTalentCard, filter: FilterKey) {
  if (filter === "members") return talent.isPortalMember;
  if (filter === "candidates") return talent.isCandidate;
  if (filter === "contracted") return talent.isContracted;
  return true;
}

function EmptyState({
  workspaceSlug,
  copyPortalLink,
  copied,
}: {
  workspaceSlug: string | null;
  copyPortalLink: () => void;
  copied: boolean;
}) {
  return (
    <div className="rounded-[28px] border border-dashed border-[#CFE0DE] bg-white px-6 py-12 text-center shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#ECFBF7] text-[#0E7C86]">
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-9 6h12a2 2 0 002-2V8a2 2 0 00-2-2h-3.17a2 2 0 01-1.42-.59l-.82-.82A2 2 0 0011.17 4H6a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h2 className="mt-5 text-[1.15rem] font-semibold tracking-tight text-zinc-950">
        Nenhum talento conectado ainda
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-[14px] leading-7 text-zinc-500">
        Compartilhe o link do portal ou crie uma vaga privada para convidar talentos.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        {workspaceSlug ? (
          <button
            type="button"
            onClick={copyPortalLink}
            className="inline-flex items-center justify-center rounded-2xl border border-[#CFE0DE] bg-white px-5 py-3 text-[13px] font-semibold text-[#173033] transition-colors hover:bg-[#F7FBFB]"
          >
            {copied ? "Link copiado" : "Copiar link do portal"}
          </button>
        ) : null}
        <Link
          href="/agency/post-job"
          className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#0E7C86] to-[#1ABC9C] px-5 py-3 text-[13px] font-semibold text-white shadow-[0_14px_28px_rgba(14,124,134,0.18)]"
        >
          Criar vaga privada
        </Link>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[18px] border border-zinc-200 bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{label}</p>
      <p className="mt-1 text-[12px] text-zinc-700">{value || "-"}</p>
    </div>
  );
}

function HistoryEmptyState() {
  return (
    <div className="rounded-[18px] border border-dashed border-zinc-200 bg-white px-4 py-5 text-[12px] text-zinc-500">
      Nenhum historico de pagamentos ou contratos disponivel para este talento ainda.
    </div>
  );
}

export default function WorkspaceTalentsBoard({ talents, workspaceSlug, brandPrimary = "#0E7C86", brandAccent = "#1ABC9C" }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [copied, setCopied] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(userId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const summary = useMemo(() => {
    const nowMonthKey = formatMonthKey(new Date().toISOString());
    return {
      portalMembers: talents.filter((talent) => talent.isPortalMember).length,
      privateCandidates: talents.filter((talent) => talent.isCandidate).length,
      premiumContracts: talents.reduce((sum, talent) => sum + talent.contractCount, 0),
      newThisMonth: talents.filter((talent) => talent.joinedAt && formatMonthKey(talent.joinedAt) === nowMonthKey).length,
    };
  }, [talents]);

  const filteredTalents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return talents.filter((talent) => {
      if (!matchesFilter(talent, filter)) return false;
      if (!query) return true;

      return (
        talent.name.toLowerCase().includes(query) ||
        talent.email.toLowerCase().includes(query) ||
        (talent.phone ?? "").toLowerCase().includes(query) ||
        talent.jobTitles.some((title) => title.toLowerCase().includes(query))
      );
    });
  }, [filter, search, talents]);

  const privateActivity = useMemo(
    () =>
      talents
        .filter((talent) => talent.isCandidate || talent.isContracted)
        .sort((left, right) => {
          const rightDate = right.lastActivity || right.joinedAt;
          const leftDate = left.lastActivity || left.joinedAt;
          return rightDate.localeCompare(leftDate);
        }),
    [talents],
  );

  async function copyPortalLink() {
    if (!workspaceSlug) return;
    const url = `${window.location.origin}/${workspaceSlug}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-zinc-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <div
          className="px-6 py-6 text-white sm:px-8 sm:py-8"
          style={{ background: `radial-gradient(circle at top left, ${brandPrimary}40, transparent 35%), linear-gradient(135deg, ${brandPrimary} 0%, ${brandAccent} 100%)` }}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                Espaco Premium
              </div>
              <h1 className="mt-4 text-[2rem] font-bold tracking-tight sm:text-[2.5rem]">
                Talentos convidados
              </h1>
              <p className="mt-3 text-[15px] leading-7 text-white/72">
                Lista expandivel com identidade, origem, atividade e historico privado de cada talento do workspace.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {workspaceSlug ? (
                <button
                  type="button"
                  onClick={copyPortalLink}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-white/15"
                >
                  {copied ? "Link copiado" : "Copiar link do portal"}
                </button>
              ) : null}
              <Link
                href="/agency/workspace/jobs/new"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-[13px] font-semibold shadow-[0_14px_28px_rgba(8,35,38,0.18)]"
                style={{ color: brandPrimary }}
              >
                Criar vaga privada
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-zinc-100 px-6 py-6 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Membros do portal", value: summary.portalMembers, hint: "Talentos que entraram pelo link privado" },
            { label: "Candidaturas privadas", value: summary.privateCandidates, hint: "Talentos ativos nas vagas do workspace" },
            { label: "Contratos Premium", value: summary.premiumContracts, hint: "Contratos ligados ao Espaco Premium" },
            { label: "Novos este mes", value: summary.newThisMonth, hint: "Entradas recentes no portal privado" },
          ].map((item) => (
            <div key={item.label} className="rounded-[24px] border border-zinc-200 bg-[#FCFDFC] px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{item.label}</p>
              <p className="mt-2 text-[1.9rem] font-bold tracking-tight text-zinc-950">{item.value}</p>
              <p className="mt-1.5 text-[12px] leading-5 text-zinc-500">{item.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <svg className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, e-mail, telefone ou vaga privada"
              className="w-full rounded-2xl border border-[#DDE6E6] bg-white py-3 pl-11 pr-4 text-[13px] text-zinc-800 shadow-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-[#0E7C86]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => {
              const active = item.key === filter;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={[
                    "rounded-full px-4 py-2 text-[12px] font-semibold transition-all",
                    active
                      ? "bg-[#173033] text-white shadow-[0_10px_22px_rgba(23,48,51,0.18)]"
                      : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {filteredTalents.length === 0 ? (
          <EmptyState workspaceSlug={workspaceSlug} copyPortalLink={copyPortalLink} copied={copied} />
        ) : (
          <div className="space-y-4">
            {filteredTalents.map((talent) => {
              const status = cardStatus(talent);
              const badges = relationshipBadges(talent);
              const isExpanded = expandedIds.has(talent.userId);

              return (
                <article
                  key={talent.userId}
                  className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_16px_38px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-4">
                      {talent.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={talent.avatarUrl} alt={talent.name} className="h-14 w-14 rounded-[18px] object-cover ring-1 ring-zinc-200" />
                      ) : (
                        <div
                          className="flex h-14 w-14 items-center justify-center rounded-[18px] text-[15px] font-bold text-white"
                          style={{ background: `linear-gradient(135deg, ${brandPrimary}, ${brandAccent})` }}
                        >
                          {initials(talent.name)}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[18px] font-semibold text-zinc-950">{talent.name}</p>
                          <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${status.className}`}>
                            {status.label}
                          </span>
                          {badges.map((badge) => (
                            <span key={`${talent.userId}-${badge.label}`} className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${badge.className}`}>
                              {badge.label}
                            </span>
                          ))}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-zinc-500">
                          <span>{talent.email || "E-mail nao disponivel"}</span>
                          <span>{talent.phone || "Telefone nao disponivel"}</span>
                          <span>Origem: {talent.sourceLabel}</span>
                          <span>Entrou em {formatDate(talent.joinedAt)}</span>
                          <span>Ultima atividade {formatDate(talent.lastActivity)}</span>
                        </div>

                        {talent.jobTitles.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {talent.jobTitles.slice(0, 4).map((title) => (
                              <span
                                key={`${talent.userId}-${title}`}
                                className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-600"
                              >
                                {title}
                              </span>
                            ))}
                            {talent.jobTitles.length > 4 ? (
                              <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-500">
                                +{talent.jobTitles.length - 4}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 xl:w-[320px] xl:flex-shrink-0">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-[20px] border border-zinc-100 bg-zinc-50 px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Candidaturas</p>
                          <p className="mt-1 text-[1.2rem] font-bold text-zinc-900">{talent.applicationCount}</p>
                        </div>
                        <div className="rounded-[20px] border border-zinc-100 bg-zinc-50 px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Contratos</p>
                          <p className="mt-1 text-[1.2rem] font-bold text-zinc-900">{talent.contractCount}</p>
                        </div>
                        <div className="rounded-[20px] border border-zinc-100 bg-zinc-50 px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Vagas</p>
                          <p className="mt-1 text-[1.2rem] font-bold text-zinc-900">{talent.jobsCount}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleExpand(talent.userId)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 px-4 py-3 text-[12px] font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                      >
                        <svg
                          className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        {isExpanded ? "Ocultar detalhes" : "Ver detalhes"}
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-5 space-y-4 rounded-[24px] border border-zinc-100 bg-zinc-50 p-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <DetailRow label="Nome" value={talent.name} />
                        <DetailRow label="E-mail" value={talent.email || "-"} />
                        <DetailRow label="Telefone" value={talent.phone || "-"} />
                        <DetailRow label="Cidade / Pais" value={[talent.city, talent.country].filter(Boolean).join(", ") || "-"} />
                        <DetailRow label="Entrou em" value={formatDate(talent.joinedAt)} />
                        <DetailRow label="Ultima atividade" value={formatDate(talent.lastActivity)} />
                        <DetailRow label="Origem" value={talent.sourceLabel} />
                        <DetailRow label="Candidaturas" value={String(talent.applicationCount)} />
                        <DetailRow label="Contratos" value={String(talent.contractCount)} />
                        <DetailRow label="Vagas" value={String(talent.jobsCount)} />
                      </div>

                      <div className="rounded-[20px] border border-zinc-200 bg-white p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Bio</p>
                        <p className="mt-2 text-[13px] leading-6 text-zinc-600">
                          {talent.bio || "Sem bio preenchida ate o momento."}
                        </p>
                      </div>

                      <div className="rounded-[20px] border border-zinc-200 bg-white p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-[14px] font-semibold text-zinc-900">Historico de pagamentos e contratos</p>
                            <p className="mt-1 text-[12px] text-zinc-500">
                              Contratos privados do workspace com status, bruto e valor pago ao talento quando houver.
                            </p>
                          </div>
                          {talent.marketplaceVisible ? (
                            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-semibold text-sky-700">
                              Marketplace visivel
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-[10px] font-semibold text-zinc-600">
                              Privado no Premium
                            </span>
                          )}
                        </div>

                        <div className="mt-4 space-y-3">
                          {talent.contractHistory.length === 0 ? (
                            <HistoryEmptyState />
                          ) : (
                            talent.contractHistory.map((item) => (
                              <div key={item.id} className="rounded-[18px] border border-zinc-200 bg-zinc-50 p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-[13px] font-semibold text-zinc-900">{item.jobTitle}</p>
                                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.statusTone}`}>
                                        {item.statusLabel}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-[11px] text-zinc-500">
                                      <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1">
                                        Contrato #{item.id.slice(0, 8).toUpperCase()}
                                      </span>
                                      <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1">
                                        Criado em {formatDate(item.createdAt)}
                                      </span>
                                      <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1">
                                        Pago em {formatDate(item.paidAt ?? "")}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="grid gap-2 text-[12px] text-zinc-600 sm:grid-cols-2">
                                    <div className="rounded-[16px] border border-zinc-200 bg-white px-3 py-2.5">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Bruto</p>
                                      <p className="mt-1 font-semibold text-zinc-900">{item.grossLabel}</p>
                                    </div>
                                    <div className="rounded-[16px] border border-zinc-200 bg-white px-3 py-2.5">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Pago ao talento</p>
                                      <p className="mt-1 font-semibold text-zinc-900">{item.netLabel}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_16px_38px_rgba(15,23,42,0.05)]">
        <div className="border-b border-zinc-100 px-6 py-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[18px] font-semibold tracking-tight text-zinc-950">
                Atividade das vagas privadas
              </h2>
              <p className="mt-1 text-[13px] text-zinc-500">
                Relacoes recentes com talentos que responderam ou foram contratados nas vagas do workspace.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-[#DCEDEA] bg-[#F5FCFA] px-3 py-1 text-[11px] font-semibold text-[#0E7C86]">
              Powered by BrisaHub Premium
            </span>
          </div>
        </div>

        {privateActivity.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[15px] font-semibold text-zinc-800">Nenhuma atividade privada ainda.</p>
            <p className="mt-2 text-[13px] leading-6 text-zinc-500">
              Assim que talentos se candidatarem ou forem contratados nas vagas privadas, a atividade aparece aqui.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 p-6 md:grid-cols-2">
            {privateActivity.map((talent) => {
              const status = cardStatus(talent);
              return (
                <div key={`activity-${talent.userId}`} className="rounded-[24px] border border-zinc-200 bg-[#FCFDFC] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-semibold text-zinc-950">{talent.name}</p>
                      <p className="mt-1 text-[12px] text-zinc-500">
                        {talent.lastActivity ? `Ultima atividade em ${formatDate(talent.lastActivity)}` : "Atividade sem data registrada"}
                      </p>
                    </div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {talent.jobTitles.map((title) => (
                      <span
                        key={`activity-${talent.userId}-${title}`}
                        className="inline-flex rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-600"
                      >
                        {title}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
