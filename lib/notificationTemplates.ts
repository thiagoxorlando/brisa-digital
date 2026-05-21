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
  | "dispute_opened";

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
    defaultLink: "/talent/finances",
  },
  withdrawal_paid: {
    key: "withdrawal_paid",
    channel: "payment",
    titlePt: "Saque concluído",
    bodyPt: "Seu saque de {amount} foi concluído via PIX.",
    defaultLink: "/talent/finances",
  },
  support_reply: {
    key: "support_reply",
    channel: "support",
    titlePt: "Nova resposta do suporte",
    bodyPt: "Você tem uma nova mensagem do suporte.",
    defaultLink: "/support",
  },
  contract_cancelled: {
    key: "contract_cancelled",
    channel: "contract",
    titlePt: "Contrato cancelado",
    bodyPt: "O contrato foi cancelado.",
    defaultLink: "/contracts",
  },
  dispute_opened: {
    key: "dispute_opened",
    channel: "contract",
    titlePt: "Disputa aberta",
    bodyPt: "Uma disputa foi aberta no contrato.",
    defaultLink: "/contracts",
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
