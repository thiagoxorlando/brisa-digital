type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "dark" | "muted" | "accent";

type BadgeProps = {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
};

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-[#E6F0F0] text-[#647B7B] ring-1 ring-[#DDE6E6]",
  success: "bg-[#D1F4EB] text-[#0A7A5A] ring-1 ring-[#A7E8D6]/60",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80",
  danger:  "bg-red-50 text-red-700 ring-1 ring-red-200/80",
  info:    "bg-[#D6F2F7] text-[#0E7C86] ring-1 ring-[#A8DDED]/60",
  dark:    "bg-[#1F2D2E] text-white ring-1 ring-white/10",
  muted:   "bg-[#E6F0F0] text-[#647B7B] ring-1 ring-[#DDE6E6]",
  accent:  "bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] text-white ring-0",
};

export default function Badge({
  children,
  variant = "default",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
