"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";
import { getAgencyLanding } from "@/lib/getAgencyLanding";

const ROLE_HOME: Record<string, string> = {
  talent: "/talent/dashboard",
  admin:  "/admin/dashboard",
};

export default function LoginPage() {
  const router = useRouter();

  const [email,          setEmail]          = useState("");
  const [password,       setPassword]       = useState("");
  const [error,          setError]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [showRoleChoice, setShowRoleChoice] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !data.user) {
      setError(authError?.message ?? "Falha ao entrar.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, onboarding_completed")
      .eq("id", data.user.id)
      .single();

    let destination: string;

    if (profile?.role === "agency") {
      if (profile.onboarding_completed === false) {
        destination = "/onboarding";
      } else {
        destination = await getAgencyLanding(data.user.id);
      }
    } else {
      destination = profile?.role ? ROLE_HOME[profile.role] : "/onboarding/role";
    }

    router.push(destination);
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center mb-10">
          <Logo size="2xl" />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-8">
          <h1 className="text-[1.25rem] font-semibold tracking-tight text-zinc-900 mb-1">
            Entrar
          </h1>
          <p className="text-[13px] text-zinc-400 mb-7">
            Digite suas credenciais para continuar.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 text-[14px] rounded-xl border border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">
                Senha
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 text-[14px] rounded-xl border border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
              />
            </div>

            {error && (
              <p className="text-[13px] text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-[14px] font-medium py-3 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed active:scale-[0.99]"
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </div>

        <div className="mt-5 text-center">
          <p className="text-[13px] text-zinc-400">
            Não tem uma conta?{" "}
            <button
              type="button"
              onClick={() => setShowRoleChoice((v) => !v)}
              className="text-zinc-700 font-medium hover:text-zinc-900 transition-colors cursor-pointer"
            >
              Criar conta
            </button>
          </p>
          {showRoleChoice && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href="/signup?role=agency"
                className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl border border-zinc-200 hover:border-zinc-900 hover:bg-zinc-50 transition-colors"
              >
                <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className="text-[13px] font-semibold text-zinc-900">Agência</span>
                <span className="text-[11px] text-zinc-400">Publique vagas</span>
              </Link>
              <Link
                href="/signup?role=talent"
                className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl border border-zinc-200 hover:border-zinc-900 hover:bg-zinc-50 transition-colors"
              >
                <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-[13px] font-semibold text-zinc-900">Talento</span>
                <span className="text-[11px] text-zinc-400">Candidate-se</span>
              </Link>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
