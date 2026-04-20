import type { Metadata } from "next";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase.from("jobs").select("title").eq("id", id).single();
  return { title: data ? `${data.title} — Admin — Brisa Digital` : "Job — Admin — Brisa Digital" };
}

function usd(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}
function fmt(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_STYLES: Record<string, string> = {
  open:     "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  closed:   "bg-zinc-100   text-zinc-500   ring-1 ring-zinc-200",
  draft:    "bg-amber-50   text-amber-700  ring-1 ring-amber-100",
  inactive: "bg-zinc-100   text-zinc-400   ring-1 ring-zinc-200",
};

export default async function AdminJobDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: job }, { data: submissions }, { data: contracts }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, description, category, budget, deadline, status, created_at, agency_id")
      .eq("id", id)
      .single(),
    supabase
      .from("submissions")
      .select("id, talent_user_id, status, mode, created_at")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("contracts")
      .select("id, talent_id, status, payment_amount, created_at")
      .eq("job_id", id),
  ]);

  if (!job) {
    return (
      <div className="max-w-2xl py-20 text-center">
        <p className="text-[14px] text-zinc-500">Job not found.</p>
        <Link href="/admin/jobs" className="mt-4 inline-block text-[13px] text-zinc-400 hover:text-zinc-700">← Back to Jobs</Link>
      </div>
    );
  }

  // Resolve talent names
  const talentIds = [...new Set(
    [...(submissions ?? []).map((s) => s.talent_user_id), ...(contracts ?? []).map((c) => c.talent_id)].filter(Boolean) as string[]
  )];
  const talentMap = new Map<string, string>();
  if (talentIds.length) {
    const { data: profiles } = await supabase.from("talent_profiles").select("id, full_name").in("id", talentIds);
    for (const p of profiles ?? []) talentMap.set(p.id, p.full_name ?? "Sem nome");
  }

  // Agency name
  let agencyName = "—";
  if (job.agency_id) {
    const { data: agency } = await supabase.from("agencies").select("company_name").eq("id", job.agency_id).single();
    agencyName = agency?.company_name ?? "—";
  }

  const stCls = STATUS_STYLES[job.status] ?? STATUS_STYLES["closed"];

  return (
    <div className="max-w-4xl space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px]">
        <Link href="/admin/jobs" className="text-zinc-400 hover:text-zinc-700 transition-colors">Vagas</Link>
        <span className="text-zinc-300">/</span>
        <span className="text-zinc-600 truncate">{job.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Admin da Plataforma</p>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">{job.title}</h1>
          <p className="text-[13px] text-zinc-400 mt-1">{agencyName} · Publicado em {fmt(job.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex text-[12px] font-semibold px-3 py-1.5 rounded-full capitalize ${stCls}`}>
            {job.status}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 bg-zinc-100 px-3 py-1.5 rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Somente leitura
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Job info */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Detalhes da Vaga</p>
            <p className="text-[14px] text-zinc-700 leading-relaxed whitespace-pre-line">{job.description || "Sem descrição."}</p>
          </div>

          {/* Submissions */}
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-50">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                Candidaturas <span className="ml-1 text-zinc-600">{submissions?.length ?? 0}</span>
              </p>
            </div>
            {(submissions ?? []).length === 0 ? (
              <p className="px-6 py-8 text-[13px] text-zinc-400 text-center">Nenhuma candidatura ainda.</p>
            ) : (
              <div className="divide-y divide-zinc-50">
                {(submissions ?? []).map((s) => {
                  const name = s.talent_user_id ? (talentMap.get(s.talent_user_id) ?? "Desconhecido") : "Externo";
                  return (
                    <div key={s.id} className="flex items-center justify-between px-6 py-3.5">
                      <div>
                        <p className="text-[13px] font-medium text-zinc-800">{name}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5 capitalize">{s.mode} · {fmt(s.created_at)}</p>
                      </div>
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500 capitalize">
                        {s.status ?? "pending"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Contracts */}
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-50">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                Contratos <span className="ml-1 text-zinc-600">{contracts?.length ?? 0}</span>
              </p>
            </div>
            {(contracts ?? []).length === 0 ? (
              <p className="px-6 py-8 text-[13px] text-zinc-400 text-center">Nenhum contrato ainda.</p>
            ) : (
              <div className="divide-y divide-zinc-50">
                {(contracts ?? []).map((c) => {
                  const name = c.talent_id ? (talentMap.get(c.talent_id) ?? "Desconhecido") : "Desconhecido";
                  const stMap: Record<string, string> = {
                    sent:     "bg-amber-50 text-amber-700",
                    accepted: "bg-emerald-50 text-emerald-700",
                    rejected: "bg-rose-50 text-rose-600",
                  };
                  return (
                    <div key={c.id} className="flex items-center justify-between px-6 py-3.5">
                      <div>
                        <p className="text-[13px] font-medium text-zinc-800">{name}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">Enviado em {fmt(c.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[13px] font-semibold text-zinc-900 tabular-nums">
                          {usd(c.payment_amount ?? 0)}
                        </span>
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${stMap[c.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                          {c.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: metadata */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-5 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Info</p>
            {[
              { label: "Agência",   value: agencyName },
              { label: "Categoria", value: job.category ?? "—" },
              { label: "Orçamento", value: job.budget ? usd(job.budget) : "—" },
              { label: "Prazo",     value: fmt(job.deadline) },
              { label: "Publicado", value: fmt(job.created_at) },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">{label}</p>
                <p className="text-[13px] font-medium text-zinc-800">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
