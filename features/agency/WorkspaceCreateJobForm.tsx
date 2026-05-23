"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { brl } from "@/lib/brl";
import {
  formatJobDestinationDescription,
  formatJobDestinationLabel,
} from "@/lib/jobVisibility";
import ApplicationRequirementsInput from "@/features/agency/ApplicationRequirementsInput";

const CATEGORIES = [
  "Lifestyle & Fashion", "Technology", "Food & Cooking", "Health & Fitness",
  "Travel", "Beauty", "Gaming", "Music", "Comedy", "Education", "Sports", "Other",
];

const GENDER_OPTIONS = [
  { value: "any",    label: "Qualquer gênero" },
  { value: "female", label: "Feminino" },
  { value: "male",   label: "Masculino" },
];

const base        = "w-full px-3.5 py-2.5 text-[14px] bg-zinc-50 border border-zinc-200 rounded-xl placeholder:text-zinc-400 hover:border-zinc-300 focus:border-[#1F2D2E] focus:bg-white focus:outline-none transition-colors";
const labelCls    = "block text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-1.5";

export default function WorkspaceCreateJobForm({
  agentBalance,
  isOwner,
}: {
  agentBalance: number | null;  // null = owner (no per-agent cap displayed)
  isOwner: boolean;
}) {
  const router = useRouter();

  const [title,           setTitle]           = useState("");
  const [description,     setDescription]     = useState("");
  const [category,        setCategory]        = useState("");
  const [budget,          setBudget]          = useState("");
  const [talentsRequired, setTalentsRequired] = useState("1");
  const [deadline,        setDeadline]        = useState("");
  const [jobDate,         setJobDate]         = useState("");
  const [jobTime,         setJobTime]         = useState("");
  const [location,        setLocation]        = useState("");
  const [gender,          setGender]          = useState("any");
  const [ageMin,          setAgeMin]          = useState("");
  const [ageMax,          setAgeMax]          = useState("");
  const [destination,     setDestination]     = useState<"open_space" | "premium_portal" | "private_invite">("premium_portal");
  const [appRequirements, setAppRequirements] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const budgetNum   = Number(budget)          || 0;
  const talentsNum  = Number(talentsRequired) || 1;
  const jobEstimate = budgetNum * talentsNum;

  // Balance check: only enforced for agents (agentBalance !== null)
  const exceedsBalance = agentBalance !== null && jobEstimate > agentBalance;
  const balancePct     = agentBalance !== null && agentBalance > 0
    ? Math.min(100, Math.round((jobEstimate / agentBalance) * 100))
    : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (exceedsBalance) return;
    setSaving(true);
    setError("");

    const payload: Record<string, unknown> = {
      title:                     title.trim(),
      description:               description.trim(),
      category:                  category || null,
      budget:                    budgetNum,
      deadline,
      job_date:                  jobDate  || null,
      job_time:                  jobTime  || null,
      location:                  location || null,
      gender:                    gender   || null,
      age_min:                   ageMin   ? Number(ageMin)  : null,
      age_max:                   ageMax   ? Number(ageMax)  : null,
      number_of_talents_required: talentsNum,
      destination:               isOwner ? destination : "private_invite",
      status:                    "open",
      auto_invite:               false,
      application_requirements:  appRequirements,
    };

    const res = await fetch("/api/jobs", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    setSaving(false);

    if (res.ok) {
      const data = await res.json() as { job?: { id?: string; workspace_id?: string | null } };
      const jobId = data.job?.id;
      const workspaceId = data.job?.workspace_id ?? null;
      router.push(
        jobId
          ? workspaceId
            ? `/agency/workspace/jobs/${jobId}`
            : `/agency/jobs/${jobId}`
          : "/agency/workspace/jobs"
      );
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? "Falha ao criar vaga.");
    }
  }

  return (
    <div className="space-y-8">

      {/* Header */}
      <div>
        <Link
          href="/agency/workspace/jobs"
          className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-zinc-700 transition-colors mb-4"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Vagas do workspace
        </Link>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">
          Criar vaga a partir do workspace
        </h1>
        <p className="text-[13px] text-zinc-400 mt-1">
          {isOwner ? "Escolha se a vaga sera publicada no Open Space ou dentro do portal Premium." : "A vaga sera criada dentro do portal Premium com o seu saldo alocado."}
        </p>
      </div>

      {/* Agent balance card */}
      {agentBalance !== null && (
        <div className={[
          "rounded-2xl border px-5 py-4",
          exceedsBalance
            ? "border-rose-200 bg-rose-50"
            : "border-emerald-100 bg-emerald-50",
        ].join(" ")}>
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-widest ${exceedsBalance ? "text-rose-500" : "text-emerald-600"}`}>
                Saldo disponível
              </p>
              <p className={`text-[20px] font-black mt-0.5 ${exceedsBalance ? "text-rose-700" : "text-emerald-700"}`}>
                {brl(agentBalance)}
              </p>
            </div>
            {jobEstimate > 0 && (
              <div className="text-right">
                <p className={`text-[11px] font-semibold uppercase tracking-widest ${exceedsBalance ? "text-rose-500" : "text-zinc-400"}`}>
                  Comprometimento estimado
                </p>
                <p className={`text-[18px] font-bold mt-0.5 ${exceedsBalance ? "text-rose-700" : "text-zinc-700"}`}>
                  {brl(jobEstimate)}
                </p>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {jobEstimate > 0 && agentBalance > 0 && (
            <div className="w-full h-1.5 rounded-full bg-black/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${exceedsBalance ? "bg-rose-500" : "bg-emerald-500"}`}
                style={{ width: `${balancePct}%` }}
              />
            </div>
          )}

          {exceedsBalance && (
            <p className="text-[12px] font-medium text-rose-700 mt-2">
              O orçamento da vaga ({brl(jobEstimate)}) ultrapassa o seu saldo disponível ({brl(agentBalance)}). Solicite mais saldo ao proprietário.
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Title */}
        <div>
          <label className={labelCls}>Título da vaga *</label>
          <input
            type="text"
            required
            placeholder="Ex: Modelo para campanha Natura Chronos"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={base}
          />
        </div>

        {/* Description */}
        <div>
          <label className={labelCls}>Descrição *</label>
          <textarea
            required
            rows={4}
            placeholder="Descreva a vaga, requisitos, produto, contexto da campanha..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${base} resize-none`}
          />
        </div>

        {/* Category + Budget */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Categoria *</label>
            <select
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={base}
            >
              <option value="">Selecionar…</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>
              Orçamento por talento (BRL) *
              {agentBalance !== null && budgetNum > 0 && talentsNum > 1 && (
                <span className="ml-1.5 normal-case font-medium text-zinc-400">
                  × {talentsNum} = {brl(jobEstimate)}
                </span>
              )}
            </label>
            <input
              type="number"
              required
              min={1}
              step={0.01}
              placeholder="5000"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className={base}
            />
          </div>
        </div>

        {/* Talentos necessários */}
        <div>
          <label className={labelCls}>Talentos necessários *</label>
          <input
            type="number"
            required
            min={1}
            value={talentsRequired}
            onChange={(e) => setTalentsRequired(e.target.value)}
            className={base}
          />
        </div>

        {/* Deadline */}
        <div>
          <label className={labelCls}>Prazo para candidaturas *</label>
          <input
            type="date"
            required
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className={base}
          />
        </div>

        {/* Work date + time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Data do trabalho</label>
            <input
              type="date"
              value={jobDate}
              onChange={(e) => setJobDate(e.target.value)}
              className={base}
            />
          </div>
          <div>
            <label className={labelCls}>Horário da vaga</label>
            <input
              type="time"
              value={jobTime}
              onChange={(e) => setJobTime(e.target.value)}
              className={base}
            />
          </div>
        </div>

        {/* Location */}
        <div>
          <label className={labelCls}>Localização</label>
          <input
            type="text"
            placeholder="Cidade, estado ou 'Remoto'"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={base}
          />
        </div>

        {/* Gender + Age */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Gênero</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className={base}
            >
              {GENDER_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Idade mínima</label>
            <input
              type="number"
              min={1}
              placeholder="18"
              value={ageMin}
              onChange={(e) => setAgeMin(e.target.value)}
              className={base}
            />
          </div>
          <div>
            <label className={labelCls}>Idade máxima</label>
            <input
              type="number"
              min={1}
              placeholder="60"
              value={ageMax}
              onChange={(e) => setAgeMax(e.target.value)}
              className={base}
            />
          </div>
        </div>

        {/* Application requirements */}
        <ApplicationRequirementsInput
          value={appRequirements}
          onChange={setAppRequirements}
        />

        {/* Destination selection */}
        {isOwner ? (
          <div>
            <label className={labelCls}>Destino da vaga</label>
            <div className="grid gap-3">
              {[
                {
                  value: "open_space",
                  label: formatJobDestinationLabel({ visibility: "public", workspaceId: null }),
                  desc: formatJobDestinationDescription({ visibility: "public", workspaceId: null }),
                },
                {
                  value: "premium_portal",
                  label: formatJobDestinationLabel({ visibility: "public", workspaceId: "premium" }),
                  desc: formatJobDestinationDescription({ visibility: "public", workspaceId: "premium" }),
                },
                {
                  value: "private_invite",
                  label: formatJobDestinationLabel({ visibility: "private_invite", workspaceId: "premium" }),
                  desc: formatJobDestinationDescription({ visibility: "private_invite", workspaceId: "premium" }),
                },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={[
                    "flex flex-col gap-1 rounded-xl border px-4 py-3 cursor-pointer transition-colors",
                    destination === opt.value
                      ? "border-[#1ABC9C] bg-[#1ABC9C]/5 ring-1 ring-[#1ABC9C]"
                      : "border-zinc-200 hover:border-zinc-300",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="destination"
                    value={opt.value}
                    checked={destination === (opt.value as "open_space" | "premium_portal" | "private_invite")}
                    onChange={() => setDestination(opt.value as "open_space" | "premium_portal" | "private_invite")}
                    className="sr-only"
                  />
                  <span className="text-[13px] font-semibold text-zinc-900">{opt.label}</span>
                  <span className="text-[11px] text-zinc-500 leading-snug">{opt.desc}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 text-[12px] text-violet-700">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Agentes convidados publicam apenas no Premium como <strong>Privada por convite</strong>.</span>
          </div>
        )}

        {error && (
          <p className="text-[13px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Link
            href="/agency/workspace/jobs"
            className="flex-1 py-3 text-[14px] font-medium text-center border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving || exceedsBalance}
            className="flex-1 py-3 text-[14px] font-semibold bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? "Criando vaga…" : "Criar vaga"}
          </button>
        </div>
      </form>
    </div>
  );
}


