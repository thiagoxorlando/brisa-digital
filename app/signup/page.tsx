"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";

type Role = "agency" | "talent";
type Plan = "free" | "pro" | "premium";

const ROLE_HOME: Record<Role, string> = {
  agency: "/agency/dashboard",
  talent: "/talent/dashboard",
};

const ROLE_LABELS: Record<Role, { title: string; sub: string }> = {
  agency: { title: "Criar conta como Agência", sub: "Publique vagas e gerencie talentos." },
  talent: { title: "Criar conta como Talento", sub: "Candidate-se a vagas e seja contratado." },
};

const PLANS: { id: Plan; name: string; price: string; features: string[]; highlight?: boolean }[] = [
  {
    id: "free",
    name: "Gratuito",
    price: "R$0/mês",
    features: [
      "Até 1 vaga ativa",
      "Até 3 contratações por vaga",
      "Uso básico do sistema",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "R$247/mês",
    highlight: true,
    features: [
      "Vagas ilimitadas",
      "Contratações ilimitadas",
      "Controle completo da equipe",
      "Histórico de pagamentos e contratos",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: "Sob consulta",
    features: [
      "Tudo do Pro",
      "Ambiente privado",
      "Controle avançado de equipe",
    ],
  },
];

function SignupPageContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const role         = (searchParams.get("role") ?? "agency") as Role;
  const refToken     = searchParams.get("ref") ?? null;
  const label        = ROLE_LABELS[role] ?? ROLE_LABELS.agency;
  const initialPlan  = (["free", "pro"].includes(searchParams.get("plan") ?? "") ? searchParams.get("plan") : "free") as Plan;

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [plan,     setPlan]     = useState<Plan>(initialPlan);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // 1. Create user
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError || !data.user) {
      setError(signUpError?.message ?? "Falha ao criar conta. Tente novamente.");
      setLoading(false);
      return;
    }

    // 2. Insert profile with role
    const profileRes = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: data.user.id, role }),
    });

    if (!profileRes.ok) {
      setError("Conta criada mas a configuração do perfil falhou. Entre em contato com o suporte.");
      setLoading(false);
      return;
    }

    // 3. For agency: always start on free — upgrade happens post-signup
    if (role === "agency") {
      await fetch("/api/auth/agency-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: data.user.id, plan: "free" }),
      });
    }

    // 4. Link referral if present
    if (refToken) {
      await fetch("/api/referrals/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: refToken, user_id: data.user.id }),
      });
    }

    // 5. Redirect to profile setup
    router.push("/setup-profile");
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">

        {/* Logo */}
        <div className="flex items-center justify-center mb-10">
          <Logo size="lg" />
        </div>

        {/* Plan selector — agency only */}
        {role === "agency" && (
          <div className="mb-6">
            <p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-400 text-center mb-4">
              Escolha seu plano
            </p>
            <p className="text-[12px] text-zinc-400 text-center mb-3">
              Comece grátis — sem cartão. Upgrade a qualquer momento.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlan(p.id)}
                  className={[
                    "text-left px-4 py-4 rounded-2xl border-2 transition-all duration-150 cursor-pointer",
                    plan === p.id
                      ? p.highlight
                        ? "border-[#1F2D2E] bg-[#1F2D2E] text-white shadow-lg"
                        : "border-zinc-900 bg-white shadow-sm"
                      : "border-zinc-200 bg-white hover:border-zinc-300",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className={`text-[13px] font-semibold ${plan === p.id && p.highlight ? "text-white" : "text-zinc-900"}`}>
                      {p.name}
                    </span>
                    {p.highlight && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${plan === p.id ? "bg-white/20 text-white" : "bg-[#1F2D2E] text-white"}`}>
                        POPULAR
                      </span>
                    )}
                  </div>
                  <p className={`text-[12px] font-semibold mb-2 ${plan === p.id && p.highlight ? "text-white/80" : "text-zinc-500"}`}>
                    {p.price}
                  </p>
                  <ul className="space-y-0.5">
                    {p.features.slice(0, 3).map((f) => (
                      <li key={f} className={`flex items-center gap-1.5 text-[11px] ${plan === p.id && p.highlight ? "text-white/70" : "text-zinc-400"}`}>
                        <svg className={`w-3 h-3 flex-shrink-0 ${plan === p.id && p.highlight ? "text-white/60" : "text-emerald-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-8">

          <div className="mb-7">
            <h1 className="text-[1.25rem] font-semibold tracking-tight text-zinc-900 mb-1">
              {label.title}
            </h1>
            <p className="text-[13px] text-zinc-400">{label.sub}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">


            <div>
              <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">Email</label>
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
              <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">Senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mín. 6 caracteres"
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
              className="w-full bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-medium py-3 rounded-xl transition-colors cursor-pointer active:scale-[0.99]"
            >
              {loading ? "Criando conta…" : "Criar conta"}
            </button>
          </form>
        </div>

        <p className="text-center text-[13px] text-zinc-400 mt-5">
          Já tem uma conta?{" "}
          <Link href="/login" className="text-zinc-700 font-medium hover:text-zinc-900 transition-colors">
            Entrar
          </Link>
        </p>

      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}

