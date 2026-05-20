"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { initials } from "@/lib/talentDisplay";

// ─── Types ────────────────────────────────────────────────────────────────────

type Candidate = {
  id: string;
  name: string;
  avatarUrl: string | null;
  age: number | null;
  city: string | null;
  gender: string | null;
  bio: string;
  photoFrontUrl: string | null;
  photoLeftUrl: string | null;
  photoRightUrl: string | null;
  videoUrl: string | null;
  portfolioUrl: string | null;
  curriculumUrl: string | null;
};

type Workspace = {
  name: string;
  logoUrl: string | null;
  brandColor: string;
  brandAccentColor: string | null;
  welcomeMessage: string | null;
};

type PresentationData = {
  id: string;
  title: string;
  intro: string | null;
  workspace: Workspace;
  candidates: Candidate[];
};

type Vote = "approved" | "rejected" | "favorite";
type VoteMap = Record<string, Vote>;

type ViewerIdentity = {
  name: string;
  company: string;
  email: string;
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

const SESSION_KEY  = "brisa_presentation_session";
const IDENTITY_KEY = "brisa_client_identity";

function getClientToken(): string {
  if (typeof localStorage === "undefined") return crypto.randomUUID();
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, next);
  return next;
}

function loadIdentity(): ViewerIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ViewerIdentity;
    if (parsed.name?.trim()) return parsed;
    return null;
  } catch { return null; }
}

function saveIdentity(id: ViewerIdentity) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(id));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genderLabel(g: string | null): string | null {
  if (!g) return null;
  const map: Record<string, string> = {
    male: "Masculino", female: "Feminino", non_binary: "Não-binário",
    masculino: "Masculino", feminino: "Feminino",
  };
  return map[g.toLowerCase()] ?? g;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientPresentation({ token }: { token: string }) {
  const [state, setState] = useState<"loading" | "identity" | "gate" | "ready" | "expired" | "error">("loading");
  const [gatePassword, setGatePassword] = useState("");
  const [gateError, setGateError]       = useState("");
  const [gateLoading, setGateLoading]   = useState(false);
  const [data, setData]                 = useState<PresentationData | null>(null);
  const [votes, setVotes]               = useState<VoteMap>({});
  const [lightbox, setLightbox]         = useState<{ url: string; list: string[]; idx: number } | null>(null);
  const [toastMsg, setToastMsg]         = useState<string | null>(null);
  const [identity, setIdentity]         = useState<ViewerIdentity | null>(null);
  const clientTokenRef                  = useRef<string>("");

  const fetchPresentation = useCallback(async (password?: string) => {
    const url = password
      ? `/api/presentation/${token}?password=${encodeURIComponent(password)}`
      : `/api/presentation/${token}`;

    const res  = await fetch(url);
    const json = await res.json() as {
      requiresPassword?: boolean;
      error?: string;
      presentation?: PresentationData;
    };

    if (res.status === 401 && json.requiresPassword) { setState("gate"); return; }
    if (res.status === 401) { setGateError(json.error ?? "Senha incorreta."); setGateLoading(false); return; }
    if (res.status === 410) { setState("expired"); return; }
    if (!res.ok || !json.presentation) { setState("error"); return; }

    setData(json.presentation);
    setState("ready");
  }, [token]);

  // On mount: check identity, then maybe fetch
  useEffect(() => {
    clientTokenRef.current = getClientToken();
    const stored = loadIdentity();
    if (stored) {
      setIdentity(stored);
      fetchPresentation();
    } else {
      setState("identity");
    }
  }, [fetchPresentation]);

  // Toast helper
  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }

  async function handleIdentitySubmit(id: ViewerIdentity) {
    saveIdentity(id);
    setIdentity(id);
    setState("loading");
    await fetchPresentation();
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!gatePassword.trim()) return;
    setGateLoading(true);
    setGateError("");
    await fetchPresentation(gatePassword.trim());
  }

  async function submitVote(candidateId: string, vote: Vote) {
    const prev     = votes[candidateId];
    const nextVote = prev === vote ? null : vote;

    setVotes((v) => {
      const next = { ...v };
      if (nextVote) next[candidateId] = nextVote;
      else delete next[candidateId];
      return next;
    });

    if (!nextVote) return;

    const voteLabels: Record<Vote, string> = {
      approved: "Aprovação registrada",
      favorite: "Adicionado aos favoritos",
      rejected: "Feedback enviado",
    };
    showToast(voteLabels[nextVote]);

    fetch(`/api/presentation/${token}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId:  candidateId,
        vote:          nextVote,
        clientToken:   clientTokenRef.current,
        viewerName:    identity?.name    ?? null,
        viewerCompany: identity?.company ?? null,
        viewerEmail:   identity?.email   ?? null,
      }),
    }).catch(() => {});
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (state === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#060F0F]">
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-white/10 border-t-[#1ABC9C]" />
        <p className="text-[13px] font-medium text-white/40">Carregando…</p>
      </div>
    );
  }

  // ── Identity gate ─────────────────────────────────────────────────────────────
  if (state === "identity") {
    return <IdentityGate onSubmit={handleIdentitySubmit} />;
  }

  // ── Expired ──────────────────────────────────────────────────────────────────
  if (state === "expired") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#060F0F] px-4">
        <div className="w-full max-w-sm rounded-3xl border border-white/8 bg-white/4 p-10 text-center backdrop-blur-sm">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/8">
            <svg className="h-7 w-7 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-[1.1rem] font-bold text-white">Apresentação expirada</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-white/50">Este link não está mais ativo. Entre em contato com a agência.</p>
          <p className="mt-8 text-[11px] text-white/20">Powered by BrisaHub</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (state === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#060F0F] px-4">
        <div className="w-full max-w-sm rounded-3xl border border-white/8 bg-white/4 p-10 text-center backdrop-blur-sm">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/8">
            <svg className="h-7 w-7 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h1 className="text-[1.1rem] font-bold text-white">Apresentação não encontrada</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-white/50">Verifique o link e tente novamente.</p>
          <p className="mt-8 text-[11px] text-white/20">Powered by BrisaHub</p>
        </div>
      </div>
    );
  }

  // ── Password gate ─────────────────────────────────────────────────────────────
  if (state === "gate") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#060F0F] px-4">
        {/* Ambient glow */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#1ABC9C]/10 blur-[120px]" />
        </div>
        <div className="relative w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(135deg, #1ABC9C, #0E7CB6)" }}>
              <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-[1.2rem] font-bold text-white">Acesso protegido</h2>
            <p className="mt-1 text-[13px] text-white/50">Insira a senha fornecida pela agência.</p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-3">
            <input
              type="password"
              placeholder="Senha de acesso"
              value={gatePassword}
              onChange={(e) => setGatePassword(e.target.value)}
              autoFocus
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/6 px-4 text-[14px] text-white placeholder:text-white/30 focus:border-[#1ABC9C]/60 focus:outline-none focus:ring-2 focus:ring-[#1ABC9C]/20 transition-all backdrop-blur-sm"
            />
            {gateError && (
              <p className="rounded-xl bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-400">{gateError}</p>
            )}
            <button
              type="submit"
              disabled={gateLoading || !gatePassword.trim()}
              className="h-12 w-full rounded-2xl text-[14px] font-bold text-white transition-all disabled:opacity-50 cursor-pointer hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #1ABC9C, #0E7CB6)" }}
            >
              {gateLoading ? "Verificando…" : "Entrar →"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const ws          = data.workspace;
  const brandColor  = ws.brandColor       || "#1ABC9C";
  const accentColor = ws.brandAccentColor || "#0E7CB6";
  const approvedCount = Object.values(votes).filter((v) => v === "approved").length;
  const favoriteCount = Object.values(votes).filter((v) => v === "favorite").length;
  const rejectedCount = Object.values(votes).filter((v) => v === "rejected").length;
  const totalVoted    = Object.keys(votes).length;

  // ── Main presentation ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F0F1F3]">

      {/* ── Hero ── */}
      <header
        className="relative overflow-hidden"
        style={{
          background: "#0C0E0E",
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.032) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.032) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      >
        {/* Brand color wash over grid */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${brandColor}18 0%, transparent 70%)` }}
        />

        {/* Top border in brand color */}
        <div className="relative h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${brandColor} 30%, ${accentColor} 70%, transparent)` }} />

        {/* Viewer identity — top right */}
        {identity && (
          <div className="relative flex justify-end px-5 pt-4 sm:px-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-sm">
              <div
                className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black"
                style={{ backgroundColor: `${brandColor}30`, color: brandColor }}
              >
                {initials(identity.name)}
              </div>
              <span className="text-[11px] font-medium text-white/60">{identity.name}</span>
              {identity.company && <span className="text-[10px] text-white/30">· {identity.company}</span>}
            </div>
          </div>
        )}

        {/* Hero content — centered */}
        <div className="relative mx-auto max-w-[1100px] px-5 pb-14 pt-10 text-center sm:px-8 sm:pt-12">

          {/* Round logo */}
          <div className="mb-5 flex justify-center">
            {ws.logoUrl ? (
              <div
                className="h-[88px] w-[88px] overflow-hidden rounded-full p-[3px]"
                style={{ background: `linear-gradient(135deg, ${brandColor}, ${accentColor})` }}
              >
                <img
                  src={ws.logoUrl}
                  alt={ws.name}
                  className="h-full w-full rounded-full object-cover"
                />
              </div>
            ) : (
              <div
                className="flex h-[88px] w-[88px] items-center justify-center rounded-full text-[24px] font-black text-white"
                style={{ background: `linear-gradient(135deg, ${brandColor}, ${accentColor})` }}
              >
                {ws.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          {/* Agency name */}
          <p
            className="mb-1 text-[11px] font-black uppercase tracking-[0.22em]"
            style={{ color: brandColor }}
          >
            {ws.name}
          </p>

          {/* Welcome message / tagline */}
          {ws.welcomeMessage ? (
            <p className="mb-7 mt-1.5 text-[13px] text-white/40">{ws.welcomeMessage}</p>
          ) : (
            <div className="mb-7 mt-1.5 h-[1px] w-8 mx-auto rounded-full" style={{ background: `${brandColor}50` }} />
          )}

          {/* Presentation title */}
          <h1 className="mx-auto max-w-2xl text-[2.8rem] font-black leading-[1.08] tracking-[-0.025em] text-white sm:text-[3.4rem]">
            {data.title}
          </h1>

          {/* Intro */}
          {data.intro && (
            <p className="mx-auto mt-4 max-w-lg text-[14px] leading-[1.8] text-white/50 whitespace-pre-wrap">
              {data.intro}
            </p>
          )}

          {/* Stats */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-bold text-white"
              style={{ background: `${brandColor}22`, border: `1px solid ${brandColor}40` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: brandColor }} />
              {data.candidates.length} talento{data.candidates.length !== 1 ? "s" : ""}
            </span>
            {approvedCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3.5 py-1.5 text-[12px] font-bold text-emerald-400" style={{ border: "1px solid rgba(52,211,153,0.2)" }}>
                ✓ {approvedCount} aprovado{approvedCount !== 1 ? "s" : ""}
              </span>
            )}
            {favoriteCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3.5 py-1.5 text-[12px] font-bold text-amber-400" style={{ border: "1px solid rgba(251,191,36,0.2)" }}>
                ★ {favoriteCount} favorito{favoriteCount !== 1 ? "s" : ""}
              </span>
            )}
            {rejectedCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3.5 py-1.5 text-[12px] font-bold text-white/35 border border-white/10">
                ✕ {rejectedCount} rejeitado{rejectedCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Hard bottom edge — no fade, just a clean line */}
        <div className="h-[1px] w-full" style={{ background: `linear-gradient(90deg, transparent, ${brandColor}30, transparent)` }} />
      </header>

      {/* ── Instruction hint (first visit) ── */}
      {totalVoted === 0 && data.candidates.length > 0 && (
        <div className="mx-auto max-w-[1100px] px-5 pt-6 sm:px-8">
          <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <div
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
              style={{ background: `${brandColor}18` }}
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: brandColor }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-[12px] text-zinc-600">
              Use <strong className="text-emerald-700">Aprovar</strong>, <strong className="text-amber-600">Favoritar</strong> ou <strong className="text-zinc-500">Rejeitar</strong> em cada talento para enviar seu feedback.
            </p>
          </div>
        </div>
      )}

      {/* ── Candidate grid ── */}
      <main className="mx-auto max-w-[1100px] px-5 pb-20 pt-5 sm:px-8">
        {data.candidates.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white py-24 text-center">
            <p className="text-[15px] font-semibold text-zinc-500">Nenhum talento nesta apresentação</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.candidates.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                vote={votes[c.id] ?? null}
                brandColor={brandColor}
                onVote={(v) => submitVote(c.id, v)}
                onOpenLightbox={(list, idx) => setLightbox({ url: list[idx], list, idx })}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-20 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 opacity-35">
            <div
              className="h-5 w-5 rounded-md"
              style={{ background: `linear-gradient(135deg, ${brandColor}, ${accentColor})` }}
            />
            <span className="text-[12px] font-bold text-zinc-700">BrisaHub</span>
          </div>
          <p className="text-[10px] text-zinc-400">Plataforma de casting e talentos</p>
        </div>
      </main>

      {/* ── Lightbox ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox((l) => l && l.idx > 0 ? { ...l, idx: l.idx - 1, url: l.list[l.idx - 1] } : l); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <img
            src={lightbox.url}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox((l) => l && l.idx < l.list.length - 1 ? { ...l, idx: l.idx + 1, url: l.list[l.idx + 1] } : l); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <button onClick={() => setLightbox(null)} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          {lightbox.list.length > 1 && (
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-1.5">
              {lightbox.list.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setLightbox((l) => l ? { ...l, idx: i, url: l.list[i] } : l); }}
                  className={["h-1.5 rounded-full cursor-pointer transition-all", i === lightbox.idx ? "w-5 bg-white" : "w-1.5 bg-white/40"].join(" ")}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Vote toast ── */}
      {toastMsg && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-40 -translate-x-1/2">
          <div className="rounded-2xl border border-white/10 bg-zinc-900 px-5 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-white">
              <span style={{ color: brandColor }}>✓</span>
              {toastMsg}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Identity gate ────────────────────────────────────────────────────────────

function IdentityGate({ onSubmit }: { onSubmit: (id: ViewerIdentity) => void }) {
  const [name,    setName]    = useState("");
  const [company, setCompany] = useState("");
  const [email,   setEmail]   = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Por favor informe seu nome."); return; }
    setError("");
    setLoading(true);
    onSubmit({ name: name.trim(), company: company.trim(), email: email.trim() });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#060F0F] px-4">
      {/* Ambient */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-[#1ABC9C]/8 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-[#0E7CB6]/10 blur-[80px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo + intro */}
        <div className="mb-10 text-center">
          <div
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl shadow-[0_0_40px_rgba(26,188,156,0.25)]"
            style={{ background: "linear-gradient(135deg, #1ABC9C, #0E7CB6)" }}
          >
            <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-[1.8rem] font-black tracking-tight text-white">
            Apresentação de talentos
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-white/50">
            Identifique-se para acessar e enviar seu feedback à agência.
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-3xl border border-white/8 bg-white/4 p-7 backdrop-blur-md">
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-white/40">
                Nome completo <span className="text-[#1ABC9C]">*</span>
              </label>
              <input
                type="text"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/6 px-4 text-[14px] text-white placeholder:text-white/25 focus:border-[#1ABC9C]/50 focus:outline-none focus:ring-2 focus:ring-[#1ABC9C]/15 transition-all"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-white/40">
                Empresa / Marca <span className="text-white/25">(opcional)</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Nike Brasil"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/6 px-4 text-[14px] text-white placeholder:text-white/25 focus:border-[#1ABC9C]/50 focus:outline-none focus:ring-2 focus:ring-[#1ABC9C]/15 transition-all"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-white/40">
                E-mail <span className="text-white/25">(opcional)</span>
              </label>
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/6 px-4 text-[14px] text-white placeholder:text-white/25 focus:border-[#1ABC9C]/50 focus:outline-none focus:ring-2 focus:ring-[#1ABC9C]/15 transition-all"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="mt-1 h-13 w-full rounded-2xl py-3.5 text-[15px] font-black text-white transition-all disabled:opacity-40 cursor-pointer hover:opacity-90 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #1ABC9C 0%, #0E7CB6 100%)" }}
            >
              {loading ? "Entrando…" : "Acessar apresentação →"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-white/20">
          Seus dados são compartilhados apenas com a agência que enviou este link.
        </p>
      </div>
    </div>
  );
}

// ─── Candidate card ───────────────────────────────────────────────────────────

function CandidateCard({
  candidate: c,
  vote,
  brandColor,
  onVote,
  onOpenLightbox,
}: {
  candidate: Candidate;
  vote: Vote | null;
  brandColor: string;
  onVote: (v: Vote) => void;
  onOpenLightbox: (list: string[], idx: number) => void;
}) {
  const photos = [c.photoFrontUrl, c.photoLeftUrl, c.photoRightUrl].filter(Boolean) as string[];
  const [photoIdx, setPhotoIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // Touch swipe on photos
  const touchStartX = useRef(0);
  function onTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) setPhotoIdx((i) => Math.min(i + 1, photos.length - 1));
    else         setPhotoIdx((i) => Math.max(i - 1, 0));
  }

  const metaParts: string[] = [];
  if (c.age)    metaParts.push(`${c.age} anos`);
  if (c.city)   metaParts.push(c.city);
  if (c.gender) { const gl = genderLabel(c.gender); if (gl) metaParts.push(gl); }

  const hasExpandable = !!(c.videoUrl || c.portfolioUrl || c.curriculumUrl || (c.bio && c.bio.length > 120));

  // Vote ring
  const borderCls =
    vote === "approved" ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#F8F9FA]" :
    vote === "favorite" ? "ring-2 ring-amber-400  ring-offset-2 ring-offset-[#F8F9FA]" :
    vote === "rejected" ? "ring-2 ring-zinc-300   ring-offset-2 ring-offset-[#F8F9FA]" : "";

  return (
    <div className={[
      "group flex flex-col overflow-hidden rounded-[28px] bg-white transition-all duration-300",
      "shadow-[0_2px_20px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.14)] hover:-translate-y-1",
      borderCls,
    ].join(" ")}>

      {/* ── Photo area ── */}
      <div
        className="relative aspect-[3/4] cursor-zoom-in overflow-hidden bg-zinc-100"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={() => photos.length > 0 && onOpenLightbox(photos, photoIdx)}
      >
        {photos.length > 0 ? (
          <>
            <img
              src={photos[photoIdx]}
              alt={c.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />

            {/* Bottom gradient */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

            {/* Name + meta overlaid at bottom */}
            <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
              <h3 className="text-[16px] font-black leading-tight text-white drop-shadow-sm">{c.name}</h3>
              {metaParts.length > 0 && (
                <p className="mt-0.5 text-[11px] font-medium text-white/75">{metaParts.join(" · ")}</p>
              )}
            </div>

            {/* Vote badge overlay */}
            {vote && (
              <div className={[
                "absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-[16px] font-black shadow-lg",
                vote === "approved" ? "bg-emerald-500 text-white" :
                vote === "favorite" ? "bg-amber-400  text-white" :
                                      "bg-zinc-600   text-white",
              ].join(" ")}>
                {vote === "approved" ? "✓" : vote === "favorite" ? "★" : "✕"}
              </div>
            )}

            {/* Photo navigation arrows — hover only */}
            {photos.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setPhotoIdx((i) => Math.max(0, i - 1)); }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-all hover:bg-black/50 cursor-pointer opacity-0 group-hover:opacity-100"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setPhotoIdx((i) => Math.min(photos.length - 1, i + 1)); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-all hover:bg-black/50 cursor-pointer opacity-0 group-hover:opacity-100"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                </button>

                {/* Dots */}
                <div className="absolute bottom-14 left-0 right-0 flex justify-center gap-1.5">
                  {photos.map((_, i) => (
                    <button
                      key={i}
                      onClick={(e) => { e.stopPropagation(); setPhotoIdx(i); }}
                      className={["rounded-full transition-all cursor-pointer", i === photoIdx ? "h-1.5 w-5 bg-white" : "h-1.5 w-1.5 bg-white/50 hover:bg-white/80"].join(" ")}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          // Fallback avatar
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div
              className="flex h-28 w-28 items-center justify-center rounded-full text-5xl font-black text-white shadow-xl"
              style={{ background: `linear-gradient(135deg, ${brandColor}, #0E7CB6)` }}
            >
              {initials(c.name)}
            </div>
            <div className="text-center px-4">
              <h3 className="text-[15px] font-bold text-zinc-700">{c.name}</h3>
              {metaParts.length > 0 && <p className="text-[12px] text-zinc-400 mt-0.5">{metaParts.join(" · ")}</p>}
            </div>
          </div>
        )}
      </div>

      {/* ── Card body ── */}
      <div className="flex flex-1 flex-col px-4 pb-4 pt-4">

        {/* Name (only shown when no photo overlay) */}
        {photos.length === 0 && (
          <div className="mb-3 border-b border-zinc-100 pb-3" />
        )}

        {/* Bio */}
        {c.bio && (
          <p className="mb-2 text-[12px] leading-relaxed text-zinc-500 line-clamp-2">
            {c.bio}
          </p>
        )}

        {/* Expand */}
        {hasExpandable && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mb-3 text-left text-[11px] font-bold transition-colors cursor-pointer"
            style={{ color: brandColor }}
          >
            {expanded ? "Ver menos ↑" : "Ver mais ↓"}
          </button>
        )}

        {/* Expanded extras */}
        {expanded && (
          <div className="mb-3 space-y-2 rounded-2xl border border-zinc-100 bg-zinc-50 p-3">
            {c.bio && c.bio.length > 120 && (
              <p className="text-[12px] leading-relaxed text-zinc-600 whitespace-pre-wrap">{c.bio}</p>
            )}
            {c.videoUrl && (
              <a href={c.videoUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl bg-white border border-zinc-200 px-3 py-2.5 text-[12px] font-semibold text-zinc-700 hover:border-[#1ABC9C]/40 hover:text-[#0B3C3D] transition-colors">
                <VideoIcon />
                Assistir vídeo
              </a>
            )}
            {c.portfolioUrl && (
              <a href={c.portfolioUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl bg-white border border-zinc-200 px-3 py-2.5 text-[12px] font-semibold text-zinc-700 hover:border-[#1ABC9C]/40 hover:text-[#0B3C3D] transition-colors">
                <LinkIcon />
                Ver portfólio
              </a>
            )}
            {c.curriculumUrl && (
              <a href={c.curriculumUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl bg-white border border-zinc-200 px-3 py-2.5 text-[12px] font-semibold text-zinc-700 hover:border-[#1ABC9C]/40 hover:text-[#0B3C3D] transition-colors">
                <DocIcon />
                Ver currículo
              </a>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* ── Vote buttons ── */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <VoteBtn
            active={vote === "approved"}
            label="Aprovar"
            icon={<ThumbUpIcon />}
            activeClass="bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-200/60"
            inactiveClass="border-zinc-200 text-zinc-400 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50"
            onClick={() => onVote("approved")}
          />
          <VoteBtn
            active={vote === "favorite"}
            label="Favoritar"
            icon={<StarIcon />}
            activeClass="bg-amber-400 border-amber-400 text-white shadow-sm shadow-amber-200/60"
            inactiveClass="border-zinc-200 text-zinc-400 hover:border-amber-300 hover:text-amber-500 hover:bg-amber-50"
            onClick={() => onVote("favorite")}
          />
          <VoteBtn
            active={vote === "rejected"}
            label="Rejeitar"
            icon={<ThumbDownIcon />}
            activeClass="bg-zinc-500 border-zinc-500 text-white shadow-sm"
            inactiveClass="border-zinc-200 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 hover:bg-zinc-50"
            onClick={() => onVote("rejected")}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Vote button ──────────────────────────────────────────────────────────────

function VoteBtn({
  active, label, icon, activeClass, inactiveClass, onClick,
}: {
  active: boolean; label: string; icon: React.ReactNode;
  activeClass: string; inactiveClass: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={[
        "flex flex-col items-center justify-center gap-1.5 rounded-2xl border py-3 text-[10px] font-bold transition-all cursor-pointer active:scale-95",
        active ? activeClass : inactiveClass,
      ].join(" ")}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ThumbUpIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
    </svg>
  );
}
function ThumbDownIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}
function VideoIcon() {
  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

