export type SpaceFilter = "all" | "open" | "premium";

export const SPACE_FILTER_LABELS: Record<SpaceFilter, string> = {
  all:     "Todos",
  open:    "Open Space",
  premium: "Premium",
};

export function matchesSpaceFilter(
  workspaceId: string | null | undefined,
  filter: SpaceFilter,
): boolean {
  if (filter === "premium") return !!workspaceId;
  if (filter === "open")    return !workspaceId;
  return true;
}
