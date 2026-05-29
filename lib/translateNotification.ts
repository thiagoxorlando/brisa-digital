/**
 * Best-effort translation of stored notification messages.
 *
 * Notifications are stored as rendered Portuguese text in the DB.
 * This function maps known PT patterns to English at display time
 * so the notification bell respects the user's language selection.
 *
 * Rules:
 * - Static messages are mapped directly.
 * - Dynamic messages (containing names/values) use regex replacement.
 * - Unknown messages are returned unchanged.
 */

type Lang = "pt-BR" | "en";

interface TranslationEntry {
  pt: RegExp;
  en: string | ((match: string, ...groups: string[]) => string);
}

const NOTIFICATION_TRANSLATIONS: TranslationEntry[] = [
  // Escrow / contract flow
  {
    pt: /^Agência confirmou o contrato e realizou o depósito$/,
    en: "Agency confirmed the contract and made the deposit",
  },
  {
    pt: /^Reserva confirmada — fundos em custódia$/,
    en: "Booking confirmed — funds in escrow",
  },
  {
    pt: /^Agência liberou seu pagamento — a caminho!$/,
    en: "Agency released your payment — on the way!",
  },
  {
    pt: /^Agência liberou seu pagamento de (.+) — a caminho!$/,
    en: (_, amount) => `Agency released your payment of ${amount} — on the way!`,
  },
  // Bookings
  {
    pt: /^Você foi reservado!$/,
    en: "You have been booked!",
  },
  {
    pt: /^Nova reserva criada: (.+)$/,
    en: (_, title) => `New booking created: ${title}`,
  },
  {
    pt: /^Talento cancelou a reserva$/,
    en: "Talent cancelled the booking",
  },
  // Contracts
  {
    pt: /^Você recebeu um novo contrato$/,
    en: "You received a new contract",
  },
  {
    pt: /^Novo contrato criado: (.+)$/,
    en: (_, title) => `New contract created: ${title}`,
  },
  {
    pt: /^Talento assinou o contrato$/,
    en: "Talent signed the contract",
  },
  {
    pt: /^O contrato foi cancelado\.$/,
    en: "The contract has been cancelled.",
  },
  // Payments / wallet
  {
    pt: /^Escrow bloqueado: (.+) em garantia$/,
    en: (_, amount) => `Escrow locked: ${amount} held`,
  },
  {
    pt: /^Escrow realizado: (.+) movidos para garantia$/,
    en: (_, amount) => `Escrow completed: ${amount} moved to custody`,
  },
  {
    pt: /^Pagamento liberado ao talento: (.+)$/,
    en: (_, amount) => `Payment released to talent: ${amount}`,
  },
  {
    pt: /^Pagamento liberado ao talento \(agente\): (.+)$/,
    en: (_, amount) => `Payment released to talent (agent): ${amount}`,
  },
  {
    pt: /^Comissão de indicação liberada: (.+)$/,
    en: (_, amount) => `Referral commission released: ${amount}`,
  },
  {
    pt: /^Saque solicitado$/,
    en: "Withdrawal requested",
  },
  {
    pt: /^Seu saque de (.+) foi enviado para processamento\.$/,
    en: (_, amount) => `Your withdrawal of ${amount} has been submitted for processing.`,
  },
  {
    pt: /^Seu saque de (.+) foi concluído via PIX\.$/,
    en: (_, amount) => `Your withdrawal of ${amount} has been completed via PIX.`,
  },
  // Rehire
  {
    pt: /^Você foi contratado novamente por (.+)$/,
    en: (_, name) => `You were hired again by ${name}`,
  },
  // Internal payment
  {
    pt: /^A agência confirmou o envio do pagamento\. Confirme o recebimento para encerrar o contrato\.$/,
    en: "The agency confirmed the payment was sent. Confirm receipt to close the contract.",
  },
  // Disputes
  {
    pt: /^Uma disputa foi aberta no contrato (.+)\.$/,
    en: (_, id) => `A dispute has been opened on contract ${id}.`,
  },
  {
    pt: /^A disputa do contrato (.+) está em análise\.$/,
    en: (_, id) => `The dispute on contract ${id} is under review.`,
  },
  // Support
  {
    pt: /^Você tem uma nova mensagem do suporte\.$/,
    en: "You have a new message from support.",
  },
  // Billing / trial
  {
    pt: /^Seu trial de (\d+) dias começou\. Você tem acesso completo ao plano (.+) até (.+)\.$/,
    en: (_, days, plan, date) => `Your ${days}-day trial has started. Full access to ${plan} until ${date}.`,
  },
  {
    pt: /^Seu trial encerra em (\d+) dias\. A cobrança de (.+) será feita automaticamente\.$/,
    en: (_, days, price) => `Your trial ends in ${days} days. You will be automatically charged ${price}.`,
  },
  {
    pt: /^Seu plano (.+) está ativo\. Próxima cobrança em (.+)\.$/,
    en: (_, plan, date) => `Your ${plan} plan is active. Next billing on ${date}.`,
  },
  {
    pt: /^Sua assinatura foi cancelada\. Você voltou ao plano gratuito\.$/,
    en: "Your subscription has been cancelled. You are now on the free plan.",
  },
];

export function translateNotification(message: string, lang: Lang): string {
  if (!message || lang === "pt-BR") return message;

  for (const entry of NOTIFICATION_TRANSLATIONS) {
    const match = message.match(entry.pt);
    if (match) {
      if (typeof entry.en === "string") return entry.en;
      return (entry.en as (...args: string[]) => string)(...match);
    }
  }

  return message; // no match → show original stored text
}
