"use client";

import { useState } from "react";
import Logo from "@/components/Logo";

type Step = 1 | 2 | 3 | 4;

const SLIDES: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  body: string;
}[] = [
  {
    iconBg: "bg-indigo-50 border-indigo-100",
    title: "Publique vagas rapidamente",
    body: "Crie vagas detalhadas com categoria, orçamento e prazo. Os talentos cadastrados recebem notificação e podem se candidatar imediatamente.",
    icon: (
      <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    iconBg: "bg-emerald-50 border-emerald-100",
    title: "Escolha e confirme talentos",
    body: "Revise as candidaturas, selecione os talentos ideais e confirme os bookings. Tudo centralizado no seu painel de agência.",
    icon: (
      <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    iconBg: "bg-amber-50 border-amber-100",
    title: "Contratos e pagamentos via PIX",
    body: "Gere contratos digitais, assine eletronicamente e pague os talentos com um QR Code PIX direto na plataforma — simples e seguro.",
    icon: (
      <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
];

export default function OnboardingFlow() {
  const [step, setStep]   = useState<Step>(1);
  const [finishing, setFinishing] = useState(false);

  async function finish() {
    setFinishing(true);
    await fetch("/api/auth/complete-onboarding", { method: "POST" });
    const { getAgencyLanding } = await import("@/lib/getAgencyLanding");
    window.location.href = await getAgencyLanding();
  }

  // step 1 = welcome, steps 2-4 = feature slides (index 0-2)
  const slideIndex = step - 2;
  const isSlide    = step >= 2 && step <= 4;
  const slide      = isSlide ? SLIDES[slideIndex] : null;

  function Dots() {
    return (
      <div className="flex items-center gap-2 mb-8">
        {([1, 2, 3, 4] as const).map((s) => (
          <div
            key={s}
            className={[
              "h-1.5 rounded-full transition-all duration-300",
              s <= step ? "w-5 bg-zinc-900" : "w-2.5 bg-zinc-200",
            ].join(" ")}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4 py-12">

      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-10">
        <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-white border border-zinc-100">
          <Logo size="md" />
        </div>
        <span className="text-[16px] font-semibold tracking-tight text-zinc-900">Brisa Digital</span>
      </div>

      <div className="w-full max-w-md">

        {/* ── Step 1: Welcome ───────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-8">
            <Dots />
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-6">
              <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <h1 className="text-[1.5rem] font-semibold tracking-tight text-zinc-900 mb-2">
              Bem-vindo à Brisa Digital!
            </h1>
            <p className="text-[14px] text-zinc-500 leading-relaxed mb-8">
              Sua plataforma para contratar talentos de forma simples e rápida. Veja em poucos passos como a plataforma funciona.
            </p>
            <button
              onClick={() => setStep(2)}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white text-[14px] font-medium py-3 rounded-xl transition-colors"
            >
              Ver como funciona
            </button>
          </div>
        )}

        {/* ── Steps 2–4: Feature slides ─────────────────────────────────────── */}
        {slide && (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-8">
            <Dots />

            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center mb-6 ${slide.iconBg}`}>
              {slide.icon}
            </div>

            <h2 className="text-[1.25rem] font-semibold tracking-tight text-zinc-900 mb-2">
              {slide.title}
            </h2>
            <p className="text-[14px] text-zinc-500 leading-relaxed mb-8">
              {slide.body}
            </p>

            {step < 4 ? (
              <button
                onClick={() => setStep((step + 1) as Step)}
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white text-[14px] font-medium py-3 rounded-xl transition-colors"
              >
                Próximo
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={finishing}
                className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-[14px] font-medium py-3 rounded-xl transition-colors disabled:cursor-not-allowed"
              >
                {finishing ? "Carregando…" : "Ir para o Dashboard"}
              </button>
            )}

            {step > 1 && (
              <button
                onClick={() => setStep((step - 1) as Step)}
                className="w-full mt-3 text-[13px] text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                Voltar
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
