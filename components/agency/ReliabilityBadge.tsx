import { getReliability } from "@/lib/reliability";

const BADGE_CLS = {
  trusted: "bg-emerald-50 text-emerald-700 border-emerald-100",
  good:    "bg-amber-50   text-amber-700   border-amber-100",
  caution: "bg-rose-50    text-rose-600    border-rose-100",
};

const DOT_CLS = {
  trusted: "bg-emerald-500",
  good:    "bg-amber-400",
  caution: "bg-rose-400",
};

interface Props {
  completed: number;
  cancelled: number;
  showStats?: boolean;
}

export default function ReliabilityBadge({ completed, cancelled, showStats = false }: Props) {
  const info = getReliability(completed, cancelled);
  if (!info) return null;

  const statLine = [
    `${completed} ${completed === 1 ? "trabalho concluído" : "trabalhos concluídos"}`,
    cancelled > 0
      ? `${cancelled} ${cancelled === 1 ? "cancelamento" : "cancelamentos"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${BADGE_CLS[info.level]}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_CLS[info.level]}`} />
        {info.label}
      </span>
      {showStats && (
        <span className="text-[11px] text-zinc-400">{statLine}</span>
      )}
    </div>
  );
}
