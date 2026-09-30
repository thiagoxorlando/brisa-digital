import { Resend } from "resend";

const DEVELOPMENT_FROM_EMAIL = "CastAnet <noreply@brisahub.com.br>";

let resendClient: Resend | null = null;
let resendClientKey: string | null = null;

export type SendEmailStatus =
  | number
  | "missing_key"
  | "missing_from_email"
  | "network_error"
  | "resend_error";

export type SendEmailResult = {
  attempted: boolean;
  ok: boolean;
  status: SendEmailStatus;
  id?: string;
  error?: string;
};

type EmailConfig =
  | {
      ok: true;
      apiKey: string;
      fromEmail: string;
    }
  | {
      ok: false;
      status: Extract<SendEmailStatus, "missing_key" | "missing_from_email">;
      error: string;
    };

export type EmailConfigValidation =
  | {
      ok: true;
      fromEmail: string;
      usingDevelopmentFallback: boolean;
    }
  | {
      ok: false;
      status: Extract<SendEmailStatus, "missing_key" | "missing_from_email">;
      error: string;
    };

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string | string[];
};

function getResendClient(apiKey: string) {
  if (!resendClient || resendClientKey !== apiKey) {
    resendClient = new Resend(apiKey);
    resendClientKey = apiKey;
  }

  return resendClient;
}

function normalizeRecipients(to: string | string[]) {
  return Array.isArray(to) ? to : [to];
}

function maskEmailAddress(value: string) {
  const [localPart = "", domain = ""] = value.split("@");
  if (!domain) return value.slice(0, 2) + "...";

  const visibleLocal =
    localPart.length <= 2
      ? localPart[0] ?? "*"
      : `${localPart.slice(0, 2)}***${localPart.slice(-1)}`;

  return `${visibleLocal}@${domain}`;
}

function getFromEmail() {
  const configuredFromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  if (configuredFromEmail) return configuredFromEmail;

  if (process.env.NODE_ENV !== "production") {
    return DEVELOPMENT_FROM_EMAIL;
  }

  return null;
}

function getEmailConfig(): EmailConfig {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      status: "missing_key",
      error: "RESEND_API_KEY is not configured.",
    };
  }

  const fromEmail = getFromEmail();
  if (!fromEmail) {
    return {
      ok: false,
      status: "missing_from_email",
      error: "RESEND_FROM_EMAIL is not configured.",
    };
  }

  return {
    ok: true,
    apiKey,
    fromEmail,
  };
}

export function validateEmailConfig(): EmailConfigValidation {
  const config = getEmailConfig();
  if (!config.ok) return config;

  return {
    ok: true,
    fromEmail: config.fromEmail,
    usingDevelopmentFallback:
      !process.env.RESEND_FROM_EMAIL?.trim() && process.env.NODE_ENV !== "production",
  };
}

export function getEmailErrorHttpStatus(status: SendEmailStatus) {
  if (status === "missing_key" || status === "missing_from_email") {
    return 500;
  }

  return 502;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  from,
  replyTo,
}: SendEmailInput): Promise<SendEmailResult> {
  const recipients = normalizeRecipients(to);
  const maskedRecipients = recipients.map(maskEmailAddress);
  const config = getEmailConfig();

  if (!config.ok) {
    console.error("[email] send failed", {
      reason: config.status,
      to: maskedRecipients,
      subject,
    });

    return {
      attempted: false,
      ok: false,
      status: config.status,
      error: config.error,
    };
  }

  try {
    const { data, error } = await getResendClient(config.apiKey).emails.send({
      from: from ?? config.fromEmail,
      to: recipients,
      subject,
      html,
      ...(text ? { text } : {}),
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) {
      console.error("[email] send failed", {
        reason: error.name,
        statusCode: error.statusCode,
        message: error.message,
        to: maskedRecipients,
        subject,
      });

      return {
        attempted: true,
        ok: false,
        status: error.statusCode ?? "resend_error",
        error: error.message,
      };
    }

    console.log("[email] sent", {
      id: data?.id,
      to: maskedRecipients,
      subject,
    });

    return {
      attempted: true,
      ok: true,
      status: 200,
      id: data?.id,
    };
  } catch (error) {
    console.error("[email] send failed", {
      reason: "network_error",
      message: error instanceof Error ? error.message : "Unknown error",
      to: maskedRecipients,
      subject,
    });

    return {
      attempted: true,
      ok: false,
      status: "network_error",
      error: error instanceof Error ? error.message : "Request to Resend failed",
    };
  }
}
