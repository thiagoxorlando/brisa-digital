import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import AvailabilityCalendar from "@/features/talent/AvailabilityCalendar";

export const metadata: Metadata = { title: "Disponibilidade — Brisa Digital" };

export default async function AvailabilityPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");

  const today   = new Date().toISOString().slice(0, 10);
  const supabase = createServerClient({ useServiceRole: true });

  const { data: todayEntry } = await supabase
    .from("talent_availability")
    .select("is_available, start_time, end_time")
    .eq("talent_id", user.id)
    .eq("date", today)
    .single();

  const availToday = todayEntry?.is_available;

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900">Disponibilidade</h1>
        <p className="text-[14px] text-zinc-400">
          Marque os dias em que você está disponível para trabalhar.
        </p>
      </div>

      {/* Today's status banner */}
      <div className={[
        "flex items-center gap-3 rounded-2xl px-5 py-4 border",
        availToday === true
          ? "bg-emerald-50 border-emerald-100"
          : availToday === false
            ? "bg-zinc-50 border-zinc-100"
            : "bg-violet-50 border-violet-100",
      ].join(" ")}>
        <div className={[
          "w-2.5 h-2.5 rounded-full flex-shrink-0",
          availToday === true  ? "bg-emerald-500" :
          availToday === false ? "bg-zinc-400"    : "bg-violet-400",
        ].join(" ")} />
        <div className="flex-1 min-w-0">
          {availToday === true ? (
            <>
              <p className="text-[13px] font-semibold text-emerald-800">
                Você está disponível hoje
                {todayEntry?.start_time && (
                  <span className="font-normal text-emerald-600">
                    {" "}· {todayEntry.start_time.slice(0, 5)}
                    {todayEntry.end_time && `–${todayEntry.end_time.slice(0, 5)}`}
                  </span>
                )}
              </p>
              <p className="text-[12px] text-emerald-600 mt-0.5">
                Agências podem ver sua disponibilidade e entrar em contato.
              </p>
            </>
          ) : availToday === false ? (
            <>
              <p className="text-[13px] font-semibold text-zinc-600">Você está indisponível hoje</p>
              <p className="text-[12px] text-zinc-400 mt-0.5">Altere no calendário abaixo.</p>
            </>
          ) : (
            <>
              <p className="text-[13px] font-semibold text-violet-700">
                Marque sua disponibilidade para hoje
              </p>
              <p className="text-[12px] text-violet-500 mt-0.5">
                Agências priorizam talentos com disponibilidade informada.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-3xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_8px_32px_rgba(0,0,0,0.06)] p-6">
        <AvailabilityCalendar talentId={user.id} />
      </div>

      {/* Tip */}
      <p className="text-[12px] text-zinc-400 text-center leading-relaxed">
        Sua disponibilidade é visível para agências ao planejar contratações.
        Quanto mais atualizada, mais convites você recebe.
      </p>
    </div>
  );
}
