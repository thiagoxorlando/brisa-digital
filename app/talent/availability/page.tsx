import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase.server";
import AvailabilityCalendar from "@/features/talent/AvailabilityCalendar";

export const metadata: Metadata = { title: "Availability — BrisaHub" };

export default async function AvailabilityPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900">Disponibilidade</h1>
        <p className="text-[14px] text-zinc-400">
          Selecione as datas no calendário e aplique sua disponibilidade pelo painel lateral.
        </p>
      </div>

      <AvailabilityCalendar talentId={user.id} />

      {/* Tip */}
      <p className="text-[12px] text-zinc-400 text-center leading-relaxed">
        Sua disponibilidade é visível para agências ao planejar contratações.
        Quanto mais atualizada, mais convites você recebe.
      </p>
    </div>
  );
}
