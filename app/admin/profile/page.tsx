"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Metadata } from "next";

export default function AdminProfilePage() {
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [preview,  setPreview]  = useState<string | null>(null);
  const [file,     setFile]     = useState<File | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setEmail(user.email ?? "");
      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .single();
      setName(data?.full_name ?? "");
      setAvatarUrl(data?.avatar_url ?? null);
      setLoading(false);
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    let newAvatarUrl = avatarUrl;

    if (file) {
      const ext = file.name.split(".").pop();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", `admin-avatars/${user.id}.${ext}`);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError("Falha ao enviar foto: " + (json.error ?? "Erro desconhecido"));
        setSaving(false);
        return;
      }
      newAvatarUrl = json.url;
      setAvatarUrl(newAvatarUrl);
    }

    const { error: dbErr } = await supabase
      .from("profiles")
      .update({ full_name: name.trim(), avatar_url: newAvatarUrl })
      .eq("id", user.id);

    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const initials = name
    ? name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "A";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-5 h-5 rounded-full border-2 border-zinc-200 border-t-zinc-900 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Admin da Plataforma</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Meu Perfil</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Avatar */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-6 space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Foto de Perfil</p>
          <div className="flex items-center gap-5">
            <div
              onClick={() => fileRef.current?.click()}
              className="w-20 h-20 rounded-2xl border-2 border-dashed border-zinc-200 hover:border-zinc-400 cursor-pointer transition-colors overflow-hidden flex items-center justify-center bg-zinc-50 flex-shrink-0"
            >
              {(preview ?? avatarUrl) ? (
                <img src={preview ?? avatarUrl!} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[1.5rem] font-bold text-zinc-400">{initials}</span>
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-[13px] font-medium text-zinc-700 hover:text-zinc-900 transition-colors cursor-pointer"
              >
                Alterar foto
              </button>
              <p className="text-[11px] text-zinc-400 mt-1">JPG, PNG, WebP · Máx. 5 MB</p>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                setFile(e.target.files[0]);
                setPreview(URL.createObjectURL(e.target.files[0]));
              }
            }}
          />
        </div>

        {/* Info */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-6 space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Informações</p>
          <div>
            <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Admin Name"
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
            <p className="text-[11px] text-zinc-400 mt-1">Email não pode ser alterado aqui.</p>
          </div>
        </div>

        {error && (
          <p className="text-[13px] text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-semibold py-3.5 rounded-xl transition-colors cursor-pointer"
        >
          {saving ? "Salvando…" : saved ? "Salvo!" : "Salvar Alterações"}
        </button>
      </form>
    </div>
  );
}

