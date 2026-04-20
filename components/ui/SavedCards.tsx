"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SavedCard {
  id:           string;
  brand:        string | null;
  last_four:    string | null;
  holder_name:  string | null;
  expiry_month: number | null;
  expiry_year:  number | null;
  created_at:   string;
}

// ── Brand icons ───────────────────────────────────────────────────────────────

const BRAND_COLORS: Record<string, string> = {
  visa:   "bg-[#1A1F71]",
  master: "bg-[#EB001B]",
  amex:   "bg-[#2E77BC]",
  elo:    "bg-zinc-800",
  hiper:  "bg-orange-600",
};

function BrandBadge({ brand }: { brand: string | null }) {
  const name = brand?.toLowerCase() ?? "";
  const bg   = BRAND_COLORS[name] ?? "bg-zinc-700";
  return (
    <span className={`${bg} text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider`}>
      {name || "card"}
    </span>
  );
}

// ── Card row ──────────────────────────────────────────────────────────────────

function CardRow({ card, onDelete }: { card: SavedCard; onDelete: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Remover este cartão?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/payments/card/${card.id}`, { method: "DELETE" });
      onDelete(card.id);
    } finally {
      setDeleting(false);
    }
  }

  const expiry = card.expiry_month && card.expiry_year
    ? `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`
    : null;

  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="w-10 h-10 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <BrandBadge brand={card.brand} />
          <span className="text-[14px] font-semibold text-zinc-900 tabular-nums">
            •••• {card.last_four ?? "----"}
          </span>
        </div>
        <p className="text-[12px] text-zinc-400">
          {card.holder_name ?? "—"}{expiry ? ` · Válido até ${expiry}` : ""}
        </p>
      </div>

      <button
        onClick={handleDelete}
        disabled={deleting}
        className="text-[12px] font-medium text-rose-500 hover:text-rose-700 disabled:opacity-40 transition-colors cursor-pointer"
      >
        {deleting ? "Removendo…" : "Remover"}
      </button>
    </div>
  );
}

// ── Add card form (MP.js tokenization) ───────────────────────────────────────

interface AddCardFormProps {
  publicKey: string;
  onSaved:   (card: SavedCard) => void;
  onCancel:  () => void;
}

declare global {
  interface Window {
    MercadoPago: new (key: string, opts?: object) => {
      cardForm: (opts: object) => {
        getCardFormData: () => {
          token: string;
          paymentMethodId: string;
          issuerId: string;
          cardholderName: string;
          expirationDate: string; // MM/YY
        };
        unmount: () => void;
      };
    };
  }
}

export function AddCardForm({ publicKey, onSaved, onCancel }: AddCardFormProps) {
  const formRef   = useRef<HTMLFormElement>(null);
  const mpRef     = useRef<ReturnType<InstanceType<typeof window.MercadoPago>["cardForm"]> | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [ready,   setReady]   = useState(false);

  useEffect(() => {
    // Load MP.js SDK
    const existing = document.getElementById("mp-sdk");
    if (!existing) {
      const script  = document.createElement("script");
      script.id     = "mp-sdk";
      script.src    = "https://sdk.mercadopago.com/js/v2";
      script.onload = initForm;
      document.head.appendChild(script);
    } else if (window.MercadoPago) {
      initForm();
    }

    return () => {
      mpRef.current?.unmount();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function initForm() {
    const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
    mpRef.current = mp.cardForm({
      amount: "1.00", // placeholder; not charged at save time
      iframe: true,
      form: {
        id:              "mp-card-form",
        cardNumber:      { id: "mp-card-number",       placeholder: "Número do cartão" },
        expirationDate:  { id: "mp-expiration-date",   placeholder: "MM/AA" },
        securityCode:    { id: "mp-security-code",     placeholder: "CVV" },
        cardholderName:  { id: "mp-cardholder-name",   placeholder: "Nome no cartão" },
        issuer:          { id: "mp-issuer" },
        installments:    { id: "mp-installments" },
      },
      callbacks: {
        onFormMounted: (err: unknown) => { if (!err) setReady(true); },
        onError:       (errs: unknown) => { console.error("[MP cardForm]", errs); },
      },
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mpRef.current) return;
    setError("");
    setSaving(true);

    try {
      const fd = mpRef.current.getCardFormData();
      if (!fd.token) { setError("Não foi possível tokenizar o cartão. Verifique os dados."); return; }

      const [expMonth, expYear] = fd.expirationDate?.split("/") ?? [];

      const res  = await fetch("/api/payments/card/save", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          token:              fd.token,
          payment_method_id:  fd.paymentMethodId,
          issuer_id:          fd.issuerId,
          holder_name:        fd.cardholderName,
          expiry_month:       expMonth ? parseInt(expMonth) : null,
          expiry_year:        expYear  ? 2000 + parseInt(expYear) : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao salvar cartão."); return; }

      onSaved(data.card);
    } catch {
      setError("Erro inesperado. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      id="mp-card-form"
      ref={formRef}
      onSubmit={handleSubmit}
      className="p-5 border-t border-zinc-100 space-y-4"
    >
      <p className="text-[12px] font-semibold text-zinc-500 uppercase tracking-widest mb-3">
        Adicionar cartão
      </p>

      {/* MP.js iframes are injected into these divs */}
      <div>
        <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Número do cartão</label>
        <div id="mp-card-number"     className="h-11 border border-zinc-200 rounded-xl px-3 bg-white" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Validade</label>
          <div id="mp-expiration-date" className="h-11 border border-zinc-200 rounded-xl px-3 bg-white" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">CVV</label>
          <div id="mp-security-code"   className="h-11 border border-zinc-200 rounded-xl px-3 bg-white" />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Nome no cartão</label>
        <div id="mp-cardholder-name"  className="h-11 border border-zinc-200 rounded-xl px-3 bg-white" />
      </div>

      {/* Hidden MP fields */}
      <div id="mp-issuer"       className="hidden" />
      <div id="mp-installments" className="hidden" />

      {error && (
        <p className="text-[13px] text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={saving || !ready}
          className="flex-1 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-[13px] font-medium py-2.5 rounded-xl transition-colors disabled:cursor-not-allowed"
        >
          {saving ? "Salvando…" : "Salvar cartão"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 text-[13px] font-medium text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-xl transition-colors"
        >
          Cancelar
        </button>
      </div>

      <p className="text-[11px] text-zinc-400 text-center">
        Seus dados de cartão são tokenizados pelo Mercado Pago e nunca armazenados nos nossos servidores.
      </p>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SavedCardsProps {
  initialCards: SavedCard[];
  publicKey:    string;
}

export default function SavedCards({ initialCards, publicKey }: SavedCardsProps) {
  const [cards,     setCards]     = useState<SavedCard[]>(initialCards);
  const [showForm,  setShowForm]  = useState(false);

  function handleSaved(card: SavedCard) {
    setCards((prev) => [card, ...prev]);
    setShowForm(false);
  }

  function handleDeleted(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-50">
        <div>
          <p className="text-[13px] font-semibold text-zinc-900">Cartões salvos</p>
          <p className="text-[12px] text-zinc-400 mt-0.5">
            {cards.length === 0 ? "Nenhum cartão cadastrado" : `${cards.length} cartão${cards.length > 1 ? "s" : ""}`}
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-700 hover:text-zinc-900 border border-zinc-200 hover:border-zinc-300 px-3 py-1.5 rounded-xl transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Adicionar
          </button>
        )}
      </div>

      {/* Card list */}
      {cards.length > 0 && (
        <div className="divide-y divide-zinc-50">
          {cards.map((c) => (
            <CardRow key={c.id} card={c} onDelete={handleDeleted} />
          ))}
        </div>
      )}

      {cards.length === 0 && !showForm && (
        <div className="py-10 text-center">
          <p className="text-[13px] text-zinc-400">Adicione um cartão para pagamentos recorrentes.</p>
        </div>
      )}

      {/* Add card form */}
      {showForm && (
        <AddCardForm
          publicKey={publicKey}
          onSaved={handleSaved}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
