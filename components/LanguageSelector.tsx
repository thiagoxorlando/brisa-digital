"use client";

import { useT } from "@/lib/LanguageContext";
import { LANGS, type Lang } from "@/lib/i18n/index";

type Variant = "dark" | "light";

const LABELS: Record<Lang, string> = {
  "pt-BR": "PT",
  "en":    "EN",
};

/**
 * Segmented pill language switch.
 *
 * variant="dark"  — for dark backgrounds (landing page, login, signup)
 * variant="light" — for light backgrounds (Topbar)
 */
export default function LanguageSelector({ variant = "dark" }: { variant?: Variant }) {
  const { lang, setLang } = useT();
  const isDark = variant === "dark";

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-xl p-0.5 ${
        isDark ? "bg-white/10" : "bg-zinc-100"
      }`}
      role="group"
      aria-label="Select language"
    >
      {LANGS.map((l: Lang) => {
        const isActive = lang === l;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={isActive}
            className={[
              "px-2.5 py-1 rounded-[10px] text-[12px] font-semibold transition-all leading-none",
              isActive
                ? isDark
                  ? "bg-white text-[#1F2D2E] shadow-sm"
                  : "bg-[#1ABC9C] text-white shadow-sm"
                : isDark
                  ? "text-white/50 hover:text-white/80 cursor-pointer"
                  : "text-zinc-400 hover:text-zinc-700 cursor-pointer",
            ].join(" ")}
          >
            {LABELS[l]}
          </button>
        );
      })}
    </div>
  );
}
