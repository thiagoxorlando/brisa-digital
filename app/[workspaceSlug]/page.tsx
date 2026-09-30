import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

const RESERVED_SLUGS = new Set([
  "admin", "agency", "talent", "api", "login", "signup", "jobs", "job",
  "premium", "support", "terms", "privacy", "dashboard", "app", "www",
  "brisahub", "onboarding", "setup-profile", "account-frozen",
]);

type Props = { params: Promise<{ workspaceSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspaceSlug } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase
    .from("premium_workspaces")
    .select("name")
    .eq("slug", workspaceSlug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return { title: "CastAnet" };
  return { title: `Entrar em ${data.name} — CastAnet` };
}

export default async function WorkspacePortalPage({ params }: Props) {
  const { workspaceSlug } = await params;

  if (RESERVED_SLUGS.has(workspaceSlug)) notFound();

  const supabase = createServerClient({ useServiceRole: true });
  const { data: workspace } = await supabase
    .from("premium_workspaces")
    .select("id, name, slug, logo_url, brand_primary_color, brand_accent_color, welcome_message, status, deleted_at")
    .eq("slug", workspaceSlug)
    .is("deleted_at", null)
    .eq("status", "active")
    .maybeSingle();

  if (!workspace) notFound();

  const primary = workspace.brand_primary_color ?? "#1ABC9C";
  const accent  = workspace.brand_accent_color  ?? "#27C1D6";

  // Detect auth — talent gets redirected in, others see a message
  let userRole: string | null = null;
  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      userRole = profile?.role ?? null;
      if (userRole === "talent") redirect(`/talent/workspaces/${workspaceSlug}`);
    }
  } catch { /* unauthenticated */ }

  const dashboardHref = `/talent/workspaces/${workspaceSlug}`;
  const loginHref     = `/login?next=${encodeURIComponent(dashboardHref)}`;
  const signupHref    = `/signup?role=talent&next=${encodeURIComponent(dashboardHref)}`;

  const initials = workspace.name
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

  const isBlockedUser = userRole === "agency" || userRole === "admin";

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: "#F8FAFC" }}>

      {/* ── Left: branded panel ─────────────────────────────────────────── */}
      <div
        className="relative flex flex-col justify-between overflow-hidden px-8 py-10 lg:w-[48%] lg:min-h-screen lg:px-12 lg:py-14"
        style={{
          background: `radial-gradient(circle at top left, ${primary}55 0%, transparent 40%), radial-gradient(circle at bottom right, ${accent}40 0%, transparent 38%), linear-gradient(155deg, ${primary} 0%, ${accent} 100%)`,
        }}
      >
        {/* Subtle grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />

        <div className="relative">
          {/* Logo */}
          <div
            className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[22px] border border-white/25 shadow-[0_8px_30px_rgba(0,0,0,0.18)]"
            style={{ background: workspace.logo_url ? "#fff" : "rgba(255,255,255,0.15)" }}
          >
            {workspace.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={workspace.logo_url} alt={workspace.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-[28px] font-black text-white select-none">{initials}</span>
            )}
          </div>

          {/* Agency name */}
          <h1 className="mt-6 text-[2.4rem] font-black leading-tight tracking-tight text-white drop-shadow-sm">
            {workspace.name}
          </h1>

          {/* Welcome / description */}
          <p className="mt-3 max-w-sm text-[15px] leading-7 text-white/82">
            {workspace.welcome_message ?? "Portal privado de talentos. Crie uma conta para acessar vagas exclusivas desta agência."}
          </p>

          {/* Feature pills */}
          <ul className="mt-8 space-y-3">
            {[
              "Vagas privadas exclusivas",
              "Gestão direta com a agência",
              "Contratos e pagamentos na plataforma",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-[13px] font-medium text-white/88">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="relative mt-10 lg:mt-0">
          <p className="text-[12px] text-white/50">
            Powered by{" "}
            <Link href="/" className="font-semibold text-white/70 transition-colors hover:text-white">
              CastAnet
            </Link>
          </p>
        </div>
      </div>

      {/* ── Right: action panel ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-sm space-y-6">

          {isBlockedUser ? (
            /* Agency / admin user — inform and offer nothing */
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-6 py-8 text-center">
              <div
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ background: `${primary}18` }}
              >
                <svg className="h-6 w-6" style={{ color: primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <p className="text-[15px] font-semibold text-zinc-900">Acesso restrito a talentos</p>
              <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                Este portal é exclusivo para talentos. Entre com uma conta de talento para acessar.
              </p>
            </div>
          ) : (
            /* Unauthenticated — show branded CTA */
            <>
              <div className="text-center">
                <p className="text-[13px] font-semibold uppercase tracking-widest" style={{ color: primary }}>
                  Portal de Talentos
                </p>
                <h2 className="mt-2 text-[1.8rem] font-bold tracking-tight text-zinc-950">
                  Acesse {workspace.name}
                </h2>
                <p className="mt-2 text-[14px] text-zinc-500">
                  Crie uma conta ou entre para acessar as vagas exclusivas desta agência.
                </p>
              </div>

              <div className="space-y-3">
                <Link
                  href={signupHref}
                  className="flex w-full items-center justify-center rounded-2xl px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-all hover:brightness-105 hover:shadow-[0_12px_28px_rgba(0,0,0,0.16)]"
                  style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}
                >
                  Criar conta como talento
                </Link>
                <Link
                  href={loginHref}
                  className="flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-3.5 text-[15px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  Já tenho conta — Entrar
                </Link>
              </div>

              <p className="text-center text-[12px] text-zinc-400">
                Ao criar uma conta você aceita os{" "}
                <Link href="/terms" className="underline hover:text-zinc-600">
                  Termos de Uso
                </Link>{" "}
                da CastAnet.
              </p>
            </>
          )}
        </div>

        {/* URL hint */}
        <p className="mt-10 text-center text-[11px] text-zinc-300">
          brisahub.com.br/{workspaceSlug}
        </p>
      </div>
    </div>
  );
}
