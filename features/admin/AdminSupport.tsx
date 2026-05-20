"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/LanguageContext";
import { supportStatusLabel, supportStatusTone, supportPriorityLabel, supportPriorityTone } from "@/lib/supportStatus";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminConversation = {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  priority: string;
  last_message_at: string;
  created_at: string;
  closed_at: string | null;
  archived_at: string | null;
  userName: string;
  userEmail: string;
  userRole: string;
  userRoleLabel: string;
};

type Message = {
  id: string;
  sender_id: string;
  sender_role: string;
  message: string;
  created_at: string;
};

// ── Labels ────────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  agency:  "Agência",
  talent:  "Talento",
  admin:   "Admin",
};

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(s: string) {
  return new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ── Summary card ─────────────────────────────────────────────────────────────

function StatCard({ label, value, stripe }: { label: string; value: number; stripe: string }) {
  return (
    <div className="bg-white rounded-[1.5rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_14px_34px_rgba(7,17,13,0.06)] overflow-hidden">
      <div className={`h-[3px] bg-gradient-to-r ${stripe}`} />
      <div className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">{label}</p>
        <p className="text-[2rem] font-black tracking-tight text-zinc-950">{value}</p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminSupport({
  initialConversations,
}: {
  initialConversations: AdminConversation[];
}) {
  const { t } = useT();
  const [conversations, setConvs] = useState<AdminConversation[]>(initialConversations);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch]             = useState("");
  const [loading, setLoading]           = useState(false);
  const [activeTab, setActiveTab]       = useState<"active" | "archived">("active");

  const [selectedConv, setSelectedConv] = useState<AdminConversation | null>(null);
  const [messages, setMessages]         = useState<Message[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [replyText, setReplyText]       = useState("");
  const [sending, setSending]           = useState(false);
  const [replyError, setReplyError]     = useState("");
  const [replyOk, setReplyOk]           = useState(false);

  const [editStatus, setEditStatus]     = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [updating, setUpdating]         = useState(false);
  const [updateMsg, setUpdateMsg]       = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadList(status = statusFilter, q = search, tab = activeTab) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (q)      params.set("search", q);
      params.set("tab", tab);
      const res = await fetch(`/api/admin/support/conversations?${params}`);
      if (res.ok) {
        const data = await res.json() as { conversations: AdminConversation[] };
        setConvs(data.conversations);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive(conv: AdminConversation) {
    const res = await fetch(`/api/admin/support/conversations/${conv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    if (res.ok) {
      setConvs((prev) => prev.filter((c) => c.id !== conv.id));
    }
  }

  async function handleRestore(conv: AdminConversation) {
    const res = await fetch(`/api/admin/support/conversations/${conv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    if (res.ok) {
      setConvs((prev) => prev.filter((c) => c.id !== conv.id));
    }
  }

  async function openConversation(conv: AdminConversation) {
    setSelectedConv(conv);
    setMessages([]);
    setReplyText("");
    setReplyError("");
    setReplyOk(false);
    setUpdateMsg("");
    setEditStatus(conv.status);
    setEditPriority(conv.priority);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/support/conversations/${conv.id}`);
      if (res.ok) {
        const data = await res.json() as { conversation: AdminConversation; messages: Message[] };
        setSelectedConv(data.conversation);
        setMessages(data.messages);
      }
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedConv || !replyText.trim()) return;
    setReplyError("");
    setReplyOk(false);
    setSending(true);
    try {
      const res = await fetch(`/api/admin/support/conversations/${selectedConv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      const data = await res.json() as { message?: Message; error?: string };
      if (!res.ok) { setReplyError(data.error ?? "Erro ao enviar."); return; }
      if (data.message) setMessages((prev) => [...prev, data.message!]);
      setReplyText("");
      setReplyOk(true);
      setSelectedConv((prev) => prev ? { ...prev, status: "waiting_user" } : prev);
      setEditStatus("waiting_user");
      await loadList();
    } finally {
      setSending(false);
    }
  }

  async function handleUpdate() {
    if (!selectedConv) return;
    setUpdating(true);
    setUpdateMsg("");
    try {
      const res = await fetch(`/api/admin/support/conversations/${selectedConv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: editStatus, priority: editPriority }),
      });
      if (res.ok) {
        setUpdateMsg("Atualizado com sucesso.");
        setSelectedConv((prev) => prev ? { ...prev, status: editStatus, priority: editPriority } : prev);
        await loadList();
      }
    } finally {
      setUpdating(false);
    }
  }

  // Derived stats from current list
  const stats = {
    open:          initialConversations.filter((c) => c.status === "open").length,
    waiting_admin: initialConversations.filter((c) => c.status === "waiting_admin").length,
    waiting_user:  initialConversations.filter((c) => c.status === "waiting_user").length,
    closed:        initialConversations.filter((c) => c.status === "closed").length,
  };

  // ── Detail view ───────────────────────────────────────────────────────────

  if (selectedConv) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedConv(null)}
            className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar
          </button>
          <h2 className="text-[15px] font-semibold text-zinc-900 flex-1 min-w-0 truncate">{selectedConv.subject}</h2>
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${supportStatusTone(selectedConv.status)}`}>
            {supportStatusLabel(selectedConv.status)}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Chat thread */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-[12px] font-bold text-teal-700 flex-shrink-0">
                {selectedConv.userName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-zinc-900 truncate">{selectedConv.userName}</p>
                <p className="text-[11px] text-zinc-400 truncate">{selectedConv.userEmail}</p>
              </div>
              <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${selectedConv.userRole === "talent" ? "bg-violet-50 text-violet-600" : selectedConv.userRole === "agency" ? "bg-teal-50 text-teal-600" : "bg-zinc-100 text-zinc-500"}`}>
                {selectedConv.userRoleLabel}
              </span>
            </div>

            <div className="flex-1 p-4 h-[380px] overflow-y-auto flex flex-col gap-3">
              {loadingDetail && (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-[13px] text-zinc-400">Carregando mensagens…</p>
                </div>
              )}
              {messages.map((msg) => {
                const isAdmin = msg.sender_role === "admin";
                return (
                  <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] flex flex-col gap-1 ${isAdmin ? "items-end" : "items-start"}`}>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-1 ${isAdmin ? "text-teal-600" : "text-zinc-500"}`}>
                        {isAdmin ? "Suporte BrisaHub" : selectedConv.userName}
                      </span>
                      <div className={`rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                        isAdmin
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

            <div className="border-t border-zinc-100 p-4">
              <form onSubmit={handleReply} className="flex gap-3 items-end">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Escreva sua resposta…"
                  rows={3}
                  maxLength={5000}
                  className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors resize-none"
                />
                <button
                  type="submit"
                  disabled={sending || !replyText.trim()}
                  className="flex-shrink-0 bg-[#1F2D2E] hover:bg-[#2a3d3e] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  {sending ? "…" : "Enviar resposta"}
                </button>
              </form>
              {replyError && <p className="text-[12px] font-medium text-rose-600 mt-2">{replyError}</p>}
              {replyOk    && <p className="text-[12px] font-medium text-emerald-600 mt-2">Resposta enviada.</p>}
            </div>
          </div>

          {/* Controls panel */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-5 space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Gerenciar conversa</p>

              <div>
                <label className="block text-[12px] font-medium text-zinc-500 mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors cursor-pointer"
                >
                  <option value="open">Aberta</option>
                  <option value="waiting_admin">Aguardando suporte</option>
                  <option value="waiting_user">Aguardando usuário</option>
                  <option value="closed">Encerrada</option>
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-zinc-500 mb-1">Prioridade</label>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors cursor-pointer"
                >
                  <option value="low">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleUpdate}
                disabled={updating}
                className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white text-[13px] font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                {updating ? "Salvando…" : "Salvar alterações"}
              </button>
              {updateMsg && <p className="text-[12px] font-medium text-emerald-600">{updateMsg}</p>}

              {selectedConv.status === "closed" && !selectedConv.archived_at && (
                <button
                  type="button"
                  onClick={async () => {
                    await handleArchive(selectedConv);
                    setSelectedConv(null);
                  }}
                  className="w-full border border-zinc-200 hover:border-zinc-300 text-zinc-600 hover:text-zinc-800 text-[13px] font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  Arquivar conversa
                </button>
              )}
              {selectedConv.archived_at && (
                <button
                  type="button"
                  onClick={async () => {
                    await handleRestore(selectedConv);
                    setSelectedConv(null);
                  }}
                  className="w-full border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-700 text-[13px] font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  Restaurar conversa
                </button>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-5 space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Informações</p>
              <div>
                <p className="text-[11px] text-zinc-400">Assunto</p>
                <p className="text-[13px] font-semibold text-zinc-800 mt-0.5">{selectedConv.subject}</p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-400">Criada em</p>
                <p className="text-[13px] font-semibold text-zinc-800 mt-0.5">{fmtDate(selectedConv.created_at)}</p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-400">Última mensagem</p>
                <p className="text-[13px] font-semibold text-zinc-800 mt-0.5">{fmtDate(selectedConv.last_message_at)}</p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-400">Prioridade</p>
                <span className={`inline-block mt-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${supportPriorityTone(selectedConv.priority)}`}>
                  {supportPriorityLabel(selectedConv.priority)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────

  function switchTab(tab: "active" | "archived") {
    setActiveTab(tab);
    setStatusFilter("");
    setSearch("");
    loadList("", "", tab);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight text-zinc-900">Suporte</h1>
        <p className="text-[13px] text-zinc-500 mt-0.5">Gerencie solicitações de suporte dos usuários.</p>
      </div>

      {/* Summary cards — only for active tab */}
      {activeTab === "active" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Abertas"             value={stats.open}          stripe="from-emerald-400 to-teal-500" />
          <StatCard label="Aguardando suporte"  value={stats.waiting_admin} stripe="from-amber-400 to-orange-500" />
          <StatCard label="Aguardando usuário"  value={stats.waiting_user}  stripe="from-teal-400 to-cyan-500" />
          <StatCard label="Encerradas"          value={stats.closed}        stripe="from-zinc-300 to-zinc-400" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1 self-start w-fit">
        {(["active", "archived"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => switchTab(tab)}
            className={[
              "px-4 py-1.5 text-[13px] font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap",
              activeTab === tab ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800",
            ].join(" ")}
          >
            {tab === "active" ? "Atendimentos ativos" : "Arquivados"}
          </button>
        ))}
      </div>

      {/* Filters — only for active tab */}
      {activeTab === "active" && (
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") loadList(statusFilter, search); }}
            placeholder="Buscar por assunto, nome ou e-mail…"
            className="flex-1 min-w-[200px] rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors shadow-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); loadList(e.target.value, search); }}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-[13px] text-zinc-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors shadow-sm cursor-pointer"
          >
            <option value="">Todos os status</option>
            <option value="open">Aberta</option>
            <option value="waiting_admin">Aguardando suporte</option>
            <option value="waiting_user">Aguardando usuário</option>
            <option value="closed">Encerrada</option>
          </select>
          <button
            type="button"
            onClick={() => loadList(statusFilter, search)}
            className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Buscar
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-zinc-100 py-12 text-center">
          <p className="text-[14px] text-zinc-400">Carregando…</p>
        </div>
      ) : conversations.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 py-12 text-center">
          <p className="text-[14px] font-medium text-zinc-500">
            {activeTab === "archived" ? "Nenhuma conversa arquivada." : "Nenhuma conversa encontrada."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-[1.5rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_14px_34px_rgba(7,17,13,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Assunto</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Usuário</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest hidden lg:table-cell">Status</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest hidden lg:table-cell">Prioridade</th>
                  <th className="text-right px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest hidden sm:table-cell">Última msg</th>
                  <th className="px-6 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {conversations.map((conv) => (
                  <tr
                    key={conv.id}
                    className="border-b border-zinc-50 hover:bg-zinc-50/60 transition-colors"
                  >
                    <td className="px-6 py-4 cursor-pointer" onClick={() => openConversation(conv)}>
                      <p className="text-[13px] font-semibold text-zinc-900 truncate max-w-[200px]">{conv.subject}</p>
                    </td>
                    <td className="px-4 py-4 cursor-pointer" onClick={() => openConversation(conv)}>
                      <p className="text-[13px] font-medium text-zinc-800 truncate max-w-[160px]">{conv.userName}</p>
                      {conv.userEmail && (
                        <p className="text-[11px] text-zinc-400 truncate max-w-[160px] mt-0.5">{conv.userEmail}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${conv.userRole === "talent" ? "bg-violet-50 text-violet-600" : conv.userRole === "agency" ? "bg-teal-50 text-teal-600" : "bg-zinc-100 text-zinc-500"}`}>
                          {conv.userRoleLabel}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell cursor-pointer" onClick={() => openConversation(conv)}>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${supportStatusTone(conv.status)}`}>
                        {supportStatusLabel(conv.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell cursor-pointer" onClick={() => openConversation(conv)}>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${supportPriorityTone(conv.priority)}`}>
                        {supportPriorityLabel(conv.priority)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right hidden sm:table-cell cursor-pointer" onClick={() => openConversation(conv)}>
                      <p className="text-[12px] text-zinc-400 tabular-nums">{fmtDate(conv.last_message_at)}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {activeTab === "active" && conv.status === "closed" && (
                        <button
                          type="button"
                          onClick={() => handleArchive(conv)}
                          className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-700 px-2 py-1 rounded-lg hover:bg-zinc-100 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Arquivar
                        </button>
                      )}
                      {activeTab === "archived" && (
                        <button
                          type="button"
                          onClick={() => handleRestore(conv)}
                          className="text-[11px] font-semibold text-teal-600 hover:text-teal-800 px-2 py-1 rounded-lg hover:bg-teal-50 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Restaurar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
