/**
 * Workspace dashboard read model.
 *
 * Provides:
 *   - resolveWorkspaceBranding()  — single source for default brand colors
 *   - WorkspaceBranding type      — used by all workspace pages/components
 *   - WorkspaceDashboardCounts    — aggregate counts for the owner/agent dashboard
 *   - buildWorkspaceDashboardCounts() — pure count aggregator (no DB calls)
 */

// ── Branding ──────────────────────────────────────────────────────────────────

export type WorkspaceBranding = {
  primary: string;
  accent: string;
};

const DEFAULT_PRIMARY = "#1ABC9C";
const DEFAULT_ACCENT  = "#27C1D6";

/**
 * Resolves brand colors from workspace settings, falling back to BrisaHub
 * default teal. Every workspace page/component MUST call this instead of
 * inlining `?? "#1ABC9C"` / `?? "#27C1D6"`.
 */
export function resolveWorkspaceBranding(workspace: {
  brandPrimaryColor?: string | null;
  brandAccentColor?: string | null;
}): WorkspaceBranding {
  return {
    primary: workspace.brandPrimaryColor ?? DEFAULT_PRIMARY,
    accent:  workspace.brandAccentColor  ?? DEFAULT_ACCENT,
  };
}

// ── Dashboard counts ──────────────────────────────────────────────────────────

export type WorkspaceDashboardCounts = {
  totalJobs:       number;
  openJobs:        number;
  myJobs:          number;       // jobs created by the current user
  totalApplicants: number;       // across all visible jobs
};

type DashboardJobRow = {
  id: string;
  status: string;
  createdByUserId: string | null;
  applicants: number;
};

/**
 * Pure aggregator — takes the job rows already fetched by the page and
 * returns structured counts for the dashboard overview cards.
 */
export function buildWorkspaceDashboardCounts(
  jobs: DashboardJobRow[],
  currentUserId: string,
): WorkspaceDashboardCounts {
  return {
    totalJobs:       jobs.length,
    openJobs:        jobs.filter((j) => j.status === "open").length,
    myJobs:          jobs.filter((j) => j.createdByUserId === currentUserId).length,
    totalApplicants: jobs.reduce((sum, j) => sum + j.applicants, 0),
  };
}
