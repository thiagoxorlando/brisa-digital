"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";

type Role = "agency" | "talent";

const ROLES: {
  value: Role;
  label: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  stripe: string;
}[] = [
  {
    value: "agency",
    label: "Agency",
    description: "Post jobs and hire talent",
    accent: "group-hover:border-indigo-300 group-hover:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]",
    stripe: "from-indigo-500 to-violet-500",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    value: "talent",
    label: "Talent",
    description: "Apply for jobs and get booked",
    accent: "group-hover:border-emerald-300 group-hover:shadow-[0_0_0_4px_rgba(16,185,129,0.08)]",
    stripe: "from-emerald-400 to-teal-500",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

const ROLE_HOME: Record<Role, string> = {
  agency: "/agency/dashboard",
  talent: "/talent/dashboard",
};

export default function RoleSelectionPage() {
  const router = useRouter();
  const [saving, setSaving] = useState<Role | null>(null);
  const [checking, setChecking] = useState(true);

  // If role already set, skip this page
  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (data?.role) {
        router.replace(ROLE_HOME[data.role as Role] ?? "/");
      } else {
        setChecking(false);
      }
    }
    check();
  }, [router]);

  async function selectRole(role: Role) {
    setSaving(role);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    await supabase
      .from("profiles")
      .upsert({ id: user.id, role }, { onConflict: "id" });

    router.push(ROLE_HOME[role]);
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-zinc-200 border-t-zinc-900 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4">

      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-12">
        <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-white border border-zinc-100">
          <Logo size="md" />
        </div>
        <span className="text-[16px] font-semibold tracking-tight text-zinc-900">Brisa Digital</span>
      </div>

      {/* Heading */}
      <div className="text-center mb-10">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 mb-2">
          Choose your role
        </h1>
        <p className="text-[14px] text-zinc-400">
          This sets up your experience. You can't change it later.
        </p>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
        {ROLES.map((r) => {
          const isLoading = saving === r.value;
          const isDisabled = saving !== null;

          return (
            <button
              key={r.value}
              onClick={() => selectRole(r.value)}
              disabled={isDisabled}
              className={[
                "group relative bg-white rounded-2xl border border-zinc-200 overflow-hidden text-left",
                "transition-all duration-200 cursor-pointer",
                "shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]",
                isDisabled ? "opacity-60 cursor-not-allowed" : r.accent,
              ].join(" ")}
            >
              <div className={`h-[3px] bg-gradient-to-r ${r.stripe}`} />

              <div className="p-7 flex flex-col gap-4">
                <div className="w-11 h-11 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-500 group-hover:text-zinc-800 transition-colors">
                  {r.icon}
                </div>

                <div>
                  <p className="text-[16px] font-semibold text-zinc-900 mb-1">{r.label}</p>
                  <p className="text-[13px] text-zinc-400 leading-relaxed">{r.description}</p>
                </div>

                <div className="flex items-center justify-between mt-1">
                  <span className="text-[12px] font-medium text-zinc-400 group-hover:text-zinc-700 transition-colors">
                    Get started
                  </span>
                  {isLoading ? (
                    <svg className="w-4 h-4 animate-spin text-zinc-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

    </div>
  );
}
