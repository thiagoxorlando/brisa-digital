"use client";

import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
};

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] text-white hover:from-[#17A58A] hover:to-[#22B5C2] active:scale-[0.98] border border-transparent shadow-[0_8px_20px_rgba(26,188,156,0.28)]",
  secondary:
    "bg-white text-[#1F2D2E] border border-[#DDE6E6] hover:bg-[#E6F0F0] hover:border-[#B8D4D4] active:scale-[0.98] shadow-sm",
  ghost:
    "bg-transparent text-[#647B7B] hover:bg-[#E6F0F0] hover:text-[#1F2D2E] border border-transparent",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] border border-transparent shadow-sm",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3.5 py-2 text-[13px] gap-1.5",
  md: "px-4 py-2.5 text-[13px] gap-2",
  lg: "px-5 py-3 text-[15px] gap-2",
};

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 cursor-pointer",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
