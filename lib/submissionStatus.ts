type StatusLang = "pt-BR" | "en";

const SUBMISSION_LABEL: Record<StatusLang, Record<string, string>> = {
  "pt-BR": {
    pending:   "Pendente",
    selected:  "Selecionado",
    approved:  "Aprovado",
    rejected:  "Recusado",
    cancelled: "Cancelada",
  },
  en: {
    pending:   "Pending",
    selected:  "Selected",
    approved:  "Approved",
    rejected:  "Rejected",
    cancelled: "Cancelled",
  },
};

const SUBMISSION_TONE: Record<string, string> = {
  pending:   "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  selected:  "bg-sky-50     text-sky-700     ring-1 ring-sky-100",
  approved:  "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  rejected:  "bg-zinc-100   text-zinc-400    ring-1 ring-zinc-200",
  cancelled: "bg-zinc-100   text-zinc-400    ring-1 ring-zinc-200",
};

export function submissionStatusLabel(status: string, lang: StatusLang = "en"): string {
  return SUBMISSION_LABEL[lang][status] ?? status;
}

export function submissionStatusTone(status: string): string {
  return SUBMISSION_TONE[status] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";
}
