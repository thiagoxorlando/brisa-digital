"use client";

import { usePathname } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";
import NotificationBell from "@/components/layout/NotificationBell";

const pageMeta: Record<string, { title: string; description: string }> = {
  "/agency/dashboard": { title: "Dashboard", description: "Overview of your agency and talent roster" },
  "/agency/talent":    { title: "Talent",    description: "Browse and manage all talent profiles" },
  "/agency/create":    { title: "Create Talent", description: "Add a new talent profile to your roster" },
  "/agency/post-job":  { title: "Post a Job", description: "Create a new job listing for your roster" },
  "/agency/jobs":      { title: "Jobs",       description: "Manage your open positions and applicants" },
  "/agency/bookings":  { title: "Bookings",   description: "View and manage your bookings" },
  "/talent/dashboard": { title: "Dashboard",  description: "Your talent overview" },
  "/talent/jobs":      { title: "Jobs",       description: "Browse available opportunities" },
  "/talent/bookings":  { title: "My Bookings", description: "View your confirmed bookings" },
  "/talent/profile":   { title: "Profile",    description: "Manage your talent profile" },
  "/agency/finances":  { title: "Finances",   description: "Revenue, payments and commissions" },
  "/talent/finances":  { title: "Finances",   description: "Your earnings and payment history" },
  "/admin/dashboard":  { title: "Dashboard",  description: "Platform-wide overview" },
  "/admin/jobs":       { title: "Jobs",       description: "All jobs across the platform" },
  "/admin/users":      { title: "Users",      description: "Manage agencies and talent" },
  "/admin/bookings":   { title: "Bookings",   description: "All bookings across the platform" },
  "/admin/finances":   { title: "Finances",   description: "Platform revenue and commissions" },
  "/admin/contracts":  { title: "Contracts",  description: "All platform contracts" },
  "/agency/contracts": { title: "Contracts",  description: "Manage your talent contracts" },
  "/talent/contracts": { title: "Contracts",  description: "Your contracts and agreements" },
};

type TopbarProps = {
  onMenuClick: () => void;
};

export default function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname();
  const { displayName, email, initials, avatarUrl, loading } = useUserProfile();

  const meta = pageMeta[pathname] ?? { title: "", description: "" };

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between h-16 px-6 lg:px-8 bg-white border-b border-zinc-100 flex-shrink-0">
      {/* Left — hamburger (mobile) + page title */}
      <div className="flex items-center gap-4 min-w-0">
        <button
          onClick={onMenuClick}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors flex-shrink-0"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="min-w-0">
          <h1 className="text-[14px] font-semibold text-zinc-900 leading-none tracking-tight truncate">
            {meta.title}
          </h1>
          {meta.description && (
            <p className="text-[12px] text-zinc-400 mt-0.5 leading-none hidden sm:block truncate">
              {meta.description}
            </p>
          )}
        </div>
      </div>

      {/* Right — bell + user */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <NotificationBell />

        {/* Divider */}
        <div className="hidden sm:block w-px h-5 bg-zinc-100 mx-1" />

        {/* User */}
        <div className="flex items-center gap-2 pl-1 py-1 pr-2.5">
          <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden">
            {!loading && avatarUrl ? (
              <img src={avatarUrl} alt={initials} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                {loading ? "…" : initials}
              </div>
            )}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-[12px] font-semibold text-zinc-900 leading-none truncate max-w-[140px]">
              {loading ? "…" : (displayName || email)}
            </p>
            <p className="text-[10px] text-zinc-400 mt-0.5 leading-none truncate max-w-[140px]">
              {loading ? "" : email}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
