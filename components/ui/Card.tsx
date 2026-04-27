import { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: "none" | "sm" | "md" | "lg";
  variant?: "default" | "soft" | "dark";
};

const paddingClasses = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

const variantClasses = {
  default:
    "bg-white border border-[#DDE6E6] text-[#1F2D2E] shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)]",
  soft:
    "bg-[#F0F9F8] border border-[#DDE6E6] text-[#1F2D2E] shadow-[0_1px_4px_rgba(0,0,0,0.04)]",
  dark:
    "bg-[#1F2D2E] border border-white/10 text-white shadow-[0_24px_70px_rgba(0,0,0,0.18)]",
};

export default function Card({
  padding = "md",
  variant = "default",
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={[
        "rounded-[1.5rem]",
        variantClasses[variant],
        paddingClasses[padding],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}
