"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserRole } from "@/lib/getUserRole";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getUserRole().then((role) => {
      if (role === "agency") router.replace("/agency/dashboard");
      else if (role === "talent") router.replace("/talent/dashboard");
      else setChecking(false);
    });
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-zinc-200 border-t-zinc-900 animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">

      {/* ── Nav ── */}
      <nav className="px-6 lg:px-10 h-16 flex items-center justify-between border-b border-zinc-100 sticky top-0 bg-white/90 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0">
            <img src="/logo.png" alt="Brisa Digital" className="w-full h-full object-contain" />
          </div>
          <span className="text-[15px] font-semibold text-zinc-900 tracking-tight">Brisa Digital</span>
        </div>
        <Link
          href="/login"
          className="text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors px-3 py-2 rounded-lg hover:bg-zinc-50"
        >
          Entrar
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-28 text-center">
        <div className="inline-flex items-center gap-2 bg-zinc-50 border border-zinc-200 text-zinc-500 text-[12px] font-semibold px-3.5 py-1.5 rounded-full mb-8 tracking-wide uppercase">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          Now in beta · Free to join
        </div>

        <h1 className="text-[3.25rem] sm:text-[4rem] lg:text-[4.5rem] font-bold text-zinc-900 tracking-[-0.04em] max-w-2xl leading-[1.05] mb-6">
          Connect talent with the right agencies
        </h1>

        <p className="text-[17px] text-zinc-500 max-w-lg leading-relaxed mb-10">
          A modern platform for agencies to discover, manage, and collaborate
          with creators — and for talent to get found.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <Link
            href="/signup?role=agency"
            className="bg-zinc-900 text-white px-6 py-3.5 rounded-xl text-[14px] font-semibold hover:bg-zinc-800 transition-all duration-150 active:scale-[0.98] shadow-sm"
          >
            Criar conta como Agência
          </Link>
          <Link
            href="/signup?role=talent"
            className="bg-white text-zinc-800 border border-zinc-200 px-6 py-3.5 rounded-xl text-[14px] font-semibold hover:bg-zinc-50 hover:border-zinc-300 transition-all duration-150 active:scale-[0.98]"
          >
            Entrar como Talento
          </Link>
        </div>

        <p className="mt-5 text-[12px] text-zinc-400 font-medium">
          No credit card required · Free for talent
        </p>
      </section>

      {/* ── Features ── */}
      <section className="px-6 lg:px-10 py-20 bg-zinc-50 border-t border-zinc-100">
        <div className="max-w-5xl mx-auto">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 text-center mb-3">
            Platform
          </p>
          <h2 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 text-center mb-12">
            Everything you need to manage talent
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                title: "For Agencies",
                description:
                  "Build and manage your talent roster. Create detailed profiles, track reach, and collaborate efficiently with brands.",
                icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                ),
                accent: "bg-indigo-50 text-indigo-500",
              },
              {
                title: "For Talent",
                description:
                  "Create your public creator profile, showcase your social presence, and get discovered by top agencies worldwide.",
                icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                ),
                accent: "bg-violet-50 text-violet-500",
              },
              {
                title: "Built for speed",
                description:
                  "Set up your profile in minutes. Our streamlined onboarding gets you in front of the right people fast.",
                icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                      d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                ),
                accent: "bg-emerald-50 text-emerald-500",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-white rounded-2xl border border-zinc-100 p-7 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.04)] transition-shadow duration-200 flex flex-col gap-4"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${item.accent}`}>
                  {item.icon}
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-zinc-900 mb-1.5">{item.title}</h3>
                  <p className="text-[13px] text-zinc-500 leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="px-6 lg:px-10 py-6 border-t border-zinc-100">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded overflow-hidden">
              <img src="/logo.png" alt="Brisa Digital" className="w-full h-full object-contain" />
            </div>
            <span className="text-[13px] font-semibold text-zinc-700">Brisa Digital</span>
          </div>
          <p className="text-[12px] text-zinc-400">© 2026 Brisa Digital. Todos os direitos reservados.</p>
        </div>
      </footer>

    </main>
  );
}
