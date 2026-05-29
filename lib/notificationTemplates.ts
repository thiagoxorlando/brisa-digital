/**
 * Notification template registry — single source of truth for in-app and
 * (future) email notification copy.
 *
 * Storage: in-code today. A future notification_templates table or
 * platform_settings entry can override these at runtime without changing
 * every notify() call site.
 *
 * Variable interpolation: tokens of the form {name} are replaced from `vars`.
 * Unknown tokens are left in place so missing data is visible in QA.
 */

export type NotificationKey =
  | "payout_released"
  | "contract_signed"
  | "withdrawal_requested"
  | "withdrawal_paid"
  | "support_reply"
  | "contract_cancelled"
  | "dispute_opened"
  | "dispute_under_review"
  | "dispute_resolved_refund"
  | "dispute_resolved_release"
  | "dispute_closed"
  | "trial_started"
  | "trial_ending_soon"
  | "subscription_activated"
  | "subscription_canceled"
  | "payment_failed"
  | "trial_extended";

export type NotificationTemplate = {
  key: NotificationKey;
  titlePt: string;
  bodyPt: string;
  titleEn?: string;
  bodyEn?: string;
  /** Notification "type" channel used by the in-app notify() helper. */
  channel: string;
  /** Link path — supports {variable} interpolation. */
  defaultLink: string;
};

export const NOTIFICATION_TEMPLATES: Record<NotificationKey, NotificationTemplate> = {
  payout_released: {
    key: "payout_released",
    channel: "payment",
    titlePt: "Pagamento liberado",
    bodyPt: "Agência liberou seu pagamento de {amount} — a caminho!",
    titleEn: "Payment released",
    bodyEn: "The agency released your payment of {amount}.",
    defaultLink: "/talent/finances",
  },
  contract_signed: {
    key: "contract_signed",
    channel: "contract",
    titlePt: "Contrato assinado",
    bodyPt: "Talento assinou o contrato",
    titleEn: "Contract signed",
    bodyEn: "Talent has signed the contract",
    defaultLink: "/agency/contracts",
  },
  withdrawal_requested: {
    key: "withdrawal_requested",
    channel: "payment",
    titlePt: "Saque solicitado",
    bodyPt: "Seu saque de {amount} foi enviado para processamento.",
    titleEn: "Withdrawal requested",
    bodyEn: "Your withdrawal of {amount} has been submitted for processing.",
    defaultLink: "/talent/finances",
  },
  withdrawal_paid: {
    key: "withdrawal_paid",
    channel: "payment",
    titlePt: "Saque concluído",
    bodyPt: "Seu saque de {amount} foi concluído via PIX.",
    titleEn: "Withdrawal completed",
    bodyEn: "Your withdrawal of {amount} has been completed via PIX.",
    defaultLink: "/talent/finances",
  },
  support_reply: {
    key: "support_reply",
    channel: "support",
    titlePt: "Nova resposta do suporte",
    bodyPt: "Você tem uma nova mensagem do suporte.",
    titleEn: "New support reply",
    bodyEn: "You have a new message from support.",
    defaultLink: "/support",
  },
  contract_cancelled: {
    key: "contract_cancelled",
    channel: "contract",
    titlePt: "Contrato cancelado",
    bodyPt: "O contrato foi cancelado.",
    titleEn: "Contract cancelled",
    bodyEn: "The contract has been cancelled.",
    defaultLink: "/contracts",
  },
  dispute_opened: {
    key: "dispute_opened",
    channel: "contract",
    titlePt: "Disputa aberta",
    bodyPt: "Uma disputa foi aberta no contrato {contractId}.",
    titleEn: "Dispute opened",
    bodyEn: "A dispute has been opened on contract {contractId}.",
    defaultLink: "/admin/disputes/{disputeId}",
  },
  dispute_under_review: {
    key: "dispute_under_review",
    channel: "contract",
    titlePt: "Disputa em análise",
    bodyPt: "A disputa do contrato {contractId} está em análise.",
    titleEn: "Dispute under review",
    bodyEn: "The dispute on contract {contractId} is under review.",
    defaultLink: "/admin/disputes/{disputeId}",
  },
  dispute_resolved_refund: {
    key: "dispute_resolved_refund",
    channel: "payment",
    titlePt: "Disputa resolvida com reembolso",
    bodyPt: "A disputa do contrato {contractId} foi resolvida com reembolso de {amount}.",
    titleEn: "Dispute resolved — refund",
    bodyEn: "The dispute on contract {contractId} has been resolved with a refund of {amount}.",
    defaultLink: "/admin/disputes/{disputeId}",
  },
  dispute_resolved_release: {
    key: "dispute_resolved_release",
    channel: "payment",
    titlePt: "Disputa resolvida com pagamento",
    bodyPt: "A disputa do contrato {contractId} foi resolvida com pagamento de {amount}.",
    titleEn: "Dispute resolved — payment released",
    bodyEn: "The dispute on contract {contractId} has been resolved with a payment of {amount}.",
    defaultLink: "/admin/disputes/{disputeId}",
  },
  dispute_closed: {
    key: "dispute_closed",
    channel: "contract",
    titlePt: "Disputa encerrada",
    bodyPt: "A disputa do contrato {contractId} foi encerrada.",
    titleEn: "Dispute closed",
    bodyEn: "The dispute on contract {contractId} has been closed.",
    defaultLink: "/admin/disputes/{disputeId}",
  },
  trial_started: {
    key: "trial_started",
    channel: "billing",
    titlePt: "Trial iniciado",
    bodyPt: "Seu trial de {days} dias começou. Você tem acesso completo ao plano {plan} até {endsAt}.",
    titleEn: "Trial started",
    bodyEn: "Your {days}-day trial has started. You have full access to the {plan} plan until {endsAt}.",
    defaultLink: "/agency/billing",
  },
  trial_ending_soon: {
    key: "trial_ending_soon",
    channel: "billing",
    titlePt: "Trial encerrando em breve",
    bodyPt: "Seu trial encerra em {days} dias. A cobrança de {price} será feita automaticamente.",
    titleEn: "Trial ending soon",
    bodyEn: "Your trial ends in {days} days. You will be automatically charged {price}.",
    defaultLink: "/agency/billing",
  },
  subscription_activated: {
    key: "subscription_activated",
    channel: "billing",
    titlePt: "Assinatura ativada",
    bodyPt: "Seu plano {plan} está ativo. Próxima cobrança em {nextDue}.",
    titleEn: "Subscription activated",
    bodyEn: "Your {plan} plan is now active. Next billing on {nextDue}.",
    defaultLink: "/agency/billing",
  },
  subscription_canceled: {
    key: "subscription_canceled",
    channel: "billing",
    titlePt: "Assinatura cancelada",
    bodyPt: "Sua assinatura foi cancelada. Você voltou ao plano gratuito.",
    titleEn: "Subscription cancelled",
    bodyEn: "Your subscription has been cancelled. You are now on the free plan.",
    defaultLink: "/agency/billing",
  },
  payment_failed: {
    key: "payment_failed",
    channel: "billing",
    titlePt: "Falha no pagamento",
    bodyPt: "Não foi possível cobrar sua assinatura. Atualize seu cartão para continuar usando o plano {plan}.",
    titleEn: "Payment failed",
    bodyEn: "We could not charge your subscription. Update your card to keep using the {plan} plan.",
    defaultLink: "/agency/billing",
  },
  trial_extended: {
    key: "trial_extended",
    channel: "billing",
    titlePt: "Trial estendido",
    bodyPt: "Seu trial foi estendido por {days} dias. Novo encerramento: {endsAt}.",
    titleEn: "Trial extended",
    bodyEn: "Your trial has been extended by {days} days. New end date: {endsAt}.",
    defaultLink: "/agency/billing",
  },
};

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match;
  });
}

export function renderNotificationTemplate(
  key: NotificationKey,
  vars: Record<string, string> = {},
  lang: "pt" | "en" = "pt",
): { title: string; body: string; link: string; channel: string } {
  const tpl = NOTIFICATION_TEMPLATES[key];
  const title =
    lang === "en" && tpl.titleEn ? interpolate(tpl.titleEn, vars) : interpolate(tpl.titlePt, vars);
  const body =
    lang === "en" && tpl.bodyEn ? interpolate(tpl.bodyEn, vars) : interpolate(tpl.bodyPt, vars);
  const link = interpolate(tpl.defaultLink, vars);
  return { title, body, link, channel: tpl.channel };
}
