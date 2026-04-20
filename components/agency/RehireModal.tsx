"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import PaywallModal from "@/components/agency/PaywallModal";
import ReliabilityBadge from "@/components/agency/ReliabilityBadge";

type Talent = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  main_role: string | null;
};

type Job = {
  id: string;
  title: string;
  job_date: string | null;
};

type LastJob = {
  payment_amount: number;
  job_description: string | null;
  job_date: string | null;
  job_time: string | null;
  location: string | null;
  created_at: string;
};

interface Props {
  talent: Talent;
  agencyId: string;
  defaultJobId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const inputCls =
  "w-full px-4 py-3 text-[14px] rounded-xl border border-zinc-200 focus:border-zinc-900 focus:outline-none transition-colors bg-white";

function brl(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RehireModal({ talent, agencyId, defaultJobId, onClose, onSuccess }: Props) {

  const [jobs, setJobs]               = useState<Job[]>([]);
  const [jobId, setJobId]             = useState<string>(defaultJobId ?? "");
  const [description, setDescription] = useState("");
  const [amount, setAmount]           = useState("");
  const [jobDate, setJobDate]         = useState("");
  const [jobTime, setJobTime]         = useState("");
  const [prefilled, setPrefilled]     = useState<LastJob | null>(null);
  const [loadingPrefill, setLoadingPrefill] = useState(true);
  const [reliability, setReliability] = useState<{ jobs_completed: number; jobs_cancelled: number } | null>(null);
  const [jobAvail, setJobAvail]       = useState<{ is_available: boolean; start_time: string | null } | null | undefined>(undefined);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [done, setDone]               = useState(false);

  // Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Parallel: fetch open jobs + last contract + reliability
  useEffect(() => {
    supabase
      .from("jobs")
      .select("id, title, job_date")
      .eq("agency_id", agencyId)
      .eq("status", "open")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => setJobs(data ?? []));

    supabase
      .from("contracts")
      .select("payment_amount, job_description, job_date, job_time, location, created_at")
      .eq("agency_id", agencyId)
      .eq("talent_id", talent.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) {
          setPrefilled(data);
          setAmount(String(data.payment_amount ?? ""));
          if (data.job_description) setDescription(data.job_description);
          if (data.job_time) setJobTime(data.job_time);
          // Don't pre-fill date — it's a new booking, user should pick a date
        }
        setLoadingPrefill(false);
      });

    supabase
      .from("agency_talent_history")
      .select("jobs_completed, jobs_cancelled")
      .eq("agency_id", agencyId)
      .eq("talent_id", talent.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setReliability({ jobs_completed: data.jobs_completed ?? 0, jobs_cancelled: data.jobs_cancelled ?? 0 });
      });
  }, [agencyId, talent.id]);

  // Check talent availability when job date is known
  useEffect(() => {
    const selectedJob = jobs.find((j) => j.id === jobId);
    const date = selectedJob?.job_date ?? jobDate;
    if (!date) { setJobAvail(undefined); return; }

    fetch(`/api/availability/check?date=${date}&talent_ids=${talent.id}`)
      .then((r) => r.json())
      .then((json) => {
        const entry = json.availability?.[talent.id];
        setJobAvail(entry === null ? null : entry);
      });
  }, [jobId, jobDate, jobs, talent.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) < 0) {
      setError("Informe um valor válido.");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        talent_id:        talent.id,
        agency_id:        agencyId,
        job_id:           jobId   || null,
        job_description:  description.trim() || null,
        payment_amount:   Number(amount),
        job_date:         jobDate || null,
        job_time:         jobTime || null,
        is_rehire:        true,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json();
      if (body.error === "plan_limit") { setPaywallOpen(true); return; }
      setError(body.error ?? "Algo deu errado.");
      return;
    }

    setDone(true);
    setTimeout(() => { onSuccess(); onClose(); }, 1800);
  }

  const initials = (talent.full_name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const lastJobDate = prefilled?.created_at
    ? new Date(prefilled.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

        <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">

          {/* Talent header */}
          <div className="bg-gradient-to-br from-violet-600 to-violet-800 px-6 pt-6 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0 border-2 border-white/20">
                {talent.avatar_url ? (
                  <img src={talent.avatar_url} alt={talent.full_name ?? ""} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-violet-500 flex items-center justify-center text-white font-semibold text-[15px]">
                    {initials}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-[15px] truncate">{talent.full_name ?? "—"}</p>
                <p className="text-violet-200 text-[12px]">{talent.main_role ?? "Talento"}</p>
                {reliability && (
                  <div className="mt-1">
                    <ReliabilityBadge
                      completed={reliability.jobs_completed}
                      cancelled={reliability.jobs_cancelled}
                      showStats
                    />
                  </div>
                )}
              </div>
              <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-violet-100 text-[13px] mt-3 font-medium">Contratar novamente</p>
          </div>

          {done ? (
            <div className="px-6 py-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[15px] font-semibold text-zinc-900">Contrato enviado!</p>
              <p className="text-[13px] text-zinc-500">
                {talent.full_name} receberá uma notificação para assinar.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

              {/* Pre-fill badge */}
              {!loadingPrefill && prefilled && (
                <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-100 rounded-xl px-3.5 py-2.5">
                  <svg className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[12px] text-zinc-500">
                    Pré-preenchido do último job
                    {lastJobDate && <span className="text-zinc-400"> · {lastJobDate}</span>}
                    {prefilled.payment_amount > 0 && (
                      <span className="ml-1 font-semibold text-zinc-700">R$ {brl(prefilled.payment_amount)}</span>
                    )}
                  </p>
                </div>
              )}

              {/* Loading skeleton */}
              {loadingPrefill && (
                <div className="h-10 bg-zinc-100 rounded-xl animate-pulse" />
              )}

              {/* Job select */}
              <div>
                <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">
                  Vincular a uma vaga (opcional)
                </label>
                <div className="relative">
                  <select
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                    className={`${inputCls} appearance-none pr-10 cursor-pointer`}
                  >
                    <option value="">— Sem vaga específica —</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>{j.title}</option>
                    ))}
                  </select>
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Description (when no job selected) */}
              {!jobId && (
                <div>
                  <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">
                    Descrição do serviço
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="ex: Sessão de fotos para campanha"
                    className={inputCls}
                  />
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">
                  Valor (R$) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setError(null); }}
                  placeholder="0,00"
                  className={inputCls}
                  required
                />
              </div>

              {/* Date + time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">
                    Data do trabalho
                  </label>
                  <input
                    type="date"
                    value={jobDate}
                    onChange={(e) => setJobDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">
                    Horário{jobTime && <span className="text-zinc-400 font-normal"> (último: {jobTime})</span>}
                  </label>
                  <input
                    type="time"
                    value={jobTime}
                    onChange={(e) => setJobTime(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Availability indicator for selected date */}
              {jobAvail !== undefined && (
                <div className={[
                  "flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[12px] font-medium",
                  jobAvail === null
                    ? "bg-zinc-50 border border-zinc-100 text-zinc-500"
                    : jobAvail.is_available
                      ? "bg-emerald-50 border border-emerald-100 text-emerald-700"
                      : "bg-amber-50 border border-amber-100 text-amber-700",
                ].join(" ")}>
                  <span className={[
                    "w-2 h-2 rounded-full flex-shrink-0",
                    jobAvail === null ? "bg-zinc-300" : jobAvail.is_available ? "bg-emerald-500" : "bg-amber-400",
                  ].join(" ")} />
                  {jobAvail === null
                    ? "Disponibilidade não informada para esta data"
                    : jobAvail.is_available
                      ? `Disponível nesta data${jobAvail.start_time ? ` · a partir das ${jobAvail.start_time.slice(0, 5)}` : ""}`
                      : "Talento marcou-se como indisponível nesta data — você ainda pode contratar"}
                </div>
              )}

              {error && (
                <p className="text-[12px] text-rose-500 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {error}
                </p>
              )}

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl border border-zinc-200 text-[14px] font-medium text-zinc-500 hover:bg-zinc-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 active:scale-[0.98] text-white text-[14px] font-semibold transition-all disabled:opacity-60"
                >
                  {loading ? "Enviando…" : "Enviar Contrato"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {paywallOpen && <PaywallModal variant="hiring" onClose={() => setPaywallOpen(false)} />}
    </>
  );
}
