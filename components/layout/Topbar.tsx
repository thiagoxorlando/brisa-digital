"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";
import { useRole } from "@/lib/RoleProvider";
import { useSubscription } from "@/lib/SubscriptionContext";
import NotificationBell from "@/components/layout/NotificationBell";
import Logo from "@/components/Logo";

const pageMeta: Record<string, { title: string; description: string }> = {
  "/agency/dashboard":      { title: "Painel",                description: "Visão geral da sua agência e dos talentos da sua equipe" },
  "/agency/talent":         { title: "Talentos",             description: "Visualize e gerencie todos os perfis de talentos" },
  "/agency/talent-history": { title: "Histórico de talentos", description: "Reveja talentos que já trabalharam com você e facilite novas contratações" },
  "/agency/create":         { title: "Adicionar talento",    description: "Adicione um novo perfil de talento à sua equipe" },
  "/agency/post-job":       { title: "Publicar vaga",        description: "Crie uma nova vaga para sua equipe" },
  "/agency/first-job":      { title: "Primeira vaga",        description: "Configure e publique sua primeira vaga com segurança" },
  "/agency/jobs":           { title: "Vagas",                description: "Gerencie suas vagas abertas e seus candidatos" },
  "/agency/submissions":    { title: "Candidaturas",         description: "Acompanhe os talentos que se candidataram às suas vagas" },
  "/agency/bookings":       { title: "Reservas",             description: "Visualize e gerencie suas reservas" },
  "/agency/contracts":      { title: "Contratos",            description: "Gerencie os contratos dos seus talentos" },
  "/agency/finances":       { title: "Financeiro",           description: "Receita, pagamentos e comissões da sua agência" },
  "/agency/billing":        { title: "Assinatura",           description: "Gerencie o plano e a cobrança da sua agência" },
  "/agency/referrals":      { title: "Indicações",           description: "Acompanhe convites, indicações e comissões" },
  "/agency/profile":        { title: "Perfil",               description: "Gerencie o perfil da sua agência" },
  "/talent/dashboard":      { title: "Painel",               description: "Visão geral da sua atividade como talento" },
  "/talent/jobs":           { title: "Vagas",                description: "Explore oportunidades disponíveis" },
  "/talent/bookings":       { title: "Minhas reservas",      description: "Visualize suas reservas confirmadas" },
  "/talent/contracts":      { title: "Contratos",            description: "Acompanhe seus contratos e acordos" },
  "/talent/profile":        { title: "Perfil",               description: "Gerencie seu perfil de talento" },
  "/talent/finances":       { title: "Financeiro",           description: "Acompanhe seus ganhos e histórico de pagamentos" },
  "/talent/availability":   { title: "Disponibilidade",      description: "Defina quando você está disponível para novas contratações" },
  "/talent/referrals":      { title: "Indicações",           description: "Compartilhe seu link e acompanhe suas comissões" },
  "/admin/dashboard":       { title: "Painel",               description: "Visão geral da plataforma" },
  "/admin/jobs":            { title: "Vagas",                description: "Visualize todas as vagas da plataforma" },
  "/admin/users":           { title: "Usuários",             description: "Gerencie agências e talentos" },
  "/admin/bookings":        { title: "Reservas",             description: "Visualize todas as reservas da plataforma" },
  "/admin/finances":        { title: "Financeiro",           description: "Receita e comissões da plataforma" },
  "/admin/contracts":       { title: "Contratos",            description: "Visualize todos os contratos da plataforma" },
  "/admin/referrals":       { title: "Indicações",           description: "Acompanhe indicações e comissões da plataforma" },
  "/admin/trash":           { title: "Lixeira",              description: "Restaure ou exclua itens removidos da plataforma" },
  "/admin/profile":         { title: "Perfil",               description: "Gerencie as informações da conta administrativa" },
};

function getPageMeta(pathname: string) {
  const entries = Object.entries(pageMeta).sort((left, right) => right[0].length - left[0].length);

  for (const [route, meta] of entries) {
    if (pathname === route || pathname.startsWith(`${route}/`)) {
      return meta;
    }
  }

  return { title: "", description: "" };
}

type TopbarProps = {
  onMenuClick: () => void;
};

export default function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname();
  const { displayName, email, initials, avatarUrl, loading } = useUserProfile();
  const { role } = useRole();
  const { plan } = useSubscription();
  const [imgError, setImgError] = useState(false);

  const meta = getPageMeta(pathname);
  const isAdmin = pathname.startsWith("/admin");

  const dashboardHref =
    pathname.startsWith("/talent") ? "/talent/dashboard" :
    pathname.startsWith("/admin")  ? "/admin/dashboard"  :
    "/agency/dashboard";

  return (
    <header className="bg-white border-b border-[#DDE6E6] px-6 py-4 flex items-center justify-between flex-shrink-0 sticky top-0 z-20">
      {/* Left — logo + hamburger (mobile) + page title */}
      <div className="flex items-center gap-4 min-w-0">
        <Link href={dashboardHref} className="flex-shrink-0 hidden lg:flex items-center">
          <Logo size="md" />
        </Link>
        <button
          onClick={onMenuClick}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-xl text-[#647B7B] hover:bg-[#E6F0F0] hover:text-[#1F2D2E] transition-colors flex-shrink-0"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="min-w-0">
          <h1 className="text-[14px] font-semibold leading-none tracking-tight truncate text-[#1F2D2E]">
            {meta.title}
          </h1>
          {meta.description && (
            <p className="text-[12px] text-[#647B7B] mt-0.5 leading-none hidden sm:block truncate">
              {meta.description}
            </p>
          )}
        </div>
      </div>

      {/* Right — bell + user */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <NotificationBell />

        {/* Divider */}
        <div className="hidden sm:block w-px h-5 mx-1 bg-[#DDE6E6]" />

        {/* User */}
        <div className="flex items-center gap-2 pl-1 py-1 pr-2.5">
          <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden">
            {!loading && avatarUrl && !imgError ? (
              <img
                src={avatarUrl}
                alt={initials}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#1ABC9C] to-[#27C1D6] flex items-center justify-center text-[10px] font-bold text-white">
                {loading ? "…" : initials}
              </div>
            )}
          </div>
          <div className="hidden md:block text-left">
            <div className="flex items-center gap-1.5">
              <p className="text-[12px] font-semibold leading-none truncate max-w-[120px] text-[#1F2D2E]">
                {loading ? "…" : (displayName || email)}
              </p>
              {role === "agency" && !loading && (
                <span className={[
                  "text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide leading-none",
                  plan === "premium" ? "badge-premium" : plan === "pro" ? "badge-pro" : "bg-[#E6F0F0] text-[#647B7B]",
                ].join(" ")}>
                  {plan.toUpperCase()}
                </span>
              )}
            </div>
            <p className="text-[10px] text-[#647B7B] mt-0.5 leading-none truncate max-w-[140px]">
              {loading ? "" : email}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
