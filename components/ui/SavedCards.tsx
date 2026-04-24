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

// ── Add card form ─────────────────────────────────────────────────────────────
// React-controlled inputs for UX. MP.js SDK handles tokenization so card data
// goes directly to Mercado Pago's servers and never reaches our backend.

interface AddCardFormProps {
  publicKey: string;
  onSaved:   (card: SavedCard) => void;
  onCancel:  () => void;
}

declare global {
  interface Window {
    MercadoPago: new (key: string, opts?: object) => {
      createCardToken: (data: {
        cardNumber:            string;
        cardholderName:        string;
        cardExpirationMonth:   string;
        cardExpirationYear:    string;
        securityCode:          string;
        identificationType?:   string;
        identificationNumber?: string;
      }) => Promise<{
        id:                 string;
        payment_method_id?: string;
        last_four_digits?:  string;
        first_six_digits?:  string;
        cause?:             Array<{ code: string; description: string }>;
      }>;
    };
  }
}

const INPUT_CLS =
  "w-full h-11 border border-zinc-200 rounded-xl px-3 bg-white text-[14px] text-zinc-900 " +
  "placeholder:text-zinc-300 focus:outline-none focus:border-zinc-400 transition-colors";

type DocType = "CPF" | "CNPJ";

function maskDocument(digits: string, type: DocType): string {
  if (type === "CPF") {
    const d = digits.slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  const d = digits.slice(0, 14);
  if (d.length <= 2)  return d;
  if (d.length <= 5)  return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8)  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function AddCardForm({ publicKey, onSaved, onCancel }: AddCardFormProps) {
  const mpRef        = useRef<InstanceType<typeof window.MercadoPago> | null>(null);
  const [sdkReady,   setSdkReady]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry,     setExpiry]     = useState("");
  const [cvv,        setCvv]        = useState("");
  const [holderName, setHolderName] = useState("");
  const [docType,    setDocType]    = useState<DocType>("CPF");
  const [docNumber,  setDocNumber]  = useState("");

  useEffect(() => {
    function initMp() {
      mpRef.current = new window.MercadoPago(publicKey, { locale: "pt-BR" });
      setSdkReady(true);
    }
    const existing = document.getElementById("mp-sdk");
    if (!existing) {
      const script  = document.createElement("script");
      script.id     = "mp-sdk";
      script.src    = "https://sdk.mercadopago.com/js/v2";
      script.onload = initMp;
      document.head.appendChild(script);
    } else if (window.MercadoPago) {
      initMp();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCardNumberChange(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 16);
    const groups = digits.match(/.{1,4}/g) ?? [];
    setCardNumber(groups.join(" "));
  }

  function handleExpiryChange(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    setExpiry(digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`);
  }

  function handleCvvChange(v: string) {
    setCvv(v.replace(/\D/g, "").slice(0, 4));
  }

  function handleDocTypeChange(t: DocType) {
    setDocType(t);
    setDocNumber("");
  }

  function handleDocNumberChange(v: string) {
    const digits = v.replace(/\D/g, "");
    setDocNumber(maskDocument(digits, docType));
  }

  const rawNumber   = cardNumber.replace(/\s/g, "");
  const rawDocument = docNumber.replace(/\D/g, "");
  const [expMM, expYY] = expiry.split("/");
  const parsedMM    = parseInt(expMM ?? "0", 10);
  const isDocValid  = (docType === "CPF" && rawDocument.length === 11) ||
                      (docType === "CNPJ" && rawDocument.length === 14);
  const isValid =
    rawNumber.length >= 13 &&
    expiry.length === 5 &&
    parsedMM >= 1 && parsedMM <= 12 &&
    (expYY ?? "").length === 2 &&
    cvv.length >= 3 &&
    holderName.trim().length >= 2 &&
    isDocValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || !mpRef.current) return;
    setError("");
    setSaving(true);

    try {
      const fullYear = 2000 + parseInt(expYY!, 10);

      // Tokenize via MP.js SDK — card data goes directly to Mercado Pago
      const tokenData = await mpRef.current.createCardToken({
        cardNumber:            rawNumber,
        cardholderName:        holderName.trim(),
        cardExpirationMonth:   String(parsedMM).padStart(2, "0"),
        cardExpirationYear:    String(fullYear),
        securityCode:          cvv,
        identificationType:    docType,
        identificationNumber:  rawDocument,
      });

      if (!tokenData?.id) {
        const detail = tokenData?.cause?.[0]?.description ?? "Verifique os dados do cartão.";
        setError(`Não foi possível tokenizar o cartão. ${detail}`);
        return;
      }

      const res = await fetch("/api/payments/card/save", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          token:                  tokenData.id,
          payment_method_id:      tokenData.payment_method_id,
          holder_name:            holderName.trim(),
          expiry_month:           parsedMM,
          expiry_year:            fullYear,
          holder_document_type:   docType,
          holder_document_number: rawDocument,
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao salvar cartão."); return; }
      onSaved(data.card);
    } catch (err) {
      console.error("[AddCardForm] tokenize error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Erro ao processar cartão: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-5 border-t border-zinc-100 space-y-4">
      <p className="text-[12px] font-semibold text-zinc-500 uppercase tracking-widest mb-3">
        Adicionar cartão
      </p>

      <div>
        <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Número do cartão</label>
        <input
          type="text"
          inputMode="numeric"
          value={cardNumber}
          onChange={(e) => handleCardNumberChange(e.target.value)}
          placeholder="0000 0000 0000 0000"
          autoComplete="cc-number"
          className={`${INPUT_CLS} tabular-nums tracking-wider`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Validade</label>
          <input
            type="text"
            inputMode="numeric"
            value={expiry}
            onChange={(e) => handleExpiryChange(e.target.value)}
            placeholder="MM/AA"
            autoComplete="cc-exp"
            maxLength={5}
            className={`${INPUT_CLS} tabular-nums`}
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">CVV</label>
          <input
            type="text"
            inputMode="numeric"
            value={cvv}
            onChange={(e) => handleCvvChange(e.target.value)}
            placeholder="CVV"
            autoComplete="cc-csc"
            maxLength={4}
            className={`${INPUT_CLS} tabular-nums`}
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Nome no cartão</label>
        <input
          type="text"
          value={holderName}
          onChange={(e) => setHolderName(e.target.value)}
          placeholder="Nome como no cartão"
          autoComplete="cc-name"
          className={INPUT_CLS}
        />
      </div>

      {/* Document */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-medium text-zinc-500">Documento do titular</label>
          <div className="flex bg-zinc-100 rounded-lg p-0.5 gap-0.5">
            {(["CPF", "CNPJ"] as DocType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleDocTypeChange(t)}
                className={[
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer",
                  docType === t
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700",
                ].join(" ")}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <input
          type="text"
          inputMode="numeric"
          value={docNumber}
          onChange={(e) => handleDocNumberChange(e.target.value)}
          placeholder={docType === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"}
          maxLength={docType === "CPF" ? 14 : 18}
          className={`${INPUT_CLS} tabular-nums`}
        />
      </div>

      {error && (
        <p className="text-[13px] text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={saving || !isValid || !sdkReady}
          className="flex-1 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-[13px] font-medium py-2.5 rounded-xl transition-colors disabled:cursor-not-allowed"
        >
          {saving ? "Salvando…" : !sdkReady ? "Carregando…" : "Salvar cartão"}
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
  initialCards:    SavedCard[];
  publicKey:       string;
  onCardsChange?:  (cards: SavedCard[]) => void;
}

export default function SavedCards({ initialCards, publicKey, onCardsChange }: SavedCardsProps) {
  const [cards,    setCards]    = useState<SavedCard[]>(initialCards);
  const [showForm, setShowForm] = useState(false);

  function handleSaved(card: SavedCard) {
    const next = [card, ...cards];
    setCards(next);
    setShowForm(false);
    onCardsChange?.(next);
  }

  function handleDeleted(id: string) {
    const next = cards.filter((c) => c.id !== id);
    setCards(next);
    onCardsChange?.(next);
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
