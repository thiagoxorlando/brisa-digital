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
  en: string | ((...args: string[]) => string);
}

const NOTIFICATION_TRANSLATIONS: TranslationEntry[] = [
  // ── Escrow / contract confirmation ─────────────────────────────────────────
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

  // ── Internal payment confirmation ───────────────────────────────────────────
  {
    pt: /^A agência confirmou o envio do pagamento\. Confirme o recebimento para encerrar o contrato\.$/,
    en: "The agency confirmed the payment was sent. Confirm receipt to close the contract.",
  },
  {
    pt: /^O talento confirmou o recebimento do pagamento\. Contrato encerrado\.$/,
    en: "The talent confirmed receipt of payment. Contract closed.",
  },
  {
    pt: /^Pagamento confirmado pela administração da plataforma\.$/,
    en: "Payment confirmed by platform administration.",
  },
  {
    pt: /^Pagamento do contrato foi confirmado automaticamente após (\d+) dias sem resposta\.$/,
    en: (_, days) => `Contract payment was automatically confirmed after ${days} days without a response.`,
  },
  {
    pt: /^Pagamento marcado como recebido automaticamente após prazo sem confirmação do talento\.$/,
    en: "Payment marked as received automatically after the confirmation deadline passed.",
  },

  // ── Bookings ────────────────────────────────────────────────────────────────
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

  // ── Contracts ───────────────────────────────────────────────────────────────
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
  {
    pt: /^Talento recusou o seu contrato$/,
    en: "Talent rejected your contract",
  },
  {
    pt: /^Agência cancelou o contrato$/,
    en: "Agency cancelled the contract",
  },

  // ── Rehire ──────────────────────────────────────────────────────────────────
  {
    pt: /^Você foi contratado novamente por (.+)$/,
    en: (_, name) => `You were hired again by ${name}`,
  },

  // ── Payments / wallet ────────────────────────────────────────────────────────
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

  // ── Withdrawals ─────────────────────────────────────────────────────────────
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
  {
    pt: /^Seu saque de (.+) foi marcado como pago\.$/,
    en: (_, amount) => `Your withdrawal of ${amount} has been marked as paid.`,
  },
  {
    pt: /^Seu saque de (.+) foi cancelado\. Motivo: (.+)$/,
    en: (_, amount, reason) => `Your withdrawal of ${amount} was cancelled. Reason: ${reason}`,
  },

  // ── Jobs ────────────────────────────────────────────────────────────────────
  {
    pt: /^Nova vaga publicada: "(.+)"$/,
    en: (_, title) => `New job published: "${title}"`,
  },
  {
    pt: /^Você foi convidado para a vaga (.+)$/,
    en: (_, title) => `You were invited to the job: ${title}`,
  },
  {
    pt: /^Você recebeu um convite para a vaga (.+)$/,
    en: (_, title) => `You received an invitation for the job: ${title}`,
  },

  // ── Submissions / applications ──────────────────────────────────────────────
  {
    pt: /^(.+) se candidatou à "(.+)"$/,
    en: (_, name, job) => `${name} applied to "${job}"`,
  },
  {
    pt: /^(.+) se candidatou à sua vaga$/,
    en: (_, name) => `${name} applied to your job`,
  },

  // ── Referrals ───────────────────────────────────────────────────────────────
  {
    pt: /^Nova indicação: (.+) para "(.+)"$/,
    en: (_, name, job) => `New referral: ${name} for "${job}"`,
  },
  {
    pt: /^Seu indicado se cadastrou na plataforma!$/,
    en: "Your referral signed up on the platform!",
  },
  {
    pt: /^Denúncia de fraude registrada\. A comissão desta indicação não será aplicada\.$/,
    en: "Fraud report registered. The commission for this referral will not be applied.",
  },

  // ── Disputes ────────────────────────────────────────────────────────────────
  {
    pt: /^Uma disputa foi aberta no contrato (.+)\. Motivo: (.+)$/,
    en: (_, id, reason) => `A dispute has been opened on contract ${id}. Reason: ${reason}`,
  },
  {
    pt: /^Uma disputa foi aberta no contrato (.+)\.$/,
    en: (_, id) => `A dispute has been opened on contract ${id}.`,
  },
  {
    pt: /^A disputa do contrato (.+) está em análise\.$/,
    en: (_, id) => `The dispute on contract ${id} is under review.`,
  },
  {
    pt: /^A disputa do contrato (.+) foi resolvida com reembolso de (.+)\.$/,
    en: (_, id, amount) => `The dispute on contract ${id} has been resolved with a refund of ${amount}.`,
  },
  {
    pt: /^A disputa do contrato (.+) foi resolvida com pagamento de (.+)\.$/,
    en: (_, id, amount) => `The dispute on contract ${id} has been resolved with a payment of ${amount}.`,
  },
  {
    pt: /^A disputa do contrato (.+) foi encerrada\.$/,
    en: (_, id) => `The dispute on contract ${id} has been closed.`,
  },

  // ── Support ─────────────────────────────────────────────────────────────────
  {
    pt: /^Você tem uma nova mensagem do suporte\.$/,
    en: "You have a new message from support.",
  },
  {
    pt: /^A equipe da BrisaHub respondeu sua solicitação de suporte\.$/,
    en: "The BrisaHub team replied to your support request.",
  },
  {
    pt: /^Nova solicitação de suporte recebida\.$/,
    en: "New support request received.",
  },
  {
    pt: /^Um usuário respondeu uma conversa de suporte\.$/,
    en: "A user replied to a support conversation.",
  },

  // ── Billing / trial ─────────────────────────────────────────────────────────
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
  {
    pt: /^Não foi possível cobrar sua assinatura\. Atualize seu cartão para continuar usando o plano (.+)\.$/,
    en: (_, plan) => `We could not charge your subscription. Update your card to keep using the ${plan} plan.`,
  },
  {
    pt: /^Seu trial foi estendido por (\d+) dias\. Novo encerramento: (.+)\.$/,
    en: (_, days, date) => `Your trial has been extended by ${days} days. New end date: ${date}.`,
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
