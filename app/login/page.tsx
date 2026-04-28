"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";
import { getAgencyLanding } from "@/lib/getAgencyLanding";

const ROLE_HOME: Record<string, string> = {
  talent: "/talent/dashboard",
  admin:  "/admin/dashboard",
};

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const refToken = searchParams.get("ref")?.trim() || null;
  const jobId = searchParams.get("job")?.trim() || null;
  const nextPath = safeNextPath(searchParams.get("next")) ?? (jobId ? `/talent/jobs/${jobId}` : null);

  const [email,          setEmail]          = useState("");
  const [password,       setPassword]       = useState("");
  const [error,          setError]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [showRoleChoice, setShowRoleChoice] = useState(false);

  function talentSignupHref() {
    const params = new URLSearchParams({ role: "talent" });
    if (refToken) params.set("ref", refToken);
    if (jobId) params.set("job", jobId);
    if (nextPath) params.set("next", nextPath);
    return `/signup?${params.toString()}`;
  }

  async function linkReferral(userId: string) {
    if (!refToken) return;

    await fetch("/api/referrals/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: refToken, user_id: userId }),
    });
  }

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
    } else if (profile?.role === "talent") {
      await linkReferral(data.user.id);
      destination = profile.onboarding_completed === false
        ? (nextPath ? `/setup-profile?next=${encodeURIComponent(nextPath)}` : "/setup-profile")
        : (nextPath ?? ROLE_HOME.talent);
    } else {
      destination = "/onboarding/role";
    }

    window.location.assign(destination);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center mb-10">
          <Logo size="2xl" />
        </div>

        {/* Card */}
        <div className="card p-8">
          <h1 className="text-[1.25rem] font-semibold tracking-tight text-[#1F2D2E] mb-1">
            Entrar
          </h1>
          <p className="text-[13px] text-[#647B7B] mb-7">
            Digite suas credenciais para continuar.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-[#647B7B] mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="input-base"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#647B7B] mb-1.5">
                Senha
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="input-base"
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
              className="w-full btn-primary py-3 text-[14px] cursor-pointer active:scale-[0.99]"
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </div>

        <div className="mt-5 text-center">
          <p className="text-[13px] text-[#647B7B]">
            Não tem uma conta?{" "}
            <button
              type="button"
              onClick={() => setShowRoleChoice((value) => !value)}
              className="text-[#1ABC9C] font-medium hover:text-[#0E7C86] transition-colors cursor-pointer"
            >
              Criar conta
            </button>
          </p>
          {showRoleChoice && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href="/signup?role=agency"
                className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl border border-[#DDE6E6] hover:border-[#1ABC9C] hover:bg-[#F8FAFC] transition-colors"
              >
                <svg className="w-4 h-4 text-[#1ABC9C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className="text-[13px] font-semibold text-[#1F2D2E]">Agência</span>
                <span className="text-[11px] text-[#647B7B]">Publique vagas</span>
              </Link>
              <Link
                href={talentSignupHref()}
                className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl border border-[#DDE6E6] hover:border-[#1ABC9C] hover:bg-[#F8FAFC] transition-colors"
              >
                <svg className="w-4 h-4 text-[#1ABC9C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-[13px] font-semibold text-[#1F2D2E]">Talento</span>
                <span className="text-[11px] text-[#647B7B]">Candidate-se</span>
              </Link>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
