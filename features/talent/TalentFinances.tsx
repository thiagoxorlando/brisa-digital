"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const TALENT_RATE   = 0.85; // 85% of deal value
const REFERRAL_RATE = 0.02; // 2% referral commission

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

type Payment = {
  id: string;
  job: string;
  amount: number;      // deal value
  earnings: number;    // 85% of amount
  status: string;
  date: string;
};

type Referral = {
  id: string;
  talentName: string;
  job: string;
  amount: number;      // deal value
  commission: number;  // 2% of amount
  date: string;
};

const STATUS_CLS: Record<string, string> = {
  paid:            "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  confirmed:       "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100", // legacy
  pending_payment: "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  pending:         "bg-zinc-100   text-zinc-400    ring-1 ring-zinc-200",
  cancelled:       "bg-zinc-100   text-zinc-500    ring-1 ring-zinc-200",
};

const STATUS_LABEL: Record<string, string> = {
  paid:            "Paid",
  confirmed:       "Paid",
  pending_payment: "Pending Payment",
  pending:         "Pending",
  cancelled:       "Cancelled",
};

function StatCard({ label, value, sub, stripe }: { label: string; value: string; sub?: string; stripe: string }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      <div className={`h-[3px] bg-gradient-to-r ${stripe}`} />
      <div className="p-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">{label}</p>
        <p className="text-[2rem] font-semibold tracking-tighter text-zinc-900 leading-none">{value}</p>
        {sub && <p className="text-[12px] text-zinc-400 mt-1.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function TalentFinances() {
  const [payments, setPayments]   = useState<Payment[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }

      // My bookings
      const { data: bookingsData } = await supabase
        .from("bookings")
        .select("id, job_title, price, status, created_at")
        .eq("talent_user_id", user.id)
        .order("created_at", { ascending: false });

      setPayments(
        (bookingsData ?? []).map((b) => ({
          id:       b.id,
          job:      b.job_title ?? "Untitled job",
          amount:   b.price ?? 0,
          earnings: Math.round((b.price ?? 0) * TALENT_RATE),
          status:   b.status ?? "pending",
          date:     b.created_at,
        }))
      );

      // Referral earnings: find submissions where I am the referrer
      const { data: refSubs } = await supabase
        .from("submissions")
        .select("talent_user_id, job_id")
        .eq("referrer_id", user.id)
        .not("talent_user_id", "is", null);

      if (refSubs && refSubs.length > 0) {
        const refTalentIds = [...new Set(refSubs.map((s) => s.talent_user_id).filter(Boolean))];

        const [{ data: refBookings }, { data: refTalentProfiles }] = await Promise.all([
          supabase
            .from("bookings")
            .select("id, job_title, talent_user_id, price, created_at")
            .in("talent_user_id", refTalentIds)
            .in("status", ["paid", "confirmed"]),
          supabase
            .from("talent_profiles")
            .select("id, full_name")
            .in("id", refTalentIds),
        ]);

        const nameMap = new Map<string, string>();
        for (const p of refTalentProfiles ?? []) nameMap.set(p.id, p.full_name ?? "Unknown");

        setReferrals(
          (refBookings ?? []).map((b) => ({
            id:         b.id,
            talentName: b.talent_user_id ? (nameMap.get(b.talent_user_id) ?? "Unknown") : "Unknown",
            job:        b.job_title ?? "Untitled job",
            amount:     b.price ?? 0,
            commission: Math.round((b.price ?? 0) * REFERRAL_RATE),
            date:       b.created_at,
          }))
        );
      }

      setLoading(false);
    });
  }, []);

  const completed         = payments.filter((p) => p.status === "paid" || p.status === "confirmed");
  const pendingPayment    = payments.filter((p) => p.status === "pending_payment");
  const totalEarnings     = completed.reduce((s, p) => s + p.earnings, 0);
  const pendingEarnings   = pendingPayment.reduce((s, p) => s + p.earnings, 0);
  const referralEarnings  = referrals.reduce((s, r) => s + r.commission, 0);
  const availableToWithdraw = totalEarnings;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Overview</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Finances</h1>
        {!loading && (
          <p className="text-[13px] text-zinc-400 mt-1">
            {payments.length} bookings · {referrals.length} referral{referrals.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-5 h-5 rounded-full border-2 border-zinc-200 border-t-zinc-900 animate-spin" />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="Total Earnings"
              value={usd(totalEarnings + referralEarnings)}
              sub="Paid bookings + referrals"
              stripe="from-indigo-500 to-violet-500"
            />
            <StatCard
              label="Awaiting Payment"
              value={usd(pendingEarnings)}
              sub="Agency hasn't paid yet"
              stripe="from-amber-400 to-orange-500"
            />
            <StatCard
              label="Available"
              value={usd(availableToWithdraw)}
              sub="Paid bookings"
              stripe="from-emerald-400 to-teal-500"
            />
            <StatCard
              label="Referrals"
              value={usd(referralEarnings)}
              sub={`${referrals.length} booking${referrals.length !== 1 ? "s" : ""} (2%)`}
              stripe="from-violet-400 to-purple-500"
            />
          </div>

          {/* Withdraw */}
          <div className="flex items-center justify-between bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] px-6 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">Available to Withdraw</p>
              <p className="text-[1.5rem] font-semibold tracking-tighter text-zinc-900 leading-none">{usd(availableToWithdraw)}</p>
            </div>
            <button
              disabled={availableToWithdraw === 0}
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-100 disabled:text-zinc-400 text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              Withdraw
            </button>
          </div>

          {/* Pending payment notice */}
          {pendingEarnings > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[12px] text-amber-800 leading-relaxed">
                <strong>{usd(pendingEarnings)}</strong> is awaiting payment from the agency — this will move to your available balance once paid.
              </p>
            </div>
          )}

          {/* Commission info */}
          <div className="flex items-center gap-2 text-[12px] text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Platform fee: <strong className="text-zinc-600 mx-1">15%</strong>
            <span className="mx-1">·</span>
            Talent receives: <strong className="text-zinc-600 mx-1">85% of deal value</strong>
            <span className="mx-1">·</span>
            <strong className="text-violet-600">+2% referral fee (if applicable)</strong>
          </div>

          {/* Stripe Connect */}
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">Payout Method</p>
                <p className="text-[15px] font-semibold text-zinc-900">Stripe Connect</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-3">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-[12px] text-amber-800 leading-relaxed">
                Connect your Stripe account to receive payouts directly to your bank account.
              </p>
            </div>
            <button
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold py-3 rounded-xl transition-colors cursor-pointer"
              onClick={() => alert("Stripe Connect coming soon.")}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Connect Stripe Account
            </button>
          </div>

          {/* My bookings */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">My Bookings</p>

            {payments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-zinc-100 py-12 text-center">
                <p className="text-[14px] font-medium text-zinc-500">No bookings yet</p>
                <p className="text-[13px] text-zinc-400 mt-1">Apply for jobs to get booked.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-50/60 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-zinc-900 truncate">{p.job}</p>
                      <p className="text-[12px] text-zinc-400 mt-0.5">
                        {new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_CLS[p.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[15px] font-semibold text-zinc-900 tabular-nums">{usd(p.earnings)}</p>
                      <p className="text-[11px] text-zinc-400 tabular-nums">of {usd(p.amount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Referral earnings */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Referral Earnings</p>
              <span className="text-[10px] font-semibold bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full">2% per booking</span>
            </div>

            {referrals.length === 0 ? (
              <div className="bg-white rounded-2xl border border-zinc-100 py-12 text-center">
                <p className="text-[14px] font-medium text-zinc-500">No referral earnings yet</p>
                <p className="text-[13px] text-zinc-400 mt-1">Refer talent to jobs and earn when they get booked.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
                {referrals.map((r) => (
                  <div key={r.id} className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-50/60 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-zinc-900 truncate">{r.talentName}</p>
                      <p className="text-[12px] text-zinc-400 mt-0.5 truncate">{r.job}</p>
                    </div>
                    <span className="text-[11px] font-semibold bg-violet-50 text-violet-700 ring-1 ring-violet-100 px-2.5 py-1 rounded-full flex-shrink-0">
                      Referral
                    </span>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[15px] font-semibold text-violet-700 tabular-nums">{usd(r.commission)}</p>
                      <p className="text-[11px] text-zinc-400 tabular-nums">of {usd(r.amount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
