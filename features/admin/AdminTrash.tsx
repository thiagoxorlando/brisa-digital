"use client";

import { useState } from "react";

export type TrashItem = {
  id: string;
  table: "jobs" | "bookings" | "contracts" | "talent_profiles" | "agencies";
  label: string;
  detail: string;
  deletedAt: string;
};

const TABLE_LABELS: Record<string, string> = {
  jobs: "Vaga",
  bookings: "Reserva",
  contracts: "Contrato",
  talent_profiles: "Talento",
  agencies: "Agência",
};

const TABLE_COLORS: Record<string, string> = {
  jobs: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
  bookings: "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  contracts: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  talent_profiles: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  agencies: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
};

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTrashKey(item: TrashItem) {
  return `${item.table}:${item.id}`;
}

function ConfirmDialog({
  message,
  confirmLabel,
  confirmCls,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  confirmCls: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
        <p className="text-[14px] text-zinc-700 font-medium">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 text-[13px] font-medium text-zinc-600 hover:border-zinc-300 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button onClick={onConfirm} className={`flex-1 px-4 py-2.5 rounded-xl text-white text-[13px] font-semibold transition-colors cursor-pointer ${confirmCls}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminTrash({ items: initialItems }: { items: TrashItem[] }) {
  const [items, setItems] = useState<TrashItem[]>(initialItems);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);
  const [permanentDelete, setPermanentDelete] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [error, setError] = useState("");

  const filtered = items
    .filter((i) => typeFilter === "all" || i.table === typeFilter)
    .filter((i) => !search || i.label.toLowerCase().includes(search.toLowerCase()));

  async function handleRestore(item: TrashItem) {
    setError("");
    const res = await fetch("/api/admin/trash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: item.table, id: item.id }),
    });
    if (res.ok) {
      setItems((prev) => prev.filter((x) => x.id !== item.id || x.table !== item.table));
      setSelectedKeys((current) => {
        const next = new Set(current);
        next.delete(getTrashKey(item));
        return next;
      });
    } else {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? "Falha ao restaurar item.");
    }
    setRestoring(null);
  }

  async function handlePermanentDelete(item: TrashItem) {
    setError("");
    const res = await fetch("/api/admin/trash", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: item.table, id: item.id }),
    });
    if (res.ok) {
      setItems((prev) => prev.filter((x) => x.id !== item.id || x.table !== item.table));
      setSelectedKeys((current) => {
        const next = new Set(current);
        next.delete(getTrashKey(item));
        return next;
      });
    } else {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? "Falha ao excluir item.");
    }
    setPermanentDelete(null);
  }

  const itemToRestore = restoring ? items.find((i) => getTrashKey(i) === restoring) : null;
  const itemToDelete = permanentDelete ? items.find((i) => getTrashKey(i) === permanentDelete) : null;
  const filteredKeys = filtered.map(getTrashKey);
  const selectedCount = selectedKeys.size;
  const selectedFilteredCount = filteredKeys.filter((key) => selectedKeys.has(key)).length;
  const allFilteredSelected = filteredKeys.length > 0 && selectedFilteredCount === filteredKeys.length;
  const someFilteredSelected = selectedFilteredCount > 0 && !allFilteredSelected;

  function toggleSelected(item: TrashItem) {
    const key = getTrashKey(item);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        for (const key of filteredKeys) next.delete(key);
      } else {
        for (const key of filteredKeys) next.add(key);
      }
      return next;
    });
  }

  async function handleBulkPermanentDelete() {
    if (selectedCount === 0) return;
    if (!window.confirm(`Tem certeza que deseja excluir definitivamente ${selectedCount} itens selecionados? Esta ação não pode ser desfeita.`)) return;

    setBulkDeleting(true);
    setError("");
    const selectedItems = items.filter((item) => selectedKeys.has(getTrashKey(item)));

    const res = await fetch("/api/admin/trash", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: selectedItems.map((item) => ({
          table: item.table,
          id: item.id,
        })),
      }),
    });

    if (res.ok) {
      const selected = new Set(selectedItems.map(getTrashKey));
      setItems((prev) => prev.filter((item) => !selected.has(getTrashKey(item))));
      setSelectedKeys(new Set());
    } else {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? "Falha ao excluir os itens selecionados.");
    }

    setBulkDeleting(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      {itemToRestore && (
        <ConfirmDialog
          message={`Restaurar "${itemToRestore.label}"? O item voltará à sua seção original.`}
          confirmLabel="Restaurar"
          confirmCls="bg-emerald-600 hover:bg-emerald-700"
          onConfirm={() => handleRestore(itemToRestore)}
          onCancel={() => setRestoring(null)}
        />
      )}
      {itemToDelete && (
        <ConfirmDialog
          message={`Excluir permanentemente "${itemToDelete.label}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir Definitivamente"
          confirmCls="bg-rose-600 hover:bg-rose-700"
          onConfirm={() => handlePermanentDelete(itemToDelete)}
          onCancel={() => setPermanentDelete(null)}
        />
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Admin da Plataforma</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Lixeira</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{items.length} item{items.length !== 1 ? "s" : ""} na lixeira</p>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-600">{error}</p>
      ) : null}

      {items.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 4a8 8 0 100 16A8 8 0 0012 4z" />
          </svg>
          <p className="text-[13px] text-amber-800 font-medium">
            Itens na lixeira podem ser restaurados ou excluídos permanentemente.
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar na lixeira…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-white border border-zinc-200 rounded-xl placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1 self-start flex-shrink-0">
          {(["all", "jobs", "bookings", "contracts", "talent_profiles", "agencies"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={[
                "px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap",
                typeFilter === t ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              {t === "all" ? "Todos" : t === "talent_profiles" ? "Talento" : TABLE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {selectedCount > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] font-semibold text-zinc-900">{selectedCount} itens selecionados</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBulkPermanentDelete}
              disabled={bulkDeleting}
              className="rounded-xl bg-rose-600 px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkDeleting ? "Excluindo..." : "Excluir definitivamente selecionados"}
            </button>
            <button
              onClick={() => setSelectedKeys(new Set())}
              disabled={bulkDeleting}
              className="rounded-xl px-3.5 py-2 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpar seleção
            </button>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 py-20 text-center shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-[#647B7B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <p className="text-[14px] font-medium text-zinc-500">Lixeira vazia</p>
          <p className="text-[13px] text-zinc-400 mt-1">Itens excluídos aparecerão aqui.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    disabled={filteredKeys.length === 0}
                    ref={(node) => {
                      if (node) node.indeterminate = someFilteredSelected;
                    }}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Selecionar itens filtrados"
                    className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </th>
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Item</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Tipo</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Excluído</th>
                <th className="px-6 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((item) => {
                const typeCls = TABLE_COLORS[item.table] ?? "bg-zinc-100 text-zinc-500";
                return (
                  <tr key={getTrashKey(item)} className="hover:bg-zinc-50/60 transition-colors">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(getTrashKey(item))}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          event.stopPropagation();
                          toggleSelected(item);
                        }}
                        aria-label={`Selecionar ${item.label}`}
                        className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-[13px] font-semibold text-zinc-900 truncate max-w-[200px]">{item.label}</p>
                      {item.detail && <p className="text-[11px] text-zinc-400 mt-0.5 truncate max-w-[200px]">{item.detail}</p>}
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full ${typeCls}`}>
                        {TABLE_LABELS[item.table] ?? item.table}
                      </span>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <p className="text-[12px] text-zinc-400">{formatDate(item.deletedAt)}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setRestoring(getTrashKey(item))}
                          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Restaurar
                        </button>
                        <button
                          onClick={() => setPermanentDelete(getTrashKey(item))}
                          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Excluir Definitivamente
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-6 py-3.5 border-t border-zinc-100 bg-zinc-50/50">
            <p className="text-[12px] text-zinc-400 font-medium">
              {filtered.length} de {items.length} {items.length !== 1 ? "itens" : "item"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
