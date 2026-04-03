import type { Metadata } from "next";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "User Profile — Admin — ucastanet" };

const COMMISSION_RATE = 0.15;

function usd(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmt(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ROLE_STYLES: Record<string, string> = {
  admin:  "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  agency: "bg-blue-50   text-blue-700   ring-1 ring-blue-100",
  talent: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
};

export default async function AdminUserProfilePage({ params }: Props) {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });

  const [
    { data: authUser },
    { data: profile },
    { data: talentProfile },
    { data: agency },
    { data: bookings },
    { data: submissions },
  ] = await Promise.all([
    supabase.auth.admin.getUserById(id),
    supabase.from("profiles").select("role, created_at").eq("id", id).single(),
    supabase.from("talent_profiles").select("full_name, bio, avatar_url, phone, country, city, categories, instagram, tiktok, youtube").eq("id", id).single(),
    supabase.from("agencies").select("company_name, contact_name, phone, country, city, description, website").eq("id", id).single(),
    supabase.from("bookings").select("id, job_title, price, status, created_at").or(`talent_user_id.eq.${id},agency_id.eq.${id}`).order("created_at", { ascending: false }).limit(20),
    supabase.from("submissions").select("id, job_id, created_at").eq("talent_user_id", id).limit(10),
  ]);

  const role    = profile?.role ?? "talent";
  const email   = authUser.user?.email ?? "—";
  const joinedAt = authUser.user?.created_at ?? profile?.created_at ?? null;

  const name =
    role === "agency"
      ? (agency?.company_name ?? talentProfile?.full_name ?? "No name")
      : (talentProfile?.full_name ?? "No name");

  const isTalent = role === "talent";
  const isAgency = role === "agency";

  // Financial summary
  const confirmedBookings = (bookings ?? []).filter((b) => b.status === "confirmed");
  const totalEarned        = isTalent ? confirmedBookings.reduce((s, b) => s + Math.round((b.price ?? 0) * 0.85), 0) : 0;
  const totalSpent         = isAgency ? confirmedBookings.reduce((s, b) => s + (b.price ?? 0), 0) : 0;
  const commission         = confirmedBookings.reduce((s, b) => s + Math.round((b.price ?? 0) * COMMISSION_RATE), 0);

  const roleCls = ROLE_STYLES[role] ?? "bg-zinc-100 text-zinc-500";

  return (
    <div className="max-w-4xl space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px]">
        <Link href="/admin/users" className="text-zinc-400 hover:text-zinc-700 transition-colors">Users</Link>
        <span className="text-zinc-300">/</span>
        <span className="text-zinc-600 truncate">{name}</span>
      </div>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {isTalent && talentProfile?.avatar_url ? (
              <img src={talentProfile.avatar_url} alt={name} className="w-16 h-16 rounded-2xl object-cover border border-zinc-100" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <span className="text-[20px] font-bold text-white">
                  {name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase() || "?"}
                </span>
              </div>
            )}
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-[1.5rem] font-semibold tracking-tight text-zinc-900">{name}</h1>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${roleCls}`}>{role}</span>
            </div>
            <p className="text-[13px] text-zinc-500 mt-1">{email}</p>
            <p className="text-[12px] text-zinc-400 mt-0.5">Joined {fmt(joinedAt)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile data */}
        <div className="lg:col-span-2 space-y-5">

          {/* Talent profile */}
          {isTalent && talentProfile && (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6 space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Talent Profile</p>
              {talentProfile.bio && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Bio</p>
                  <p className="text-[13px] text-zinc-600 leading-relaxed">{talentProfile.bio}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-[12px]">
                {[
                  { label: "Phone",    value: talentProfile.phone   ?? "—" },
                  { label: "Country",  value: talentProfile.country ?? "—" },
                  { label: "City",     value: talentProfile.city    ?? "—" },
                  { label: "Instagram", value: talentProfile.instagram ? `@${talentProfile.instagram}` : "—" },
                  { label: "TikTok",   value: talentProfile.tiktok  ? `@${talentProfile.tiktok}` : "—" },
                  { label: "YouTube",  value: talentProfile.youtube ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">{label}</p>
                    <p className="text-zinc-700">{value}</p>
                  </div>
                ))}
              </div>
              {(talentProfile.categories ?? []).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Categories</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(talentProfile.categories as string[]).map((c) => (
                      <span key={c} className="text-[11px] font-medium bg-zinc-100 text-zinc-600 px-2.5 py-1 rounded-full">{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Agency profile */}
          {isAgency && agency && (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6 space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Agency Profile</p>
              {agency.description && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Description</p>
                  <p className="text-[13px] text-zinc-600 leading-relaxed">{agency.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-[12px]">
                {[
                  { label: "Contact",  value: agency.contact_name ?? "—" },
                  { label: "Phone",    value: agency.phone        ?? "—" },
                  { label: "Country",  value: agency.country      ?? "—" },
                  { label: "City",     value: agency.city         ?? "—" },
                  { label: "Website",  value: agency.website      ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">{label}</p>
                    <p className="text-zinc-700">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent bookings */}
          {(bookings ?? []).length > 0 && (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-50">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                  Recent Bookings
                </p>
              </div>
              <div className="divide-y divide-zinc-50">
                {(bookings ?? []).map((b) => {
                  const stMap: Record<string, string> = {
                    confirmed: "bg-emerald-50 text-emerald-700",
                    pending:   "bg-amber-50 text-amber-700",
                    cancelled: "bg-zinc-100 text-zinc-500",
                  };
                  return (
                    <div key={b.id} className="flex items-center gap-4 px-6 py-3.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-zinc-800 truncate">{b.job_title ?? "Booking"}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{fmt(b.created_at)}</p>
                      </div>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize flex-shrink-0 ${stMap[b.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                        {b.status}
                      </span>
                      <span className="text-[13px] font-semibold text-zinc-900 tabular-nums flex-shrink-0">
                        {b.price > 0 ? usd(b.price) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: stats */}
        <div className="space-y-4">
          {[
            isTalent && { label: "Total Earned",   value: usd(totalEarned),  stripe: "from-emerald-400 to-teal-500" },
            isAgency  && { label: "Total Spent",    value: usd(totalSpent),   stripe: "from-blue-400 to-indigo-500" },
            { label: "Commission",               value: usd(commission),   stripe: "from-violet-400 to-purple-500" },
            { label: "Bookings",                 value: String((bookings ?? []).length), stripe: "from-zinc-400 to-zinc-600" },
            isTalent && { label: "Applications", value: String((submissions ?? []).length), stripe: "from-sky-400 to-blue-500" },
          ].filter(Boolean).map((s) => {
            if (!s) return null;
            const { label, value, stripe } = s as { label: string; value: string; stripe: string };
            return (
              <div key={label} className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className={`h-[3px] bg-gradient-to-r ${stripe}`} />
                <div className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{label}</p>
                  <p className="text-[1.5rem] font-semibold tracking-tighter text-zinc-900 leading-none">{value}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
