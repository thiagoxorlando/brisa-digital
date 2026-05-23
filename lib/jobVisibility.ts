type JobVisibilityValue =
  | "public"
  | "private"
  | "private_invite"
  | "private_portal"
  | "workspace_only"
  | (string & {});

type VisibilityContext = "auto" | "premium" | "open_space";

type JobVisibilityInput = {
  visibility: JobVisibilityValue | null | undefined;
  workspaceId?: string | null | undefined;
  context?: VisibilityContext;
};

function resolveVisibilityContext({
  workspaceId,
  context = "auto",
}: Pick<JobVisibilityInput, "workspaceId" | "context">) {
  if (context !== "auto") return context;
  return workspaceId ? "premium" : "open_space";
}

export function isPremiumWorkspaceJob(workspaceId: string | null | undefined) {
  return Boolean(workspaceId);
}

export function isPremiumPortalVisibleJob({
  visibility,
  workspaceId,
}: Pick<JobVisibilityInput, "visibility" | "workspaceId">) {
  if (!workspaceId) return false;
  return visibility === "public" || visibility === "private_portal" || visibility === "workspace_only";
}

export function isPremiumInviteOnlyJob({
  visibility,
  workspaceId,
}: Pick<JobVisibilityInput, "visibility" | "workspaceId">) {
  return Boolean(workspaceId) && visibility === "private_invite";
}

export function formatJobVisibilityLabel(input: JobVisibilityInput) {
  const context = resolveVisibilityContext(input);

  if (context === "premium") {
    if (isPremiumInviteOnlyJob(input)) return "Privada por convite";
    if (isPremiumPortalVisibleJob(input)) return "Visivel no portal Premium";
  }

  if (input.visibility === "private_invite") return "Privada por convite";
  if (input.visibility === "private") return "Privada";
  return "Publica";
}

export function formatJobVisibilityDescription(input: JobVisibilityInput) {
  const context = resolveVisibilityContext(input);

  if (context === "premium") {
    if (isPremiumInviteOnlyJob(input)) {
      return "Somente talentos com convite ou link privado podem acessar.";
    }
    if (isPremiumPortalVisibleJob(input)) {
      return "Aparece para talentos convidados/aprovados deste workspace.";
    }
  }

  if (input.visibility === "private_invite") {
    return "Somente talentos com convite ou link privado podem acessar.";
  }
  if (input.visibility === "private") {
    return "Disponivel apenas para talentos convidados.";
  }
  return "Aparece para talentos da plataforma.";
}
