export type ReliabilityLevel = "trusted" | "good" | "caution";

export type ReliabilityInfo = {
  level: ReliabilityLevel;
  label: string;
  pct: number;
  completed: number;
  cancelled: number;
};

export function getReliability(
  completed: number,
  cancelled: number,
): ReliabilityInfo | null {
  const total = completed + cancelled;
  if (total === 0) return null;
  const pct = completed / total;
  if (pct >= 0.9) return { level: "trusted", label: "Confiável",     pct, completed, cancelled };
  if (pct >= 0.7) return { level: "good",    label: "Bom histórico", pct, completed, cancelled };
  return              { level: "caution",  label: "Atenção",       pct, completed, cancelled };
}

// Returns 0 = reliable/good, 1 = unknown, 2 = caution — for sort ordering
export function reliabilitySortScore(completed: number, cancelled: number): number {
  const info = getReliability(completed, cancelled);
  if (!info)                 return 1;
  if (info.level === "caution") return 2;
  return 0;
}
