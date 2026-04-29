"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/LanguageContext";
import { useSubscription } from "@/lib/SubscriptionContext";

export type AgencyContract = {
  id: string;
  jobId: string | null;
  jobTitle: string;
  talentId: string | null;
  talentName: string;
  jobDate: string | null;
  jobTime: string | null;
  location: string | null;
  jobDescription: string | null;
  paymentAmount: number;
  paymentMethod: string | null;
  additionalNotes: string | null;
  status: string;
  paymentStatus: string;
  createdAt: string;
  signedAt: string | null;
  agencySignedAt: string | null;
  depositPaidAt: string | null;
  paidAt: string | null;
  contractFileUrl: string | null;
  signedContractUrl: string | null;
};

const STATUS_CLS: Record<string, string> = {
  sent:      "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  signed:    "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  confirmed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  paid:      "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  rejected:  "bg-rose-50 text-rose-600 ring-1 ring-rose-100",
  cancelled: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200",
};
const STATUS_LABEL_KEY: Record<string, string> = {
  sent:      "contract_status_sent",
  signed:    "contract_status_signed",
  confirmed: "contract_status_confirmed",
  paid:      "contract_status_paid",
  rejected:  "contract_status_rejected",
  cancelled: "contract_status_cancelled",
};

const ALL_STATUSES = ["all", "sent", "signed", "confirmed", "paid", "rejected", "cancelled"] as const;
type FilterStatus = typeof ALL_STATUSES[number];

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null, lang = "pt") {
  if (!s) return "—";
  const locale = lang === "pt" ? "pt-BR" : "en-US";
  return new Date(s).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

function fmtJobDate(s: string | null, lang = "pt") {
  if (!s) return "—";
  const locale = lang === "pt" ? "pt-BR" : "en-US";
  return new Date(s + "T00:00:00").toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(s: string | null, lang = "pt") {
  if (!s) return null;
  const locale = lang === "pt" ? "pt-BR" : "en-US";
  return new Date(s).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function jobDatePassed(s: string | null) {
  if (!s) return false;
  return new Date(s + "T23:59:59") < new Date();
}

function openUrl(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.click();
}

function downloadContract(c: AgencyContract) {
  // Prefer signed version uploaded by talent; fall back to original
  if (c.signedContractUrl) { openUrl(c.signedContractUrl); return; }
  if (c.contractFileUrl)   { openUrl(c.contractFileUrl);   return; }
  const lines = [
    "DETALHES DO CONTRATO",
    "====================",
    `Talento:          ${c.talentName}`,
    `Status:           ${c.status}`,
    `Valor do Pagamento: ${brl(c.paymentAmount)}`,
    `Forma de Pagamento: ${c.paymentMethod ?? "—"}`,
    `Data do Trabalho: ${c.jobDate ? fmtJobDate(c.jobDate) : "A definir"}`,
    `Horário:          ${c.jobTime ?? "—"}`,
    `Local:            ${c.location ?? "—"}`,
    `Enviado em:       ${fmtDate(c.createdAt)}`,
    c.signedAt    ? `Assinado pelo Talento: ${fmtDate(c.signedAt)}`    : null,
    c.agencySignedAt ? `Assinado pela Agência: ${fmtDate(c.agencySignedAt)}` : null,
    c.depositPaidAt  ? `Depósito Pago:   ${fmtDate(c.depositPaidAt)}` : null,
    c.paidAt         ? `Pago em:         ${fmtDate(c.paidAt)}`         : null,
    "",
    "DESCRIÇÃO DA VAGA",
    "-----------------",
    c.jobDescription ?? "Sem descrição fornecida.",
    "",
    "NOTAS ADICIONAIS",
    "----------------",
    c.additionalNotes ?? "Nenhuma.",
  ].filter((l) => l !== null);

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `contract-${c.talentName.replace(/\s+/g, "-").toLowerCase()}-${c.id.slice(0, 8)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">{label}</p>
      <p className="text-[13px] font-medium text-zinc-700">{value}</p>
    </div>
  );
}

function ContractCard({
  contract: c,
  onUpdate,
}: {
  contract: AgencyContract;
  onUpdate: (id: string, updates: Partial<AgencyContract>) => void;
}) {
  const [expanded,         setExpanded]         = useState(false);
  const [acting,           setActing]           = useState<string | null>(null);
  const { t, lang } = useT();
  const stCls   = STATUS_CLS[c.status] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";
  const stLabel = t((STATUS_LABEL_KEY[c.status] ?? "general_unknown") as Parameters<typeof t>[0]);
  const isPaid  = c.status === "paid";

  const isJobPast = jobDatePassed(c.jobDate);

  async function callAction(action: string, nextStatus: string, updates: Partial<AgencyContract>) {
    setActing(action);
    const res = await fetch(`/api/contracts/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      onUpdate(c.id, { status: nextStatus, ...updates });
    }
    setActing(null);
  }

  async function handleStripeFunding() {
    setActing("stripe_funding");
    const res = await fetch(`/api/contracts/${c.id}/stripe-checkout`, { method: "POST" });
    const data = await res.json().catch(() => ({})) as { error?: string; url?: string };
    if (res.ok && data.url) {
      window.location.href = data.url;
      return;
    }
    console.error("[contract stripe funding]", data.error ?? "Stripe checkout failed");
    setActing(null);
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center gap-4 px-6 py-4 flex-wrap sm:flex-nowrap">
        {/* Talent name */}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-zinc-900 truncate">{c.talentName}</p>
          {c.jobTime && (
            <p className="text-[12px] text-zinc-400 mt-0.5">{c.jobTime}</p>
          )}
        </div>

        {/* Amount */}
        <p className="text-[15px] font-semibold text-zinc-900 tabular-nums flex-shrink-0">{brl(c.paymentAmount)}</p>

        {/* Status */}
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${stCls}`}>
          {stLabel}
        </span>

        {c.status === "signed" && (
          <button
            onClick={handleStripeFunding}
            disabled={acting !== null}
            className="flex-shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            {acting === "stripe_funding" ? "Abrindo..." : "Pagar via Stripe"}
          </button>
        )}

        {/* Cancel only after escrow is funded */}
        {!isPaid && c.status === "confirmed" && (
          <button
            onClick={() => callAction("cancel_job", "cancelled", {})}
            disabled={acting !== null}
            className="flex-shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            {acting === "cancel_job" ? "…" : "Cancelar"}
          </button>
        )}

        {/* Download — prefers signed version uploaded by talent */}
        <button
          onClick={() => downloadContract(c)}
          className={[
            "flex-shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer",
            c.signedContractUrl
              ? "text-emerald-600 hover:text-emerald-800"
              : c.contractFileUrl
              ? "text-zinc-500 hover:text-zinc-800"
              : "text-zinc-400 hover:text-zinc-700",
          ].join(" ")}
          aria-label="Download contract"
          title={
            c.signedContractUrl
              ? "Baixar contrato assinado pelo talento"
              : c.contractFileUrl
              ? "Baixar contrato original"
              : "Baixar contrato"
          }
        >
          {c.signedContractUrl ? (
            <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md whitespace-nowrap">
              Assinado
            </span>
          ) : c.contractFileUrl ? (
            <span className="text-[10px] font-semibold bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-md whitespace-nowrap">
              Original
            </span>
          ) : null}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-zinc-50 px-6 py-5 space-y-4">
          {isPaid && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
              <svg className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-[12px] font-semibold text-emerald-700">
                {t("contracts_paid")} — {t("general_required")}
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("contracts_job_date")} value={fmtJobDate(c.jobDate, lang)} />
            <Field label={t("contracts_job_time")} value={c.jobTime ?? "—"} />
            <Field label={t("contracts_location")} value={c.location ?? "—"} />
            <Field label={t("contracts_payment_method")} value={c.paymentMethod ?? "—"} />
          </div>

          {/* Signing timeline */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">{t("contracts_signed")}</p>
            <div className="flex flex-col gap-2">
              {[
                { label: t("contracts_sent"),         date: fmtDate(c.createdAt, lang),              done: true              },
                { label: t("contracts_signed"),       date: fmtDateTime(c.signedAt, lang),           done: !!c.signedAt        },
                { label: t("contracts_deposit_paid"), date: fmtDateTime(c.depositPaidAt, lang),      done: !!c.depositPaidAt   },
                { label: t("jobs_job_date"),           date: c.jobDate ? fmtJobDate(c.jobDate, lang) : t("general_tbd"), done: isJobPast },
                { label: t("contracts_pay_talent"),   date: fmtDateTime(c.paidAt, lang),             done: !!c.paidAt          },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={[
                    "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold",
                    step.done ? "bg-emerald-500 text-white" : "bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200",
                  ].join(" ")}>
                    {step.done ? (
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : i + 1}
                  </div>
                  <div>
                    <p className={`text-[12px] font-medium ${step.done ? "text-zinc-800" : "text-zinc-400"}`}>{step.label}</p>
                    {step.date && step.done && <p className="text-[10px] text-zinc-400">{step.date}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {c.jobDescription && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{t("jobs_description")}</p>
              <p className="text-[13px] text-zinc-600 leading-relaxed whitespace-pre-line">{c.jobDescription}</p>
            </div>
          )}
          {c.additionalNotes && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{t("contracts_notes")}</p>
              <p className="text-[13px] text-zinc-600 leading-relaxed whitespace-pre-line">{c.additionalNotes}</p>
            </div>
          )}
          <p className="text-[11px] text-zinc-400">{t("contracts_sent")} {fmtDate(c.createdAt, lang)}</p>
        </div>
      )}
    </div>
  );
}

// ─── Job group ────────────────────────────────────────────────────────────────

function JobGroup({
  jobTitle,
  jobId,
  contracts,
  onUpdate,
}: {
  jobTitle: string;
  jobId: string | null;
  contracts: AgencyContract[];
  onUpdate: (id: string, updates: Partial<AgencyContract>) => void;
}) {
  const pendingDeposit = contracts.filter((c) => c.status === "signed").length;
  const confirmed      = contracts.filter((c) => c.status === "confirmed" || c.status === "paid").length;
  const jobDate        = contracts[0]?.jobDate ?? null;
  const location       = contracts[0]?.location ?? null;

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      {/* Job header */}
      <div className="px-6 py-4 border-b border-zinc-50 flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={jobId ? `/agency/jobs/${jobId}` : "#"}
              className="text-[15px] font-semibold text-zinc-900 hover:text-zinc-600 transition-colors truncate"
            >
              {jobTitle}
            </Link>
            {pendingDeposit > 0 && (
              <Link
                href="/agency/bookings"
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
              >
                {pendingDeposit} depósito{pendingDeposit !== 1 ? "s" : ""} pendente{pendingDeposit !== 1 ? "s" : ""}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[12px] text-zinc-400 flex-wrap">
            {jobDate && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {fmtJobDate(jobDate)}
              </span>
            )}
            {location && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                {location}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 text-[12px] text-zinc-400">
          <span>{contracts.length} talento{contracts.length !== 1 ? "s" : ""}</span>
          {confirmed > 0 && (
            <span className="text-emerald-600 font-medium">· {confirmed} confirmado{confirmed !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* Contract rows */}
      <div className="divide-y divide-zinc-50">
        {contracts.map((c) => (
          <ContractCard key={c.id} contract={c} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AgencyContracts({ contracts: initialContracts }: { contracts: AgencyContract[] }) {
  const [contracts,    setContracts]    = useState<AgencyContract[]>(initialContracts);
  const [filter,       setFilter]       = useState<FilterStatus>("all");
  const { t } = useT();
  const { commissionLabel, talentShareLabel } = useSubscription();

  function handleUpdate(id: string, updates: Partial<AgencyContract>) {
    setContracts((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }

  const filtered       = filter === "all" ? contracts : contracts.filter((c) => c.status === filter);
  const pendingDeposit = contracts.filter((c) => c.status === "signed").length;
  const awaitingTalent = contracts.filter((c) => c.status === "sent").length;

  // Group filtered contracts by jobId
  const jobOrder: string[] = [];
  const byJob = new Map<string, AgencyContract[]>();
  for (const c of filtered) {
    const key = c.jobId ?? "no-job";
    if (!byJob.has(key)) { byJob.set(key, []); jobOrder.push(key); }
    byJob.get(key)!.push(c);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{t("portal_agency")}</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">{t("contracts_title")}</h1>
        <p className="text-[13px] text-zinc-400 mt-1">
          {contracts.length} {t("general_contracts")}
        </p>
      </div>

      {awaitingTalent > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          <p className="text-[13px] font-medium text-amber-800">
            {awaitingTalent} {t("contract_status_sent").toLowerCase()}.
          </p>
        </div>
      )}

      {pendingDeposit > 0 && (
        <Link
          href="/agency/bookings"
          className="flex items-center gap-3 bg-violet-50 border border-violet-100 hover:border-violet-200 hover:bg-violet-100 rounded-xl px-4 py-3 transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />
          <p className="text-[13px] font-medium text-violet-800">
            {pendingDeposit} {t("contract_status_signed").toLowerCase()}.
          </p>
        </Link>
      )}

      {contracts.length > 0 && (
        <div className="flex items-center gap-2 text-[12px] text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t("finances_platform_commission")}: <strong className="text-zinc-600 ml-1">{commissionLabel}</strong>
          <span className="mx-1">·</span>
          {t("nav_talent")}: <strong className="text-zinc-600 ml-1">{talentShareLabel}</strong>
          <span className="mx-1">·</span>
          <strong className="text-violet-600">+2% {t("finances_referral_payouts")}</strong>
          <span className="text-[#647B7B] ml-1">(se aplicável)</span>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-1 bg-zinc-100 rounded-xl p-1 w-fit">
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={[
              "px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all capitalize cursor-pointer whitespace-nowrap",
              filter === s ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
            ].join(" ")}
          >
            {s === "all" ? t("status_all") : t((STATUS_LABEL_KEY[s] ?? s) as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 py-16 text-center">
          <div className="w-11 h-11 rounded-2xl bg-zinc-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-[#647B7B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-[14px] font-medium text-zinc-500">{t("contracts_no_contracts")}</p>
          <p className="text-[13px] text-zinc-400 mt-1">{t("contracts_no_contracts_hint")}</p>
          <Link
            href="/agency/jobs"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors mt-4"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {t("nav_jobs")}
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {jobOrder.map((key) => {
            const group = byJob.get(key)!;
            return (
              <JobGroup
                key={key}
                jobTitle={group[0].jobTitle}
                jobId={group[0].jobId}
                contracts={group}
                onUpdate={handleUpdate}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
