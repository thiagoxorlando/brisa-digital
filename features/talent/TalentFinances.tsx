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

type PaidContract = {
  id: string;
  jobTitle: string;
  amount: number;
  earnings: number;
  paid_at: string | null;
  withdrawn_at: string | null;
};

type Payment = {
  id: string;
  job: string;
  amount: number;      // deal value
  earnings: number;    // 85% of amount
  status: string;
  date: string;
  gender: string | null;
  ageMin: number | null;
  ageMax: number | null;
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

type WithdrawState = "idle" | "loading" | "success" | "error";

export default function TalentFinances() {
  const [payments, setPayments]         = useState<Payment[]>([]);
  const [referrals, setReferrals]       = useState<Referral[]>([]);
  const [paidContracts, setPaidContracts] = useState<PaidContract[]>([]);
  const [loading, setLoading]           = useState(true);
  const [withdrawState, setWithdrawState] = useState<WithdrawState>("idle");
  const [withdrawMsg, setWithdrawMsg]   = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }

      // My bookings
      const { data: bookingsData } = await supabase
        .from("bookings")
        .select("id, job_title, price, status, created_at, job_id")
        .eq("talent_user_id", user.id)
        .order("created_at", { ascending: false });

      // Fetch job requirements (gender, age)
      const jobIds = [...new Set((bookingsData ?? []).map((b) => b.job_id).filter(Boolean))];
      const jobReqMap = new Map<string, { gender: string | null; age_min: number | null; age_max: number | null }>();
      if (jobIds.length) {
        const { data: jobsData } = await supabase
          .from("jobs")
          .select("id, gender, age_min, age_max")
          .in("id", jobIds);
        for (const j of jobsData ?? []) {
          jobReqMap.set(j.id, { gender: j.gender ?? null, age_min: j.age_min ?? null, age_max: j.age_max ?? null });
        }
      }

      setPayments(
        (bookingsData ?? []).map((b) => {
          const req = b.job_id ? jobReqMap.get(b.job_id) : null;
          return {
            id:       b.id,
            job:      b.job_title ?? "Untitled job",
            amount:   b.price ?? 0,
            earnings: Math.round((b.price ?? 0) * TALENT_RATE),
            status:   b.status ?? "pending",
            date:     b.created_at,
            gender:   req?.gender ?? null,
            ageMin:   req?.age_min ?? null,
            ageMax:   req?.age_max ?? null,
          };
        })
      );

      // Paid contracts — the source of truth for withdrawals
      const { data: contractsData } = await supabase
        .from("contracts")
        .select("id, job_id, payment_amount, paid_at, withdrawn_at")
        .eq("talent_id", user.id)
        .eq("status", "paid")
        .order("paid_at", { ascending: false });

      // Resolve job titles for contracts
      const contractJobIds = [...new Set((contractsData ?? []).map((c) => c.job_id).filter(Boolean))];
      const contractJobMap = new Map<string, string>();
      if (contractJobIds.length) {
        const { data: cJobs } = await supabase
          .from("jobs").select("id, title").in("id", contractJobIds);
        for (const j of cJobs ?? []) contractJobMap.set(j.id, j.title ?? "Untitled Job");
      }

      setPaidContracts(
        (contractsData ?? []).map((c) => ({
          id:           c.id,
          jobTitle:     c.job_id ? (contractJobMap.get(c.job_id) ?? "Untitled Job") : "Untitled Job",
          amount:       c.payment_amount ?? 0,
          earnings:     Math.round((c.payment_amount ?? 0) * TALENT_RATE),
          paid_at:      c.paid_at      ?? null,
          withdrawn_at: c.withdrawn_at ?? null,
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

  const completed           = payments.filter((p) => p.status === "paid" || p.status === "confirmed");
  const pendingPayment      = payments.filter((p) => p.status === "pending_payment");
  const totalEarnings       = completed.reduce((s, p) => s + p.earnings, 0);
  const pendingEarnings     = pendingPayment.reduce((s, p) => s + p.earnings, 0);
  const referralEarnings    = referrals.reduce((s, r) => s + r.commission, 0);

  // Available = paid contracts not yet withdrawn
  const withdrawableContracts = paidContracts.filter((c) => !c.withdrawn_at);
  const withdrawnContracts    = paidContracts.filter((c) => !!c.withdrawn_at);
  const availableToWithdraw   = withdrawableContracts.reduce((s, c) => s + c.earnings, 0);
  const alreadyWithdrawn      = withdrawnContracts.reduce((s, c) => s + c.earnings, 0);

  async function handleWithdraw() {
    if (withdrawableContracts.length === 0) return;
    setWithdrawState("loading");
    try {
      // Withdraw each unwithdrown paid contract
      const results = await Promise.all(
        withdrawableContracts.map((c) =>
          fetch(`/api/contracts/${c.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "withdraw" }),
          }).then((r) => r.json())
        )
      );
      const allOk = results.every((r) => r.ok || r.withdrawn_at);
      if (allOk) {
        const now = new Date().toISOString();
        setPaidContracts((prev) =>
          prev.map((c) => c.withdrawn_at ? c : { ...c, withdrawn_at: now })
        );
        setWithdrawState("success");
        setWithdrawMsg(
          `Withdrawal confirmed! ${usd(availableToWithdraw)} for ${withdrawableContracts.length} contract${withdrawableContracts.length > 1 ? "s" : ""} is on its way.`
        );
      } else {
        setWithdrawState("error");
        setWithdrawMsg("Something went wrong. Please try again.");
      }
    } catch {
      setWithdrawState("error");
      setWithdrawMsg("Network error. Please try again.");
    }
  }

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
              label="Total Earned"
              value={usd(availableToWithdraw + alreadyWithdrawn + referralEarnings)}
              sub="Paid contracts + referrals"
              stripe="from-indigo-500 to-violet-500"
            />
            <StatCard
              label="Awaiting Payment"
              value={usd(pendingEarnings)}
              sub="Agency hasn't released yet"
              stripe="from-amber-400 to-orange-500"
            />
            <StatCard
              label="Available to Withdraw"
              value={usd(availableToWithdraw)}
              sub={withdrawableContracts.length > 0 ? `${withdrawableContracts.length} contract${withdrawableContracts.length > 1 ? "s" : ""} ready` : "Nothing pending"}
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
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">Available to Withdraw</p>
                <p className="text-[1.75rem] font-semibold tracking-tighter text-zinc-900 leading-none">{usd(availableToWithdraw)}</p>
                {alreadyWithdrawn > 0 && (
                  <p className="text-[12px] text-zinc-400 mt-1">{usd(alreadyWithdrawn)} already withdrawn</p>
                )}
              </div>
              <button
                onClick={handleWithdraw}
                disabled={availableToWithdraw === 0 || withdrawState === "loading" || withdrawState === "success"}
                className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-100 disabled:text-zinc-400 text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {withdrawState === "loading" ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Processing…
                  </>
                ) : withdrawState === "success" ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Withdrawn
                  </>
                ) : "Withdraw"}
              </button>
            </div>

            {/* Success message */}
            {withdrawState === "success" && (
              <div className="mx-6 mb-5 flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[13px] text-emerald-800 font-medium leading-relaxed">{withdrawMsg}</p>
              </div>
            )}

            {/* Error message */}
            {withdrawState === "error" && (
              <div className="mx-6 mb-5 flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[13px] text-rose-700 font-medium leading-relaxed">{withdrawMsg}</p>
              </div>
            )}

            {/* Per-contract breakdown */}
            {paidContracts.length > 0 && (
              <div className="border-t border-zinc-50 divide-y divide-zinc-50">
                {paidContracts.map((c) => (
                  <div key={c.id} className="flex items-center gap-4 px-6 py-3 hover:bg-zinc-50/60 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-zinc-900 truncate">{c.jobTitle}</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Paid {c.paid_at ? new Date(c.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </p>
                    </div>
                    {c.withdrawn_at ? (
                      <span className="text-[11px] font-semibold bg-zinc-100 text-zinc-500 px-2.5 py-1 rounded-full flex-shrink-0">
                        Withdrawn
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-100 px-2.5 py-1 rounded-full flex-shrink-0">
                        Ready
                      </span>
                    )}
                    <p className="text-[14px] font-semibold text-zinc-900 tabular-nums flex-shrink-0">{usd(c.earnings)}</p>
                  </div>
                ))}
              </div>
            )}
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
                      {(p.gender || (p.ageMin && p.ageMax)) && (
                        <p className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-2">
                          {p.gender && p.gender !== "any" && (
                            <span className="bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-medium capitalize">{p.gender}</span>
                          )}
                          {p.ageMin && p.ageMax && (
                            <span className="bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-medium">Age {p.ageMin}–{p.ageMax}</span>
                          )}
                        </p>
                      )}
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

          {/* Withdrawal history */}
          {withdrawnContracts.length > 0 && (() => {
            // Group by day (YYYY-MM-DD) so each "Withdraw" click = one receipt
            const groups = new Map<string, PaidContract[]>();
            for (const c of withdrawnContracts) {
              const day = c.withdrawn_at ? c.withdrawn_at.slice(0, 10) : "unknown";
              if (!groups.has(day)) groups.set(day, []);
              groups.get(day)!.push(c);
            }
            const receipts = [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
            return (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Withdrawal History</p>
                <div className="space-y-3">
                  {receipts.map(([day, items], i) => {
                    const total = items.reduce((s, c) => s + c.earnings, 0);
                    const date  = new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
                    return (
                      <div key={day} className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
                        <div className="flex items-center gap-4 px-5 py-4">
                          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-zinc-900">Withdrawal #{receipts.length - i}</p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">{date}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[20px] font-semibold tracking-tight text-emerald-700 tabular-nums leading-none">{usd(total)}</p>
                            <span className="inline-flex mt-1.5 text-[10px] font-semibold bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 px-2 py-0.5 rounded-full">
                              Completed
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

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
