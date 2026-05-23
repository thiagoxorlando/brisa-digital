export type JobVisibilityValue =
  | "public"
  | "private"
  | "private_invite"
  | "private_portal"
  | "workspace_only"
  | (string & {});

export type JobDestination = "open_space" | "premium_portal" | "private_invite";

type VisibilityContext = "auto" | "premium" | "open_space";

type JobVisibilityInput = {
  visibility: JobVisibilityValue | null | undefined;
  workspaceId?: string | null | undefined;
  context?: VisibilityContext;
};

type JobDestinationInput = {
  visibility: JobVisibilityValue | null | undefined;
  workspaceId?: string | null | undefined;
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

export function resolveJobDestination({
  visibility,
  workspaceId,
}: JobDestinationInput): JobDestination {
  if (!workspaceId) return "open_space";
  if (visibility === "private_invite") return "private_invite";
  return "premium_portal";
}

export function formatJobDestinationLabel(input: JobDestinationInput) {
  const destination = resolveJobDestination(input);

  if (destination === "open_space") return "Publicar no Open Space";
  if (destination === "premium_portal") return "Visível no portal Premium";
  return "Privada por convite";
}

export function formatJobDestinationDescription(input: JobDestinationInput) {
  const destination = resolveJobDestination(input);

  if (destination === "open_space") {
    return "Aparece para todos os talentos da plataforma.";
  }
  if (destination === "premium_portal") {
    return "Aparece para talentos convidados/aprovados deste workspace.";
  }
  return "Somente talentos com convite ou link privado podem acessar.";
}

export function formatJobScopeLabel(input: JobDestinationInput) {
  return input.workspaceId ? "Premium" : "Open Space";
}

export function formatJobVisibilityLabel(input: JobVisibilityInput) {
  const context = resolveVisibilityContext(input);

  if (context === "premium") {
    return formatJobDestinationLabel({
      visibility: input.visibility,
      workspaceId: input.workspaceId,
    });
  }

  if (input.visibility === "private_invite") return "Privada por convite";
  if (input.visibility === "private") return "Privada";
  return "Pública";
}

export function formatJobVisibilityDescription(input: JobVisibilityInput) {
  const context = resolveVisibilityContext(input);

  if (context === "premium") {
    return formatJobDestinationDescription({
      visibility: input.visibility,
      workspaceId: input.workspaceId,
    });
  }

  if (input.visibility === "private_invite") {
    return "Somente talentos com convite ou link privado podem acessar.";
  }
  if (input.visibility === "private") {
    return "Disponível apenas para talentos convidados.";
  }
  return "Aparece para talentos da plataforma.";
}
