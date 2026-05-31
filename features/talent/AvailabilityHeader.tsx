"use client";
import { useT } from "@/lib/LanguageContext";

export default function AvailabilityHeader() {
  const { t, lang } = useT();
  return (
    <div className="space-y-1">
      <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900">{t("avail_title")}</h1>
      <p className="text-[14px] text-zinc-400">{t("avail_subtitle")}</p>
      <p className="text-[12px] text-zinc-400 pt-1 leading-relaxed">
        {lang === "en"
          ? "Your availability is visible to agencies when planning hires. The more updated it is, the more invites you receive."
          : "Sua disponibilidade é visível para agências ao planejar contratações. Quanto mais atualizada, mais convites você recebe."}
      </p>
    </div>
  );
}
