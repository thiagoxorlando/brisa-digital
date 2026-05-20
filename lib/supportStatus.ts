/**
 * Shared support conversation status helpers.
 * Single source of truth for support ticket status labels and badge classes.
 */

const SUPPORT_STATUS_LABEL: Record<string, string> = {
  open:          "Aberta",
  waiting_admin: "Aguardando suporte",
  waiting_user:  "Aguardando usuário",
  closed:        "Encerrada",
};

/** User-facing variant: "waiting_user" reads "Aguardando você" instead of "Aguardando usuário". */
const SUPPORT_STATUS_LABEL_USER: Record<string, string> = {
  ...SUPPORT_STATUS_LABEL,
  waiting_user: "Aguardando você",
};

const SUPPORT_STATUS_TONE: Record<string, string> = {
  open:          "bg-emerald-50  text-emerald-700  ring-1 ring-emerald-100",
  waiting_admin: "bg-amber-50    text-amber-700    ring-1 ring-amber-100",
  waiting_user:  "bg-teal-50     text-teal-700     ring-1 ring-teal-100",
  closed:        "bg-zinc-100    text-zinc-500     ring-1 ring-zinc-200",
};

const SUPPORT_PRIORITY_LABEL: Record<string, string> = {
  low:    "Baixa",
  normal: "Normal",
  high:   "Alta",
  urgent: "Urgente",
};

const SUPPORT_PRIORITY_TONE: Record<string, string> = {
  low:    "bg-zinc-100   text-zinc-500",
  normal: "bg-zinc-100   text-zinc-600",
  high:   "bg-orange-50  text-orange-600",
  urgent: "bg-rose-50    text-rose-600",
};

type SupportAudience = "admin" | "user";

export function supportStatusLabel(status: string, audience: SupportAudience = "admin"): string {
  const map = audience === "user" ? SUPPORT_STATUS_LABEL_USER : SUPPORT_STATUS_LABEL;
  return map[status] ?? status;
}

export function supportStatusTone(status: string): string {
  return SUPPORT_STATUS_TONE[status] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";
}

export function supportPriorityLabel(priority: string): string {
  return SUPPORT_PRIORITY_LABEL[priority] ?? priority;
}

export function supportPriorityTone(priority: string): string {
  return SUPPORT_PRIORITY_TONE[priority] ?? "bg-zinc-100 text-zinc-500";
}
