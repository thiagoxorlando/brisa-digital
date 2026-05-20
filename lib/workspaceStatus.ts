/**
 * Shared Premium workspace and agent member status helpers.
 * Single source of truth for workspace lifecycle and agent membership status labels/tones.
 */

// ── Workspace lifecycle ────────────────────────────────────────────────────────

const WORKSPACE_STATUS_LABEL: Record<string, string> = {
  active:    "Ativo",
  suspended: "Suspenso",
  cancelled: "Cancelado",
  deleted:   "Excluído",
};

const WORKSPACE_STATUS_TONE: Record<string, string> = {
  active:    "bg-emerald-50 text-emerald-700 border-emerald-100",
  suspended: "bg-amber-50   text-amber-700   border-amber-100",
  cancelled: "bg-zinc-100   text-zinc-500    border-zinc-200",
  deleted:   "bg-red-50     text-red-600     border-red-100",
};

export function workspaceStatusLabel(status: string): string {
  return WORKSPACE_STATUS_LABEL[status] ?? status;
}

export function workspaceStatusTone(status: string): string {
  return WORKSPACE_STATUS_TONE[status] ?? "bg-zinc-100 text-zinc-500 border-zinc-200";
}

// ── Agent member status ────────────────────────────────────────────────────────

const AGENT_STATUS_LABEL: Record<string, string> = {
  active:    "Ativo",
  suspended: "Suspenso",
  removed:   "Removido",
  owner:     "Proprietário",
};

const AGENT_STATUS_TONE: Record<string, string> = {
  active:    "bg-emerald-50 text-emerald-700 border-emerald-100",
  suspended: "bg-amber-50   text-amber-700   border-amber-100",
  removed:   "bg-zinc-100   text-zinc-500    border-zinc-200",
  owner:     "bg-amber-50   text-amber-600   border-amber-100",
};

export function agentStatusLabel(status: string): string {
  return AGENT_STATUS_LABEL[status] ?? status;
}

export function agentStatusTone(status: string): string {
  return AGENT_STATUS_TONE[status] ?? "bg-zinc-100 text-zinc-500 border-zinc-200";
}
