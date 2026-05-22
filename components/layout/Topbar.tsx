"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";
import { useRole } from "@/lib/RoleProvider";
import { useSubscription } from "@/lib/SubscriptionContext";
import NotificationBell from "@/components/layout/NotificationBell";
import Logo from "@/components/Logo";
import LanguageSelector from "@/components/LanguageSelector";
import { useT } from "@/lib/LanguageContext";

type MetaEntry = {
  titleKey?: string;
  descKey?: string;
  title?: string;
  description?: string;
};

const pageMeta: Record<string, MetaEntry> = {
  "/agency/dashboard": { titleKey: "page_dashboard", descKey: "topbar_agency_dashboard_desc" },
  "/agency/talent": { titleKey: "page_talent", descKey: "topbar_agency_talent_desc" },
  "/agency/talent-history": { titleKey: "topbar_agency_talent_history_title", descKey: "topbar_agency_talent_history_desc" },
  "/agency/create": { titleKey: "topbar_agency_create_talent_title", descKey: "topbar_agency_create_talent_desc" },
  "/agency/post-job": { titleKey: "page_post_job", descKey: "topbar_agency_post_job_desc" },
  "/agency/first-job": { titleKey: "topbar_agency_first_job_title", descKey: "topbar_agency_first_job_desc" },
  "/agency/jobs": { titleKey: "page_jobs", descKey: "topbar_agency_jobs_desc" },
  "/agency/submissions": { titleKey: "topbar_agency_submissions_title", descKey: "topbar_agency_submissions_desc" },
  "/agency/bookings": { titleKey: "page_bookings", descKey: "topbar_agency_bookings_desc" },
  "/agency/contracts": { titleKey: "page_contracts", descKey: "topbar_agency_contracts_desc" },
  "/agency/finances": { titleKey: "page_finances", descKey: "topbar_agency_finances_desc" },
  "/agency/billing": { titleKey: "topbar_agency_billing_title", descKey: "topbar_agency_billing_desc" },
  "/agency/workspace": { titleKey: "nav_workspace", descKey: "topbar_agency_workspace_desc" },
  "/agency/workspace/jobs": { titleKey: "nav_workspace_jobs", descKey: "topbar_workspace_jobs_desc" },
  "/agency/workspace/talents": { titleKey: "nav_workspace_talents", descKey: "topbar_workspace_talents_desc" },
  "/agency/workspace/agents": { titleKey: "nav_workspace_agents", descKey: "topbar_workspace_agents_desc" },
  "/agency/workspace/wallet": { titleKey: "nav_workspace_wallet", descKey: "topbar_workspace_wallet_desc" },
  "/agency/workspace/contracts": { titleKey: "nav_workspace_contracts", descKey: "topbar_workspace_contracts_desc" },
  "/agency/workspace/bookings": { titleKey: "nav_workspace_bookings", descKey: "topbar_workspace_bookings_desc" },
  "/agency/workspace/branding": { titleKey: "nav_workspace_branding", descKey: "topbar_workspace_branding_desc" },
  "/agency/workspace/profile": { titleKey: "nav_profile", descKey: "topbar_workspace_profile_desc" },
  "/agency/referrals": { titleKey: "page_referrals", descKey: "topbar_agency_referrals_desc" },
  "/agency/support": { titleKey: "nav_support", descKey: "topbar_agency_support_desc" },
  "/agency/profile": { titleKey: "page_profile", descKey: "topbar_agency_profile_desc" },
  "/talent/dashboard": { titleKey: "page_dashboard", descKey: "topbar_talent_dashboard_desc" },
  "/talent/jobs": { titleKey: "page_jobs", descKey: "topbar_talent_jobs_desc" },
  "/talent/bookings": { titleKey: "topbar_talent_bookings_title", descKey: "topbar_talent_bookings_desc" },
  "/talent/contracts": { titleKey: "page_contracts", descKey: "topbar_talent_contracts_desc" },
  "/talent/profile": { titleKey: "page_profile", descKey: "topbar_talent_profile_desc" },
  "/talent/finances": { titleKey: "page_finances", descKey: "topbar_talent_finances_desc" },
  "/talent/availability": { titleKey: "nav_availability", descKey: "topbar_talent_availability_desc" },
  "/talent/referrals": { titleKey: "page_referrals", descKey: "topbar_talent_referrals_desc" },
  "/talent/support": { titleKey: "nav_support", descKey: "topbar_talent_support_desc" },
  "/talent/workspaces": { titleKey: "workspace_portal_premium", descKey: "topbar_talent_dashboard_desc" },
  "/admin/dashboard":     { titleKey: "topbar_admin_dashboard_title",     descKey: "topbar_admin_dashboard_desc"     },
  "/admin/jobs":          { titleKey: "topbar_admin_jobs_title",          descKey: "topbar_admin_jobs_desc"          },
  "/admin/users":         { titleKey: "topbar_admin_users_title",         descKey: "topbar_admin_users_desc"         },
  "/admin/bookings":      { titleKey: "topbar_admin_bookings_title",      descKey: "topbar_admin_bookings_desc"      },
  "/admin/premium":       { titleKey: "topbar_admin_premium_title",       descKey: "topbar_admin_premium_desc"       },
  "/admin/finances":      { titleKey: "topbar_admin_finances_title",      descKey: "topbar_admin_finances_desc"      },
  "/admin/reconciliation":{ titleKey: "topbar_admin_reconciliation_title",descKey: "topbar_admin_reconciliation_desc"},
  "/admin/plans":         { titleKey: "topbar_admin_plans_title",         descKey: "topbar_admin_plans_desc"         },
  "/admin/contracts":     { titleKey: "topbar_admin_contracts_title",     descKey: "topbar_admin_contracts_desc"     },
  "/admin/referrals":     { titleKey: "topbar_admin_referrals_title",     descKey: "topbar_admin_referrals_desc"     },
  "/admin/trash":         { titleKey: "topbar_admin_trash_title",         descKey: "topbar_admin_trash_desc"         },
  "/admin/support":       { titleKey: "topbar_admin_support_title",       descKey: "topbar_admin_support_desc"       },
  "/admin/audit":         { titleKey: "topbar_admin_audit_title",         descKey: "topbar_admin_audit_desc"         },
  "/admin/system":        { titleKey: "topbar_admin_system_title",        descKey: "topbar_admin_system_desc"        },
  "/admin/settings":      { titleKey: "topbar_admin_settings_title",      descKey: "topbar_admin_settings_desc"      },
  "/admin/notifications":   { titleKey: "topbar_admin_notifications_title",   descKey: "topbar_admin_notifications_desc"   },
  "/admin/control-center": { titleKey: "topbar_admin_control_center_title", descKey: "topbar_admin_control_center_desc" },
  "/admin/escrow":         { titleKey: "topbar_admin_escrow_title",         descKey: "topbar_admin_escrow_desc"         },
  "/admin/payouts":        { titleKey: "topbar_admin_payouts_title",        descKey: "topbar_admin_payouts_desc"        },
  "/admin/withdrawals":    { titleKey: "topbar_admin_withdrawals_title",    descKey: "topbar_admin_withdrawals_desc"    },
  "/admin/disputes":       { titleKey: "topbar_admin_disputes_title",       descKey: "topbar_admin_disputes_desc"       },
  "/admin/analytics":      { titleKey: "topbar_admin_analytics_title",      descKey: "topbar_admin_analytics_desc"      },
  "/admin/profile":       { titleKey: "topbar_admin_profile_title",       descKey: "topbar_admin_profile_desc"       },
};

function getPageMeta(pathname: string) {
  const entries = Object.entries(pageMeta).sort((left, right) => right[0].length - left[0].length);
  for (const [route, meta] of entries) {
    if (pathname === route || pathname.startsWith(`${route}/`)) return meta;
  }
  return { title: "", description: "" };
}

type TopbarProps = {
  onMenuClick: () => void;
  homeHref?: string;
};

export default function Topbar({ onMenuClick, homeHref }: TopbarProps) {
  const pathname = usePathname();
  const { displayName, email, initials, avatarUrl, loading } = useUserProfile();
  const { role } = useRole();
  const { plan, isWorkspaceAgent } = useSubscription();
  const { t } = useT();
  const [imgError, setImgError] = useState(false);

  const rawMeta = getPageMeta(pathname);
  const meta = {
    title: rawMeta.titleKey ? t(rawMeta.titleKey as never) : (rawMeta.title ?? ""),
    description: rawMeta.descKey ? t(rawMeta.descKey as never) : (rawMeta.description ?? ""),
  };
  const isAdmin = pathname.startsWith("/admin");

  const dashboardHref =
    homeHref ??
    (isWorkspaceAgent ? "/agency/workspace" :
    pathname.startsWith("/talent") ? "/talent/dashboard" :
    pathname.startsWith("/admin") ? "/admin/dashboard" :
    "/agency/dashboard");

  return (
    <header className="sticky top-0 z-20 flex flex-shrink-0 flex-col bg-white/[0.97] backdrop-blur-sm shadow-[0_1px_0_0_#DDE6E6,0_2px_0_0_rgba(26,188,156,0.06)]">
      <div className="h-[2px] bg-gradient-to-r from-[#1ABC9C]/40 via-[#27C1D6]/50 to-transparent" />
      <div className="flex items-center justify-between px-6 py-4">
      <div className="flex min-w-0 items-center gap-4">
        <Link href={dashboardHref} className="hidden flex-shrink-0 items-center lg:flex">
          <Logo size="md" />
        </Link>
        <button
          onClick={onMenuClick}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-[#647B7B] transition-colors hover:bg-[#E6F0F0] hover:text-[#1F2D2E] lg:hidden"
          aria-label="Open menu"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="min-w-0">
          <h1 className="truncate text-[14px] font-semibold leading-none tracking-tight text-[#1F2D2E]">
            {meta.title}
          </h1>
          {meta.description ? (
            <p className="mt-0.5 hidden truncate text-[12px] leading-none text-[#647B7B] sm:block">
              {meta.description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        {!isAdmin ? <LanguageSelector variant="light" /> : null}
        <NotificationBell />
        <div className="mx-1 hidden h-5 w-px bg-[#DDE6E6] sm:block" />

        <div className="flex items-center gap-2 py-1 pl-1 pr-2.5">
          <div className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-full">
            {!loading && avatarUrl && !imgError ? (
              <img
                src={avatarUrl}
                alt={initials}
                className="h-full w-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1ABC9C] to-[#27C1D6] text-[10px] font-bold text-white">
                {loading ? "…" : initials}
              </div>
            )}
          </div>
          <div className="hidden text-left md:block">
            <div className="flex items-center gap-1.5">
              <p className="max-w-[120px] truncate text-[12px] font-semibold leading-none text-[#1F2D2E]">
                {loading ? "…" : (displayName || email)}
              </p>
              {role === "agency" && !loading ? (
                <span
                  className={[
                    "rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide",
                    isWorkspaceAgent
                      ? "badge-premium"
                      : plan === "premium" ? "badge-premium"
                      : plan === "pro" ? "badge-pro"
                      : "bg-[#E6F0F0] text-[#647B7B]",
                  ].join(" ")}
                >
                  {isWorkspaceAgent ? t("workspace_role_agent" as never) : plan.toUpperCase()}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 max-w-[140px] truncate text-[10px] leading-none text-[#647B7B]">
              {loading ? "" : email}
            </p>
          </div>
        </div>
      </div>
      </div>
    </header>
  );
}
