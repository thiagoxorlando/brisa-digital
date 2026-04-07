"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  userId: string;
  companyName: string;
  avatarUrl: string | null;
  email: string;
  subscriptionStatus: string;
  phone: string;
  address: string;
};

export default function AgencyProfile({ userId, companyName, avatarUrl, email, subscriptionStatus, phone: initialPhone, address: initialAddress }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName]           = useState(companyName);
  const [avatar, setAvatar]       = useState(avatarUrl ?? "");
  const [phone, setPhone]         = useState(initialPhone);
  const [address, setAddress]     = useState(initialAddress);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  const initials = name
    ? name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("path", `agency-avatars/${userId}`);

    const res = await fetch("/api/upload", { method: "POST", body: form });
    const d   = await res.json();

    if (res.ok && d.url) {
      setAvatar(d.url);
    } else {
      showToast(d.error ?? "Upload failed.", false);
    }
    setUploading(false);
    // reset so the same file can be re-selected
    e.target.value = "";
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const res = await fetch("/api/agencies/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_name: name.trim(),
        avatar_url:   avatar || null,
        phone:        phone.trim() || null,
        address:      address.trim() || null,
      }),
    });

    if (res.ok) {
      showToast("Profile updated.", true);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error ?? "Failed to save.", false);
    }
    setSaving(false);
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Toast */}
      {toast && (
        <div className={[
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-[13px] font-medium text-white",
          toast.ok ? "bg-emerald-600" : "bg-rose-600",
        ].join(" ")}>
          {toast.msg}
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Agency</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Profile</h1>
      </div>

      {/* Avatar upload */}
      <div className="flex items-center gap-5">
        <div className="relative group flex-shrink-0">
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            {uploading ? (
              <div className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : avatar ? (
              <img src={avatar} alt={name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[20px] font-bold text-white">{initials}</span>
            )}
          </div>

          {/* Hover overlay */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
            aria-label="Change profile picture"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <div>
          <p className="text-[14px] font-semibold text-zinc-900">{name || "Your Agency"}</p>
          <p className="text-[12px] text-zinc-400">{email}</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mt-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Change photo"}
          </button>
          <span className={[
            "ml-3 text-[10px] font-semibold px-2 py-0.5 rounded-full",
            subscriptionStatus === "active"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-zinc-100 text-zinc-500",
          ].join(" ")}>
            {subscriptionStatus === "active" ? "Pro Plan · Active" : "Pro Plan · Inactive"}
          </span>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-8 space-y-6">

        <div>
          <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">Agency Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your company name"
            className="w-full px-4 py-3 text-[14px] rounded-xl border border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full px-4 py-3 text-[14px] rounded-xl border border-zinc-100 bg-zinc-50 text-zinc-400 cursor-not-allowed"
          />
          <p className="text-[11px] text-zinc-400 mt-1.5">Email cannot be changed here.</p>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 000 0000"
            className="w-full px-4 py-3 text-[14px] rounded-xl border border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, City, Country"
            className="w-full px-4 py-3 text-[14px] rounded-xl border border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={saving || uploading}
          className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white text-[14px] font-medium py-3 rounded-xl transition-colors cursor-pointer"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
