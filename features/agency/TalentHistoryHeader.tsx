"use client";

import { useT } from "@/lib/LanguageContext";

export default function TalentHistoryHeader({
  count,
  defaultJobId,
}: {
  count: number;
  defaultJobId?: string;
}) {
  const { t } = useT();
  return (
    <>
      <div className="rounded-[1.75rem] bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] px-6 py-6 text-white shadow-[0_8px_28px_rgba(26,188,156,0.28)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/80 mb-2">
          {t("talent_history_page_section")}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[2rem] font-black tracking-[-0.04em] leading-tight">{t("talent_history_page_title")}</h1>
            <p className="text-[13px] text-white/70 mt-2 max-w-2xl">
              {t("talent_history_page_desc")}
            </p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/15 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">{t("talent_history_count_label")}</p>
            <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-white">{count}</p>
          </div>
        </div>
      </div>

      {defaultJobId && (
        <div className="flex items-center gap-2.5 bg-[#D1F4EB] border border-[#A7E8D6] rounded-2xl px-5 py-3.5">
          <svg className="w-4 h-4 text-emerald-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[13px] text-emerald-900 font-semibold">
            {t("talent_history_invite_hint")}
          </p>
        </div>
      )}
    </>
  );
}
