"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useT } from "@/lib/LanguageContext";

// ── Change Password ────────────────────────────────────────────────────────────

function ChangePasswordSection() {
  const { t } = useT();
  const [open, setOpen]       = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext]       = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setSaving(true);

    const res = await fetch("/api/profile/change-password", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ currentPassword: current, newPassword: next, confirmPassword: confirm }),
    });
    const d = await res.json().catch(() => ({}));

    setSaving(false);

    if (res.ok) {
      setSuccess(true);
      setCurrent("");
      setNext("");
      setConfirm("");
      setTimeout(() => { setSuccess(false); setOpen(false); }, 3000);
    } else {
      setError(d.error ?? t("account_pw_error_default"));
    }
  }

  const inputCls =
    "w-full px-4 py-3 text-[14px] rounded-xl border border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors bg-white";

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">{t("account_section_security")}</p>
          <p className="text-[14px] font-semibold text-zinc-900">{t("account_pw_title")}</p>
        </div>
        <button
          type="button"
          onClick={() => { setOpen((o) => !o); setError(""); setSuccess(false); }}
          className="text-[13px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
        >
          {open ? t("action_cancel") : t("account_pw_change_btn")}
        </button>
      </div>

      {open && (
        // autoComplete="off" on the form prevents the browser from showing
        // saved-credential choosers when the user focuses a password field.
        <form onSubmit={handleSubmit} className="mt-5 space-y-4" autoComplete="off">
          {/* Hidden username keeps browser autofill from misidentifying the form */}
          <input type="text" name="username" autoComplete="username" className="hidden" readOnly tabIndex={-1} />
          <div>
            <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">{t("account_current_pw")}</label>
            <input
              type="password" required autoComplete="current-password"
              value={current} onChange={(e) => setCurrent(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">{t("account_new_pw")}</label>
            <input
              type="password" required autoComplete="new-password" minLength={8}
              value={next} onChange={(e) => setNext(e.target.value)}
              className={inputCls}
            />
            <p className="text-[11px] text-zinc-400 mt-1">{t("account_new_pw_hint")}</p>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">{t("account_confirm_pw")}</label>
            <input
              type="password" required autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className={inputCls}
            />
          </div>

          {error && (
            <p className="text-[13px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
              {error}
            </p>
          )}
          {success && (
            <p className="text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
              {t("account_pw_success")}
            </p>
          )}

          <button
            type="submit" disabled={saving}
            className="w-full bg-zinc-900 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-medium py-3 rounded-xl transition-colors cursor-pointer"
          >
            {saving ? t("account_pw_saving") : t("account_pw_save")}
          </button>
        </form>
      )}
    </div>
  );
}

// ── Delete Account ─────────────────────────────────────────────────────────────

function DeleteAccountSection() {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const confirmWord = t("account_delete_confirm_word");

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/profile/delete-account", { method: "POST" });
    const d   = await res.json().catch(() => ({}));

    if (!res.ok) {
      setLoading(false);
      setError(d.error ?? t("account_delete_error_default"));
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="bg-white rounded-2xl border border-rose-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-400 mb-0.5">{t("account_danger_zone")}</p>
          <p className="text-[14px] font-semibold text-zinc-900">{t("account_delete_title")}</p>
          <p className="text-[12px] text-zinc-400 mt-0.5">
            {t("account_delete_desc")}
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[13px] font-medium text-rose-600 hover:text-rose-800 transition-colors cursor-pointer whitespace-nowrap ml-4"
          >
            {t("account_delete_btn")}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={handleDelete} className="mt-5 space-y-4">
          <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3.5 text-[13px] text-rose-700 leading-relaxed">
            {t("account_delete_confirm_hint")}
          </div>

          <div>
            <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">
              {t("account_delete_confirm_label")}
            </label>
            <input
              type="text" required autoComplete="off"
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-4 py-3 text-[14px] rounded-xl border border-rose-200 focus:border-rose-400 focus:outline-none transition-colors"
            />
          </div>

          {error && (
            <p className="text-[13px] text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setOpen(false); setConfirm(""); setError(""); }}
              className="flex-1 border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-[14px] font-medium py-3 rounded-xl transition-colors cursor-pointer"
            >
              {t("action_cancel")}
            </button>
            <button
              type="submit"
              disabled={loading || confirm !== confirmWord}
              className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-medium py-3 rounded-xl transition-colors cursor-pointer"
            >
              {loading ? t("account_deleting") : t("account_delete_confirm_btn")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Exported combined section ──────────────────────────────────────────────────

export default function AccountActions() {
  return (
    <div className="space-y-4">
      <ChangePasswordSection />
      <DeleteAccountSection />
    </div>
  );
}
