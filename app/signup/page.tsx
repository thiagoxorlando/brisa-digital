"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Role = "agency" | "talent";
type Plan = "pro";

const ROLE_HOME: Record<Role, string> = {
  agency: "/agency/dashboard",
  talent: "/talent/dashboard",
};

const ROLE_LABELS: Record<Role, { title: string; sub: string }> = {
  agency: { title: "Create Agency Account", sub: "Post jobs and manage talent." },
  talent: { title: "Join as Talent",        sub: "Apply for jobs and get booked." },
};

const PRO_PLAN = {
  name: "Pro Plan",
  price: "$2,500/mo",
  features: [
    "Unlimited active jobs",
    "Full casting & contract management",
    "Talent media submissions",
    "Advanced analytics",
    "Priority support",
  ],
};

export default function SignupPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const role         = (searchParams.get("role") ?? "agency") as Role;
  const label        = ROLE_LABELS[role] ?? ROLE_LABELS.agency;

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [plan]     = useState<Plan>("pro");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // 1. Create user
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError || !data.user) {
      setError(signUpError?.message ?? "Signup failed. Please try again.");
      setLoading(false);
      return;
    }

    // 2. Insert profile with role (via server route to bypass RLS)
    const profileRes = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: data.user.id, role }),
    });

    if (!profileRes.ok) {
      const { error: profileError } = await profileRes.json();
      console.error("Profile insert failed:", profileError);
      setError("Account created but profile setup failed. Please contact support.");
      setLoading(false);
      return;
    }

    // 3. For agency: save plan selection
    if (role === "agency") {
      await fetch("/api/auth/agency-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: data.user.id, plan }),
      });
    }

    // 4. Redirect to profile setup
    router.push("/setup-profile");
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-8 h-8 bg-zinc-900 rounded-xl flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <span className="text-[16px] font-semibold tracking-tight text-zinc-900">ucastanet</span>
        </div>

        {/* Agency plan — Pro only */}
        {role === "agency" && (
          <div className="mb-6">
            <p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-400 text-center mb-4">
              Your plan
            </p>
            <div className="w-full text-left px-5 py-4 rounded-2xl border-2 border-zinc-900 bg-white shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[15px] font-semibold text-zinc-900">{PRO_PLAN.name}</span>
                <span className="text-[14px] font-semibold text-zinc-700">{PRO_PLAN.price}</span>
              </div>
              <ul className="space-y-1">
                {PRO_PLAN.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[12px] text-zinc-500">
                    <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
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
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
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
              className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white text-[14px] font-medium py-3 rounded-xl transition-colors cursor-pointer active:scale-[0.99]"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-[13px] text-zinc-400 mt-5">
          Already have an account?{" "}
          <Link href="/login" className="text-zinc-700 font-medium hover:text-zinc-900 transition-colors">
            Sign in
          </Link>
        </p>

      </div>
    </div>
  );
}
