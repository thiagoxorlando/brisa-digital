"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SubscriptionBanner() {
  const pathname = usePathname();
  // Don't show the banner on the finances page — that's where they reactivate
  if (pathname === "/agency/finances") return null;

  return (
    <div className="flex items-center justify-between gap-4 bg-rose-50 border border-rose-100 rounded-2xl px-5 py-3.5 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-[13px] font-medium text-rose-800 leading-snug">
          Your subscription is inactive. Reactivate to continue using the platform.
        </p>
      </div>
      <Link
        href="/agency/finances"
        className="flex-shrink-0 text-[12px] font-semibold text-white bg-rose-500 hover:bg-rose-600 px-4 py-2 rounded-xl transition-colors"
      >
        Reactivate
      </Link>
    </div>
  );
}
