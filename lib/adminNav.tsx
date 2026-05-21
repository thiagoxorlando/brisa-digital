/**
 * Admin navigation configuration — single source of truth.
 *
 * Groups items by operational category and exports a flat list with
 * group-divider markers that Sidebar.tsx renders as section headers.
 * Add new admin routes here; Sidebar picks them up automatically.
 */

import React from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminNavGroup =
  | "dashboard"
  | "operations"
  | "financial"
  | "configuration"
  | "system";

export type AdminNavItem = {
  labelKey: string;
  href: string;
  exact?: boolean;
  icon: React.ReactNode;
  group: AdminNavGroup;
  /** Short description used by tooltips or future help overlays */
  description?: string;
};

/** Sidebar-compatible entry — either a nav link or a group divider marker */
export type FlatAdminNavEntry =
  | { isDivider: true; groupLabel: string; labelKey: string; href: string; icon?: undefined }
  | { isDivider?: false; labelKey: string; label?: string; href: string; exact?: boolean; icon: React.ReactNode };

// ── Group labels (Portuguese) ─────────────────────────────────────────────────

export const GROUP_LABELS: Record<AdminNavGroup, string> = {
  dashboard:     "Dashboard",
  operations:    "Operações",
  financial:     "Financeiro",
  configuration: "Configuração",
  system:        "Sistema",
};

// ── Icon constants ────────────────────────────────────────────────────────────

const IC = (d: string) => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
  </svg>
);

const ICON_CONTROL_CENTER = IC(
  "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
);

const ICON_DASHBOARD = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 21V12h6v9" />
  </svg>
);

const ICON_JOBS = IC(
  "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
);

const ICON_USERS = IC(
  "M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z",
);

const ICON_BOOKINGS = IC(
  "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
);

const ICON_CONTRACTS = IC(
  "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
);

const ICON_PREMIUM = IC(
  "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
);

const ICON_REFERRALS = IC(
  "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
);

const ICON_SUPPORT = IC(
  "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
);

const ICON_AUDIT = IC(
  "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
);

const ICON_TRASH = IC(
  "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
);

const ICON_DISPUTES = IC(
  "M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
);

const ICON_ANALYTICS = IC(
  "M9 19V13m6 6V9m-12 10V17M3 21h18M5 5h14a2 2 0 012 2v0H3v0a2 2 0 012-2z",
);

const ICON_FINANCES = IC(
  "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
);

const ICON_ESCROW = IC(
  "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
);

const ICON_PAYOUTS = IC(
  "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
);

const ICON_WITHDRAWALS = IC(
  "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
);

const ICON_RECONCILIATION = IC(
  "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
);

const ICON_PLANS = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 8h8M8 12h8M8 16h5" />
  </svg>
);

const ICON_NOTIFICATIONS = IC(
  "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
);

const ICON_SETTINGS = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ICON_SYSTEM = IC(
  "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18",
);

const ICON_PROFILE = IC(
  "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
);

// ── Nav items ─────────────────────────────────────────────────────────────────

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  {
    labelKey:    "nav_control_center",
    href:        "/admin/control-center",
    exact:       true,
    group:       "dashboard",
    description: "Visão operacional em tempo real da plataforma",
    icon:        ICON_CONTROL_CENTER,
  },
  {
    labelKey:    "nav_dashboard",
    href:        "/admin/dashboard",
    exact:       true,
    group:       "dashboard",
    description: "Visão geral de bookings e receita",
    icon:        ICON_DASHBOARD,
  },
  {
    labelKey:    "nav_analytics",
    href:        "/admin/analytics",
    exact:       true,
    group:       "dashboard",
    description: "Métricas de crescimento, funil e receita",
    icon:        ICON_ANALYTICS,
  },

  // ── OPERATIONS ─────────────────────────────────────────────────────────────
  {
    labelKey:    "nav_users",
    href:        "/admin/users",
    group:       "operations",
    description: "Gerenciar agências e talentos",
    icon:        ICON_USERS,
  },
  {
    labelKey:    "nav_jobs",
    href:        "/admin/jobs",
    group:       "operations",
    description: "Moderar vagas da plataforma",
    icon:        ICON_JOBS,
  },
  {
    labelKey:    "nav_bookings",
    href:        "/admin/bookings",
    group:       "operations",
    description: "Todas as reservas da plataforma",
    icon:        ICON_BOOKINGS,
  },
  {
    labelKey:    "nav_contracts",
    href:        "/admin/contracts",
    group:       "operations",
    description: "Ciclo de vida dos contratos",
    icon:        ICON_CONTRACTS,
  },
  {
    labelKey:    "nav_premium",
    href:        "/admin/premium",
    group:       "operations",
    description: "Workspaces e agentes Premium",
    icon:        ICON_PREMIUM,
  },
  {
    labelKey:    "nav_referrals",
    href:        "/admin/referrals",
    group:       "operations",
    description: "Rastrear indicações e comissões",
    icon:        ICON_REFERRALS,
  },
  {
    labelKey:    "nav_support",
    href:        "/admin/support",
    group:       "operations",
    description: "Atendimento e tickets de suporte",
    icon:        ICON_SUPPORT,
  },
  {
    labelKey:    "nav_disputes",
    href:        "/admin/disputes",
    group:       "operations",
    description: "Disputas em contratos cancelados após o trabalho",
    icon:        ICON_DISPUTES,
  },
  {
    labelKey:    "nav_audit",
    href:        "/admin/audit",
    group:       "operations",
    description: "Histórico de ações administrativas",
    icon:        ICON_AUDIT,
  },
  {
    labelKey:    "nav_trash",
    href:        "/admin/trash",
    group:       "operations",
    description: "Registros excluídos e lixeira",
    icon:        ICON_TRASH,
  },

  // ── FINANCIAL ──────────────────────────────────────────────────────────────
  {
    labelKey:    "nav_escrow",
    href:        "/admin/escrow",
    group:       "financial",
    description: "Contratos com dinheiro bloqueado em custódia",
    icon:        ICON_ESCROW,
  },
  {
    labelKey:    "nav_payouts",
    href:        "/admin/payouts",
    group:       "financial",
    description: "Histórico de pagamentos realizados a talentos",
    icon:        ICON_PAYOUTS,
  },
  {
    labelKey:    "nav_withdrawals",
    href:        "/admin/withdrawals",
    group:       "financial",
    description: "Monitorar e aprovar saques PIX dos usuários",
    icon:        ICON_WITHDRAWALS,
  },
  {
    labelKey:    "nav_finances",
    href:        "/admin/finances",
    group:       "financial",
    description: "Receita, escrow, carteiras e depósitos",
    icon:        ICON_FINANCES,
  },
  {
    labelKey:    "nav_reconciliation",
    href:        "/admin/reconciliation",
    group:       "financial",
    description: "Comparar registros do app com Asaas",
    icon:        ICON_RECONCILIATION,
  },
  {
    labelKey:    "nav_plans",
    href:        "/admin/plans",
    group:       "financial",
    description: "Planos, comissões e cobranças das agências",
    icon:        ICON_PLANS,
  },

  // ── CONFIGURATION ──────────────────────────────────────────────────────────
  {
    labelKey:    "nav_settings",
    href:        "/admin/settings",
    group:       "configuration",
    description: "Controles globais da plataforma",
    icon:        ICON_SETTINGS,
  },
  {
    labelKey:    "nav_notifications",
    href:        "/admin/notifications",
    group:       "configuration",
    description: "Enviar notificações em massa",
    icon:        ICON_NOTIFICATIONS,
  },

  // ── SYSTEM ─────────────────────────────────────────────────────────────────
  {
    labelKey:    "nav_system",
    href:        "/admin/system",
    group:       "system",
    description: "Saúde da infraestrutura",
    icon:        ICON_SYSTEM,
  },
  {
    labelKey:    "nav_profile",
    href:        "/admin/profile",
    group:       "system",
    description: "Perfil da conta administrativa",
    icon:        ICON_PROFILE,
  },
];

// ── Flat nav builder ──────────────────────────────────────────────────────────

const GROUP_ORDER: AdminNavGroup[] = [
  "dashboard",
  "operations",
  "financial",
  "configuration",
  "system",
];

// ── Grouped nav builder ───────────────────────────────────────────────────────

export type AdminNavGroupData = {
  group: AdminNavGroup;
  groupLabel: string;
  items: AdminNavItem[];
};

/**
 * Returns ADMIN_NAV_ITEMS grouped by section.
 * Used by Sidebar.tsx to render collapsible admin groups.
 */
export function buildAdminNavGroups(): AdminNavGroupData[] {
  return GROUP_ORDER
    .map((group) => ({
      group,
      groupLabel: GROUP_LABELS[group],
      items: ADMIN_NAV_ITEMS.filter((item) => item.group === group),
    }))
    .filter((g) => g.items.length > 0);
}

// ── Flat nav builder ──────────────────────────────────────────────────────────

/**
 * Returns ADMIN_NAV_ITEMS as a flat array with group-divider sentinels
 * interleaved before each group. Sidebar.tsx renders dividers as section
 * labels; all other entries render as nav links.
 */
export function buildFlatAdminNav(): FlatAdminNavEntry[] {
  const result: FlatAdminNavEntry[] = [];

  for (const group of GROUP_ORDER) {
    const items = ADMIN_NAV_ITEMS.filter((item) => item.group === group);
    if (items.length === 0) continue;

    result.push({
      isDivider:  true,
      groupLabel: GROUP_LABELS[group],
      labelKey:   "",
      href:       "",
    });

    for (const item of items) {
      result.push({
        isDivider: false,
        labelKey:  item.labelKey,
        href:      item.href,
        exact:     item.exact,
        icon:      item.icon,
      });
    }
  }

  return result;
}
