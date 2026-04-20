"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type EditableJob = {
  id: string;
  title: string;
  description: string;
  category: string;
  budget: number;
  deadline: string;
  status: "open" | "closed" | "draft" | "inactive";
  location: string;
  gender: string;
  age_min: number | null;
  age_max: number | null;
  number_of_talents_required: number;
};

const CATEGORIES = [
  "Lifestyle & Fashion", "Technology", "Food & Cooking", "Health & Fitness",
  "Travel", "Beauty", "Gaming", "Music", "Comedy", "Education", "Sports", "Other",
];

const GENDER_OPTIONS = ["any", "male", "female"];

const base = "w-full px-3.5 py-2.5 text-[14px] bg-zinc-50 border border-zinc-200 rounded-xl placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:bg-white focus:outline-none transition-colors";
const disabledBase = `${base} opacity-50 cursor-not-allowed bg-zinc-100 hover:border-zinc-200`;

export default function EditJobForm({ job }: { job: EditableJob }) {
  const router = useRouter();

  // If open/draft → only deadline editable; if inactive → all editable
  const allEditable = job.status === "inactive" || job.status === "draft";

  const [title,                 setTitle]               = useState(job.title);
  const [description,           setDescription]         = useState(job.description);
  const [category,              setCategory]            = useState(job.category);
  const [budget,                setBudget]              = useState(String(job.budget));
  const [deadline,              setDeadline]            = useState(job.deadline);
  const [location,              setLocation]            = useState(job.location ?? "");
  const [gender,                setGender]              = useState(job.gender ?? "any");
  const [ageMin,                setAgeMin]              = useState(job.age_min ? String(job.age_min) : "");
  const [ageMax,                setAgeMax]              = useState(job.age_max ? String(job.age_max) : "");
  const [talentsRequired,       setTalentsRequired]     = useState(String(job.number_of_talents_required ?? 1));
  const [saving,                setSaving]              = useState(false);
  const [error,                 setError]               = useState("");
  const [saved,                 setSaved]               = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload: Record<string, unknown> = { deadline };

    if (allEditable) {
      payload.title       = title.trim();
      payload.description = description.trim();
      payload.category    = category;
      payload.budget      = Number(budget);
      payload.location    = location || null;
      payload.gender      = gender || null;
      payload.age_min     = ageMin  ? Number(ageMin)  : null;
      payload.age_max     = ageMax  ? Number(ageMax)  : null;
      payload.number_of_talents_required = Number(talentsRequired) || 1;
    }

    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (res.ok) {
      setSaved(true);
      setTimeout(() => router.push(`/agency/jobs/${job.id}`), 1000);
    } else {
      const d = await res.json();
      setError(d.error ?? "Falha ao salvar alterações.");
    }
  }

  const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-1.5";

  return (
    <div className="max-w-2xl space-y-8">

      {/* Header */}
      <div>
        <Link
          href={`/agency/jobs/${job.id}`}
          className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-zinc-700 transition-colors mb-4"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar para Vaga
        </Link>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Editar Vaga</h1>
        <p className="text-[13px] text-zinc-400 mt-1">
          {allEditable
            ? "Todos os campos podem ser editados."
            : "Esta vaga está ativa — apenas o prazo pode ser alterado."}
        </p>
      </div>

      {!allEditable && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-[13px] text-amber-800">
            Para editar todos os campos, defina o status da vaga como <strong>Inativa</strong> na lista de vagas primeiro.
          </p>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">

        {/* Title */}
        <div>
          <label className={labelCls}>Título da Vaga</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!allEditable}
            className={allEditable ? base : disabledBase}
            required={allEditable}
          />
        </div>

        {/* Description */}
        <div>
          <label className={labelCls}>Descrição</label>
          <textarea
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!allEditable}
            className={`${allEditable ? base : disabledBase} resize-none`}
          />
        </div>

        {/* Category + Budget */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={!allEditable}
              className={allEditable ? base : disabledBase}
            >
              <option value="">Selecionar categoria</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Orçamento (BRL)</label>
            <input
              type="number"
              min={1}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              disabled={!allEditable}
              className={allEditable ? base : disabledBase}
            />
          </div>
        </div>

        {/* Deadline — always editable */}
        <div>
          <label className={labelCls}>
            Prazo
            {!allEditable && <span className="ml-2 text-emerald-600 normal-case font-medium">(editável)</span>}
          </label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            required
            className={base}
          />
        </div>

        {/* Location */}
        <div>
          <label className={labelCls}>Localização</label>
          <input
            type="text"
            placeholder="Cidade, país ou 'Remoto'"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={!allEditable}
            className={allEditable ? base : disabledBase}
          />
        </div>

        {/* Gender + Age */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Gênero</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              disabled={!allEditable}
              className={allEditable ? base : disabledBase}
            >
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>{g === "any" ? "Qualquer" : g === "male" ? "Masculino" : "Feminino"}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Idade Mínima</label>
            <input
              type="number"
              min={1}
              placeholder="18"
              value={ageMin}
              onChange={(e) => setAgeMin(e.target.value)}
              disabled={!allEditable}
              className={allEditable ? base : disabledBase}
            />
          </div>
          <div>
            <label className={labelCls}>Idade Máxima</label>
            <input
              type="number"
              min={1}
              placeholder="60"
              value={ageMax}
              onChange={(e) => setAgeMax(e.target.value)}
              disabled={!allEditable}
              className={allEditable ? base : disabledBase}
            />
          </div>
        </div>

        {/* Talents required */}
        <div>
          <label className={labelCls}>Talentos Necessários</label>
          <input
            type="number"
            min={1}
            value={talentsRequired}
            onChange={(e) => setTalentsRequired(e.target.value)}
            disabled={!allEditable}
            className={allEditable ? base : disabledBase}
          />
        </div>

        {error && (
          <p className="text-[13px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        {saved && (
          <p className="text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            Alterações salvas. Redirecionando…
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Link
            href={`/agency/jobs/${job.id}`}
            className="flex-1 py-3 text-[14px] font-medium text-center border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving || saved}
            className="flex-1 py-3 text-[14px] font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? "Salvando…" : "Salvar Alterações"}
          </button>
        </div>
      </form>
    </div>
  );
}
