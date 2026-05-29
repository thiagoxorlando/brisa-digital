"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRole } from "@/lib/RoleProvider";
import { supabase } from "@/lib/supabase";
import { useUserProfile } from "@/lib/useUserProfile";
import { useT } from "@/lib/LanguageContext";
import { useSubscription } from "@/lib/SubscriptionContext";
import { useAgencyConfig } from "@/lib/AgencyConfigContext";
import { useWorkspacePortal } from "@/lib/WorkspacePortalContext";
import heroBrandImage from "@/public/landing/brisahub-hero-brand.png";
import { buildAdminNavGroups } from "@/lib/adminNav";
import type { AdminSidebarMetrics } from "@/lib/adminSidebarMetrics";
import { ROUTE_TO_NAV_KEY } from "@/lib/adminSidebarMetrics";

type NavItem = {
  labelKey: string;
  label?: string;
  href: string;
  exact?: boolean;
  icon?: React.ReactNode;
  /** When true, renders a group-label divider instead of a nav link */
  isDivider?: boolean;
  groupLabel?: string;
};

const AGENCY_OPEN_NAV: NavItem[] = [
  {
    labelKey: "nav_dashboard",
    href: "/agency/dashboard",
    exact: true,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    labelKey: "nav_public_jobs",
    href: "/agency/jobs",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_talent",
    href: "/agency/talent",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_bookings",
    href: "/agency/bookings",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    labelKey: "nav_finances",
    href: "/agency/finances",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_contracts",
    href: "/agency/contracts",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_disputes",
    href: "/agency/disputes",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_billing",
    href: "/agency/billing",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_support",
    href: "/agency/support",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
];

// Agents only see dashboard in the open platform section (no billing/plan controls)
const AGENCY_AGENT_OPEN_NAV: NavItem[] = [
  AGENCY_OPEN_NAV[0],
];

const AGENCY_PREMIUM_NAV: NavItem[] = [
  {
    labelKey: "nav_workspace_overview",
    href: "/agency/workspace",
    exact: true,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    labelKey: "nav_workspace_jobs",
    href: "/agency/workspace/jobs",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_workspace_talents",
    href: "/agency/workspace/talents",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_workspace_agents",
    href: "/agency/workspace/agents",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_workspace_wallet",
    href: "/agency/workspace/wallet",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_workspace_contracts",
    href: "/agency/workspace/contracts",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_workspace_disputes",
    href: "/agency/workspace/disputes",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_workspace_bookings",
    href: "/agency/workspace/bookings",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    labelKey: "nav_workspace_branding",
    href: "/agency/workspace/branding",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 6l2.3 4.66L19 12l-4.7 1.34L12 18l-2.3-4.66L5 12l4.7-1.34L12 6z" />
      </svg>
    ),
  },
];

// Open platform nav for non-Premium agencies (no workspace upsell — goes in its own section)
const AGENCY_NON_PREMIUM_OPEN_NAV: NavItem[] = [
  ...AGENCY_OPEN_NAV.slice(0, 3),
  {
    labelKey: "nav_team",
    href: "/agency/talent-history",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  AGENCY_OPEN_NAV[3],
  {
    labelKey: "nav_post_job",
    href: "/agency/post-job",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  ...AGENCY_OPEN_NAV.slice(4),
  {
    labelKey: "nav_profile",
    href: "/agency/profile",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

// Invited workspace agents see only the Premium section — no open platform.
// Branding (index 8) and Agentes (index 3) are owner-only.
const AGENCY_AGENT_PREMIUM_NAV: NavItem[] = [
  ...AGENCY_PREMIUM_NAV.slice(0, 3),  // overview, jobs, talents
  ...AGENCY_PREMIUM_NAV.slice(4, 8),  // wallet, contracts, disputes, bookings (skip agents at index 3)
  {
    labelKey: "nav_support",
    href: "/agency/support",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_profile",
    href: "/agency/workspace/profile",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

// Single upsell entry shown to non-Premium agencies in the Premium section
const AGENCY_WORKSPACE_UPSELL_NAV: NavItem[] = [
  {
    labelKey: "nav_workspace",
    href: "/agency/workspace",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
];

// ADMIN_NAV is now defined in lib/adminNav.tsx — built lazily below.
// Use buildFlatAdminNav() which includes group-divider markers.

const TALENT_NAV: NavItem[] = [
  {
    labelKey: "nav_dashboard",
    href: "/talent/dashboard",
    exact: true,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    labelKey: "nav_jobs",
    href: "/talent/jobs",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_bookings",
    href: "/talent/bookings",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    labelKey: "nav_finances",
    href: "/talent/finances",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_contracts",
    href: "/talent/contracts",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_disputes",
    href: "/talent/disputes",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_referrals",
    href: "/talent/referrals",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_availability",
    href: "/talent/availability",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_support",
    href: "/talent/support",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    labelKey: "nav_profile",
    href: "/talent/profile",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  adminMetrics?: AdminSidebarMetrics | null;
  /** When true (talent in internal payment mode), hides escrow-only nav items:
   *  referrals, disputes. Set from talent/layout.tsx based on global payment mode. */
  hideEscrowNav?: boolean;
};

export default function Sidebar({ isOpen, onClose, adminMetrics = null, hideEscrowNav = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useRole();
  const { displayName, agentName, email, initials, avatarUrl, loading } = useUserProfile();
  const [imgError, setImgError] = useState(false);
  const { t } = useT();
  const { isPremium, isWorkspaceAgent } = useSubscription();
  const agencyConfig = useAgencyConfig();
  // Agency in internal mode: hide disputes (no escrow intermediary for disputes)
  const hideAgencyDisputes = role === "agency" && agencyConfig.paymentMode === "internal";
  function filterNav(items: NavItem[]) {
    return items.filter((item) => {
      if (hideAgencyDisputes && item.href.includes("/disputes")) return false;
      // Talent in internal mode: hide referrals (no commissions) and disputes
      // (no escrow intermediary; users directed to Support instead).
      // hideEscrowNav is only ever true when set from talent/layout.tsx.
      if (hideEscrowNav && item.href.includes("/referrals")) return false;
      if (hideEscrowNav && item.href.includes("/disputes"))  return false;
      return true;
    });
  }
  const { workspace: portalWorkspace } = useWorkspacePortal();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem("sidebar_collapsed");
      if (raw) setCollapsedSections(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, []);

  function toggleSection(key: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem("sidebar_collapsed", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  // Admin collapsible groups — default: dashboard/operations/financial open, others collapsed
  const [adminCollapsedGroups, setAdminCollapsedGroups] = useState<Set<string>>(
    () => new Set(["configuration", "system"]),
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem("admin_sidebar_groups");
      if (raw) setAdminCollapsedGroups(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, []);

  // Mark current admin section as seen — fires on every admin navigation.
  // The POST is fire-and-forget; badge disappears on the next server render.
  useEffect(() => {
    if (!pathname.startsWith("/admin")) return;
    const navKey = Object.entries(ROUTE_TO_NAV_KEY).find(
      ([href]) => pathname === href || pathname.startsWith(href + "/"),
    )?.[1];
    if (!navKey) return;
    fetch("/api/admin/nav/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nav_key: navKey }),
    }).catch(() => {});
  }, [pathname]);

  function toggleAdminGroup(group: string) {
    setAdminCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      try { localStorage.setItem("admin_sidebar_groups", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  const inferredRole = role ?? (
    pathname.startsWith("/talent") ? "talent" :
    pathname.startsWith("/admin")  ? "admin"  : "agency"
  );
  const portalLabel =
    inferredRole === "talent" ? t("portal_talent") :
    inferredRole === "admin"  ? t("portal_admin")  : t("portal_agency");
  const hasPremiumAccess = inferredRole === "agency" && (isPremium || isWorkspaceAgent);

  // When a talent is inside a workspace portal, swap nav entirely
  const isInWorkspacePortal = inferredRole === "talent" && portalWorkspace !== null;
  const workspaceNavItems: NavItem[] = isInWorkspacePortal
    ? [
        {
          labelKey: "nav_dashboard",
          href: `/talent/workspaces/${portalWorkspace!.slug}`,
          exact: true,
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 21V12h6v9" />
            </svg>
          ),
        },
        {
          labelKey: "nav_jobs",
          href: `/talent/workspaces/${portalWorkspace!.slug}/jobs`,
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          ),
        },
        {
          labelKey: "nav_bookings",
          href: `/talent/workspaces/${portalWorkspace!.slug}/applications`,
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          ),
        },
        {
          labelKey: "nav_contracts",
          href: `/talent/workspaces/${portalWorkspace!.slug}/contracts`,
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ),
        },
        {
          labelKey: "nav_disputes",
          href: `/talent/workspaces/${portalWorkspace!.slug}/disputes`,
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
        },
        {
          labelKey: "nav_finances",
          href: `/talent/workspaces/${portalWorkspace!.slug}/finances`,
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
        },
        {
          labelKey: "nav_profile",
          href: `/talent/workspaces/${portalWorkspace!.slug}/profile`,
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          ),
        },
        {
          labelKey: "nav_support",
          href: "/talent/support",
          exact: true,
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          ),
        },
      ]
    : [];

  const navSections = inferredRole === "agency"
    ? isWorkspaceAgent
      // Invited agents are workspace-only — no open platform section at all
      ? [
          { titleKey: "nav_premium_workspace_section", items: filterNav(AGENCY_AGENT_PREMIUM_NAV) },
        ]
      : hasPremiumAccess
        ? [
            { titleKey: "nav_open_platform", items: filterNav(AGENCY_OPEN_NAV) },
            { titleKey: "nav_premium_workspace_section", items: filterNav(AGENCY_PREMIUM_NAV) },
          ]
        : [
            { titleKey: "nav_open_platform", items: filterNav(AGENCY_NON_PREMIUM_OPEN_NAV) },
            { titleKey: "nav_premium_workspace_section", items: AGENCY_WORKSPACE_UPSELL_NAV },
          ]
    : isInWorkspacePortal
      ? [{ titleKey: "nav_menu", items: workspaceNavItems }]
      : inferredRole === "talent"
        ? [{ titleKey: "nav_menu", items: TALENT_NAV }]
        : []; // admin: rendered via buildAdminNavGroups() in the nav block below

  const isMultiSection = navSections.length > 1;

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          "fixed left-0 top-0 z-30 h-screen w-64 flex flex-col text-[#EAF4F2] overflow-hidden",
          "transition-transform duration-300 ease-in-out",
          "lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {/* Background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(39,193,214,0.22),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(26,188,156,0.18),transparent_35%),linear-gradient(180deg,#081718_0%,#041012_100%)]" />
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{backgroundImage:"linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)",backgroundSize:"48px 48px"}} />
        {/* Right border */}
        <div className="absolute inset-y-0 right-0 w-px bg-white/[0.08]" />

        {/* Logo */}
        <div className="relative flex items-center justify-between px-5 h-16 border-b border-white/[0.08] flex-shrink-0">
          {isWorkspaceAgent && portalWorkspace ? (
            <Link href="/agency/workspace" className="flex min-w-0 flex-1 items-center gap-3">
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/20"
                style={{
                  background: portalWorkspace.logoUrl
                    ? "rgba(255,255,255,0.10)"
                    : `linear-gradient(135deg, ${portalWorkspace.primaryColor} 0%, ${portalWorkspace.accentColor} 100%)`,
                }}
              >
                {portalWorkspace.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={portalWorkspace.logoUrl} alt={portalWorkspace.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[12px] font-black text-white select-none">
                    {portalWorkspace.name
                      .split(" ")
                      .slice(0, 2)
                      .map((word) => word[0]?.toUpperCase() ?? "")
                      .join("") || "P"}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold leading-tight text-white">
                  {portalWorkspace.name}
                </p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#7BF0DE]">
                  {t("workspace_premium_space")}
                </p>
              </div>
            </Link>
          ) : (
            <Link href={isWorkspaceAgent ? "/agency/workspace" : "/"} className="flex flex-1 items-center justify-center">
              <Image
                src={heroBrandImage}
                alt="BrisaHub"
                width={heroBrandImage.width}
                height={heroBrandImage.height}
                className="h-auto w-full max-w-[72px]"
              />
            </Link>
          )}
          <button
            onClick={onClose}
            className="lg:hidden w-7 h-7 flex items-center justify-center rounded-lg text-[#B8CECA] hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
            aria-label={t("sidebar_close_menu")}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Workspace branding strip — shown for talent portal only; agents already have the header */}
        {isInWorkspacePortal && !isWorkspaceAgent && portalWorkspace && (() => {
          const primary = portalWorkspace.primaryColor;
          const accent  = portalWorkspace.accentColor;
          const wsInitials = portalWorkspace.name
            .split(" ")
            .slice(0, 2)
            .map((w) => w[0]?.toUpperCase() ?? "")
            .join("") || "?";
          return (
            <div
              className="relative mx-3 mb-1 overflow-hidden rounded-[14px] px-3 py-3 flex-shrink-0"
              style={{
                background: `linear-gradient(135deg, ${primary}22 0%, ${accent}15 100%)`,
                borderTop: `2px solid ${primary}`,
              }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/20"
                  style={{ background: portalWorkspace.logoUrl ? "rgba(255,255,255,0.12)" : primary }}
                >
                  {portalWorkspace.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={portalWorkspace.logoUrl} alt={portalWorkspace.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[11px] font-black text-white select-none">{wsInitials}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: accent }}>
                    {isWorkspaceAgent ? t("workspace_premium_space") : t("workspace_portal_label")}
                  </p>
                  <p className="truncate text-[13px] font-bold text-white leading-tight">
                    {portalWorkspace.name}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Navigation — scroll container with top/bottom fade overlays */}
        <div className="relative flex-1 min-h-0">
          {/* Top fade */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-5 z-10 bg-gradient-to-b from-[#081718] to-transparent" />
          {/* Bottom fade */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 z-10 bg-gradient-to-t from-[#041012] to-transparent" />

          <nav className="h-full px-3 py-4 overflow-y-auto sidebar-scroll">
            <div className="space-y-0.5">
              {/* Admin: collapsible group sections */}
              {inferredRole === "admin" && buildAdminNavGroups().map((group) => {
                const isGroupCollapsed = adminCollapsedGroups.has(group.group);
                const groupHasBadge = adminMetrics != null && group.items.some(
                  (item) => (adminMetrics[item.href]?.count ?? 0) > 0,
                );
                return (
                  <div key={group.group} className="mb-0.5">
                    <button
                      type="button"
                      onClick={() => toggleAdminGroup(group.group)}
                      className="group flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.16em] text-[#4A7872]/55 hover:text-[#7BA09A] transition-colors duration-150 select-none"
                    >
                      {group.groupLabel}
                      <div className="flex items-center gap-1.5">
                        {isGroupCollapsed && groupHasBadge && (
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400 opacity-80" />
                        )}
                        <svg
                          className={[
                            "w-3 h-3 opacity-40 group-hover:opacity-70 transition-all duration-200",
                            isGroupCollapsed ? "-rotate-90" : "",
                          ].join(" ")}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {!isGroupCollapsed && (
                      <ul className="flex flex-col gap-px">
                        {group.items.map((item) => {
                          const isActive = item.exact
                            ? pathname === item.href
                            : pathname.startsWith(item.href);
                          const badge = adminMetrics?.[item.href];
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                onClick={onClose}
                                className={[
                                  "relative flex items-center gap-2.5 px-3 py-[7px] rounded-xl text-[13px] font-medium transition-all duration-150",
                                  isActive
                                    ? "bg-[#1ABC9C]/[0.15] text-white ring-1 ring-[#49D5C3]/30 font-semibold before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-[#1ABC9C]/70"
                                    : "text-[#C7D9D5] hover:bg-white/[0.065] hover:text-white",
                                ].join(" ")}
                              >
                                <span
                                  className={[
                                    "flex-shrink-0 transition-colors duration-150",
                                    isActive ? "text-[#7BF0DE]" : "text-[#8FB1AB]",
                                  ].join(" ")}
                                >
                                  {item.icon}
                                </span>
                                <span className="truncate">{t(item.labelKey as any)}</span>
                                {badge && badge.count > 0 && (
                                  <span
                                    className={[
                                      "ml-auto flex-shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold leading-none tabular-nums min-w-[16px] text-center",
                                      badge.color === "red"
                                        ? "bg-red-500 text-white"
                                        : "bg-amber-400 text-amber-950",
                                    ].join(" ")}
                                  >
                                    {badge.count > 99 ? "99+" : badge.count}
                                  </span>
                                )}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}

              {/* Agency / Talent: existing section rendering */}
              {navSections.map((section, sectionIdx) => {
                const isPremiumSection = section.titleKey === "nav_premium_workspace_section";
                const isCollapsed = collapsedSections.has(section.titleKey);

                return (
                  <div key={section.titleKey}>
                    {/* Visual separator between sections */}
                    {sectionIdx > 0 && (
                      <div className="mx-1 my-2 h-px bg-white/[0.07]" />
                    )}

                    {/* Premium section wrapper card */}
                    <div
                      className={isPremiumSection
                        ? "rounded-[14px] p-1.5 pb-2 bg-[rgba(26,188,156,0.045)] ring-1 ring-[#1ABC9C]/[0.13]"
                        : ""}
                    >
                      {/* Section header — collapsible for agency multi-section */}
                      {isMultiSection ? (
                        <button
                          type="button"
                          onClick={() => toggleSection(section.titleKey)}
                          className={[
                            "group flex w-full items-center justify-between px-2.5 py-1.5 mb-1 rounded-lg",
                            "text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors duration-150",
                            isPremiumSection
                              ? "text-[#4ECDC4] hover:text-[#7BF0DE]"
                              : "text-[#88A6A1] hover:text-[#A8C4BF]",
                          ].join(" ")}
                        >
                          <span className="flex items-center gap-2">
                            {isPremiumSection && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#1ABC9C] shadow-[0_0_5px_rgba(26,188,156,0.65)]" />
                            )}
                            {t(section.titleKey as any)}
                          </span>
                          <svg
                            className={[
                              "w-3 h-3 opacity-50 group-hover:opacity-80 transition-all duration-200",
                              isCollapsed ? "-rotate-90" : "",
                            ].join(" ")}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      ) : null}

                      {/* Nav items */}
                      {!isCollapsed && (
                        <ul className="flex flex-col gap-px">
                          {section.items.map((item) => {
                            if (item.isDivider) {
                              return (
                                <li key={`div-${item.groupLabel}`} className="px-2.5 pt-4 pb-1 first:pt-2">
                                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#4A7872]/60 select-none">
                                    {item.groupLabel}
                                  </p>
                                </li>
                              );
                            }

                            const isActive = item.exact
                              ? pathname === item.href
                              : pathname.startsWith(item.href);

                            return (
                              <li key={item.href}>
                                <Link
                                  href={item.href}
                                  onClick={onClose}
                                  className={[
                                    "relative flex items-center gap-2.5 px-3 py-[7px] rounded-xl text-[13px] font-medium transition-all duration-150",
                                    isActive
                                      ? isPremiumSection
                                        ? "bg-[#1ABC9C]/[0.18] text-white ring-1 ring-[#49D5C3]/35 font-semibold shadow-[0_1px_3px_rgba(26,188,156,0.12)] before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-[#1ABC9C] before:shadow-[0_0_6px_rgba(26,188,156,0.7)]"
                                        : "bg-[#1ABC9C]/[0.15] text-white ring-1 ring-[#49D5C3]/30 font-semibold before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-[#1ABC9C]/70"
                                      : isPremiumSection
                                        ? "text-[#AACCC7] hover:bg-[#1ABC9C]/[0.10] hover:text-white"
                                        : "text-[#C7D9D5] hover:bg-white/[0.065] hover:text-white",
                                  ].join(" ")}
                                >
                                  <span
                                    className={[
                                      "flex-shrink-0 transition-colors duration-150",
                                      isActive
                                        ? "text-[#7BF0DE]"
                                        : isPremiumSection
                                          ? "text-[#3DBDB5]"
                                          : "text-[#8FB1AB]",
                                    ].join(" ")}
                                  >
                                    {item.icon}
                                  </span>
                                  <span className="truncate">{item.label ?? t(item.labelKey as any)}</span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </nav>
        </div>

        {/* Bottom divider */}
        <div className="relative px-5 pb-1">
          <div className="h-px bg-white/[0.08]" />
        </div>

        {/* Powered by BrisaHub — shown for workspace agents */}
        {isWorkspaceAgent && (
          <div className="relative px-5 py-1.5 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4A7872]/70">
              {t("workspace_powered_by")}
            </p>
          </div>
        )}

        {/* User + Logout */}
        <div className="relative px-3 py-3 flex-shrink-0 space-y-1">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.05]">
            <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden">
              {!loading && avatarUrl && !imgError ? (
                <img
                  src={avatarUrl}
                  alt={initials}
                  className="w-full h-full object-cover"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#1ABC9C]/20 flex items-center justify-center text-[11px] font-bold text-[#A6FFF2] flex-shrink-0">
                  {loading ? "…" : initials}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[#F3FBF9] truncate leading-none">
                {loading ? "…" : (displayName || email)}
              </p>
              {inferredRole === "agency" && !loading && agentName ? (
                <p className="text-[10px] text-[#9DB8B3] truncate mt-0.5">
                  <span className="text-[#7BF0DE] font-semibold uppercase tracking-wide">{t("workspace_role_agent")}</span>
                  {" · "}{agentName}
                </p>
              ) : (
                <p className="text-[11px] text-[#9DB8B3] truncate mt-0.5">
                  {loading ? "" : email}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-[#C7D9D5] hover:bg-white/[0.07] hover:text-[#FFB3B3] transition-all duration-150 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {t("nav_logout")}
          </button>
        </div>
      </aside>
    </>
  );
}

