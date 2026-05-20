"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { supportStatusLabel, supportStatusTone } from "@/lib/supportStatus";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConvSummary = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  last_message_at: string;
  created_at: string;
  closed_at: string | null;
};

type Message = {
  id: string;
  sender_id: string;
  sender_role: string;
  message: string;
  created_at: string;
};


function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(s: string) {
  return new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SupportPage() {
  const [view, setView]           = useState<"list" | "new" | "detail">("list");
  const [conversations, setConvs] = useState<ConvSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [selectedConv, setSelectedConv] = useState<ConvSummary | null>(null);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [userId, setUserId]       = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending]     = useState(false);
  const [replyError, setReplyError] = useState("");

  const [newSubject, setNewSubject]   = useState("");
  const [newMessage, setNewMessage]   = useState("");
  const [newError, setNewError]       = useState("");
  const [newSuccess, setNewSuccess]   = useState("");
  const [creating, setCreating]       = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
    loadList();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadList() {
    setLoadingList(true);
    try {
      const res = await fetch("/api/support/conversations");
      if (res.ok) {
        const data = await res.json() as { conversations: ConvSummary[] };
        setConvs(data.conversations);
      }
    } finally {
      setLoadingList(false);
    }
  }

  async function openConversation(conv: ConvSummary) {
    setSelectedConv(conv);
    setView("detail");
    setMessages([]);
    setReplyText("");
    setReplyError("");
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/support/conversations/${conv.id}`);
      if (res.ok) {
        const data = await res.json() as { conversation: ConvSummary; messages: Message[] };
        setSelectedConv(data.conversation);
        setMessages(data.messages);
      }
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setNewError("");
    setNewSuccess("");
    if (!newSubject.trim()) { setNewError("Assunto é obrigatório."); return; }
    if (!newMessage.trim()) { setNewError("Mensagem é obrigatória."); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/support/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: newSubject.trim(), message: newMessage.trim() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setNewError(data.error ?? "Erro ao enviar mensagem."); return; }
      setNewSuccess("Mensagem enviada ao suporte. Em breve nossa equipe responderá.");
      setNewSubject("");
      setNewMessage("");
      await loadList();
      setTimeout(() => { setView("list"); setNewSuccess(""); }, 2500);
    } finally {
      setCreating(false);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedConv || !replyText.trim()) return;
    setReplyError("");
    setSending(true);
    try {
      const res = await fetch(`/api/support/conversations/${selectedConv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      const data = await res.json() as { message?: Message; error?: string };
      if (!res.ok) { setReplyError(data.error ?? "Erro ao enviar mensagem."); return; }
      if (data.message) setMessages((prev) => [...prev, data.message!]);
      setReplyText("");
      setSelectedConv((prev) => prev ? { ...prev, status: "waiting_admin" } : prev);
      await loadList();
    } finally {
      setSending(false);
    }
  }

  // ── Views ──────────────────────────────────────────────────────────────────

  if (view === "new") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setView("list"); setNewError(""); setNewSuccess(""); }}
            className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar
          </button>
          <h2 className="text-[15px] font-semibold text-zinc-900">Nova conversa</h2>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
                Assunto
              </label>
              <input
                type="text"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Descreva brevemente sua dúvida ou problema"
                maxLength={200}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
                Mensagem
              </label>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Descreva em detalhes como podemos ajudar..."
                rows={6}
                maxLength={5000}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors resize-none"
              />
              <p className="text-right text-[11px] text-zinc-400 mt-1">{newMessage.length}/5000</p>
            </div>

            {newError && (
              <p className="text-[13px] font-medium text-rose-600 bg-rose-50 rounded-xl px-4 py-2.5">{newError}</p>
            )}
            {newSuccess && (
              <p className="text-[13px] font-medium text-emerald-600 bg-emerald-50 rounded-xl px-4 py-2.5">{newSuccess}</p>
            )}

            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 bg-[#1F2D2E] hover:bg-[#2a3d3e] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold px-6 py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              {creating ? "Enviando…" : "Enviar mensagem"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (view === "detail" && selectedConv) {
    const isClosed = selectedConv.status === "closed";

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setView("list")}
            className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar
          </button>
          <h2 className="text-[15px] font-semibold text-zinc-900 flex-1 min-w-0 truncate">{selectedConv.subject}</h2>
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${supportStatusTone(selectedConv.status)}`}>
            {supportStatusLabel(selectedConv.status, "user")}
          </span>
        </div>

        {/* Chat thread */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="p-4 h-[420px] overflow-y-auto flex flex-col gap-3">
            {loadingDetail && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[13px] text-zinc-400">Carregando mensagens…</p>
              </div>
            )}
            {!loadingDetail && messages.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[13px] text-zinc-400">Nenhuma mensagem ainda.</p>
              </div>
            )}
            {messages.map((msg) => {
              const isUser = msg.sender_role === "user" && msg.sender_id === userId;
              return (
                <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[78%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
                    {!isUser && (
                      <span className="text-[10px] font-semibold text-teal-600 uppercase tracking-wide px-1">
                        Suporte BrisaHub
                      </span>
                    )}
                    <div className={`rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                      isUser
                        ? "bg-[#1F2D2E] text-white rounded-br-sm"
                        : "bg-zinc-100 text-zinc-800 rounded-bl-sm"
                    }`}>
                      {msg.message}
                    </div>
                    <span className="text-[10px] text-zinc-400 px-1">
                      {fmtDate(msg.created_at)} às {fmtTime(msg.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Reply box */}
          <div className="border-t border-zinc-100 p-4">
            {isClosed ? (
              <p className="text-[13px] font-medium text-zinc-500 text-center py-2">
                Esta conversa foi encerrada.
              </p>
            ) : (
              <form onSubmit={handleReply} className="flex gap-3 items-end">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (replyText.trim()) handleReply(e as unknown as React.FormEvent);
                    }
                  }}
                  placeholder="Escreva sua resposta… (Enter para enviar)"
                  rows={2}
                  maxLength={5000}
                  className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors resize-none"
                />
                <button
                  type="submit"
                  disabled={sending || !replyText.trim()}
                  className="flex-shrink-0 bg-[#1F2D2E] hover:bg-[#2a3d3e] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  {sending ? "…" : "Enviar"}
                </button>
              </form>
            )}
            {replyError && (
              <p className="text-[12px] font-medium text-rose-600 mt-2">{replyError}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-zinc-900">Suporte</h1>
          <p className="text-[13px] text-zinc-500 mt-0.5">Fale com a equipe da BrisaHub.</p>
        </div>
        <button
          type="button"
          onClick={() => { setView("new"); setNewError(""); setNewSuccess(""); }}
          className="flex items-center gap-2 bg-[#1F2D2E] hover:bg-[#2a3d3e] text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nova conversa
        </button>
      </div>

      {loadingList && (
        <div className="bg-white rounded-2xl border border-zinc-100 py-12 text-center">
          <p className="text-[14px] text-zinc-400">Carregando…</p>
        </div>
      )}

      {!loadingList && conversations.length === 0 && (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] py-16 text-center">
          <svg className="w-8 h-8 text-zinc-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-[14px] font-medium text-zinc-500">Nenhuma conversa ainda.</p>
          <p className="text-[13px] text-zinc-400 mt-1">Clique em "Nova conversa" para entrar em contato.</p>
        </div>
      )}

      {!loadingList && conversations.length > 0 && (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => openConversation(conv)}
              className="w-full flex items-center gap-4 px-6 py-4 hover:bg-zinc-50/70 transition-colors text-left cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-zinc-900 truncate">{conv.subject}</p>
                <p className="text-[12px] text-zinc-400 mt-0.5">{fmtDate(conv.last_message_at)}</p>
              </div>
              <span className={`flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full ${supportStatusTone(conv.status)}`}>
                {supportStatusLabel(conv.status, "user")}
              </span>
              <svg className="w-4 h-4 text-zinc-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
