"use client";

import { useState, useEffect } from "react";

export type FeatureGuideCardProps = {
  /** Unique ID — used to persist dismissal in localStorage */
  id: string;
  title: string;
  description: string;
  /** Optional action label + href */
  actionLabel?: string;
  actionHref?: string;
  /** Icon variant */
  icon?: "lightbulb" | "link" | "shield" | "wallet" | "inbox" | "rocket";
  className?: string;
};

const ICONS: Record<NonNullable<FeatureGuideCardProps["icon"]>, React.ReactNode> = {
  lightbulb: (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  link: (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  shield: (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  wallet: (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  inbox: (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  ),
  rocket: (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  ),
};

const STORAGE_KEY_PREFIX = "brisahub_guide_dismissed_";

export default function FeatureGuideCard({
  id,
  title,
  description,
  actionLabel,
  actionHref,
  icon = "lightbulb",
  className = "",
}: FeatureGuideCardProps) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const key = `${STORAGE_KEY_PREFIX}${id}`;
    setDismissed(localStorage.getItem(key) === "1");
  }, [id]);

  function dismiss() {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, "1");
    setDismissed(true);
  }

  if (!mounted || dismissed) return null;

  return (
    <div className={`relative flex items-start gap-3 bg-teal-50 border border-teal-200/80 rounded-2xl px-4 py-3.5 ${className}`}>
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-teal-600 mt-0.5">
        {ICONS[icon]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-teal-900">{title}</p>
        <p className="text-[12px] text-teal-700 mt-0.5 leading-relaxed">{description}</p>
        {actionLabel && actionHref && (
          <a
            href={actionHref}
            className="inline-block mt-2 text-[12px] font-bold text-teal-700 hover:text-teal-900 underline"
          >
            {actionLabel} →
          </a>
        )}
      </div>
      <button
        onClick={dismiss}
        type="button"
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-teal-400 hover:text-teal-700 hover:bg-teal-100 transition-colors cursor-pointer mt-0.5"
        aria-label="Fechar dica"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
