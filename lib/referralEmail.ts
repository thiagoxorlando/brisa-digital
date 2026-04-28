const DEFAULT_APP_URL = "http://localhost:3000";

export type ReferralEmailDetails = {
  referrerName: string;
  jobTitle: string;
  agencyName?: string | null;
  location?: string | null;
  jobUrl: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

export function getAppUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || DEFAULT_APP_URL).replace(/\/+$/, "");
}

export function buildReferralJobUrl({
  appUrl = getAppUrl(),
  jobId,
  token,
}: {
  appUrl?: string;
  jobId: string;
  token: string;
}) {
  return `${appUrl}/jobs/${encodeURIComponent(jobId)}?ref=${encodeURIComponent(token)}`;
}

export function buildReferralEmail({
  referrerName,
  jobTitle,
  agencyName,
  location,
  jobUrl,
}: ReferralEmailDetails) {
  const safeReferrerName = escapeHtml(referrerName || "Um talento da BrisaHub");
  const safeJobTitle = escapeHtml(jobTitle || "Oportunidade na BrisaHub");
  const safeAgencyName = agencyName?.trim() ? escapeHtml(agencyName.trim()) : null;
  const safeLocation = location?.trim() ? escapeHtml(location.trim()) : null;
  const safeJobUrl = escapeHtml(jobUrl);

  const metadata = [
    safeAgencyName ? `<li><strong>Agência/empresa:</strong> ${safeAgencyName}</li>` : "",
    safeLocation ? `<li><strong>Local/formato:</strong> ${safeLocation}</li>` : "",
  ].filter(Boolean);

  const textMetadata = [
    safeAgencyName ? `Agência/empresa: ${agencyName?.trim()}` : "",
    safeLocation ? `Local/formato: ${location?.trim()}` : "",
  ].filter(Boolean);

  const subject = "Você foi indicado para uma oportunidade na BrisaHub";

  return {
    subject,
    text: [
      "Olá,",
      "",
      `${referrerName || "Um talento da BrisaHub"} indicou você para esta oportunidade:`,
      jobTitle || "Oportunidade na BrisaHub",
      ...textMetadata,
      "",
      "Para visualizar a vaga e participar, crie sua conta ou faça login na BrisaHub usando o link abaixo.",
      jobUrl,
      "",
      "Se essa indicação resultar em contratação/conclusão paga do job, quem indicou você poderá receber 2% de comissão sobre esse job, conforme as regras da plataforma.",
      "",
      "BrisaHub",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#18181b">
        <p style="font-size:15px;line-height:1.6;margin:0 0 18px">Olá,</p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 18px">
          ${safeReferrerName} indicou você para esta oportunidade:
        </p>
        <div style="border:1px solid #e4e4e7;border-radius:14px;padding:18px 18px;margin:0 0 22px;background:#fafafa">
          <h1 style="font-size:20px;line-height:1.25;margin:0 0 10px;color:#18181b">${safeJobTitle}</h1>
          ${
            metadata.length
              ? `<ul style="font-size:14px;line-height:1.6;color:#52525b;margin:0;padding-left:18px">${metadata.join("")}</ul>`
              : ""
          }
        </div>
        <p style="font-size:15px;line-height:1.6;margin:0 0 22px;color:#3f3f46">
          Para visualizar a vaga e participar, crie sua conta ou faça login na BrisaHub usando o link abaixo.
        </p>
        <p style="margin:0 0 24px">
          <a href="${safeJobUrl}"
             style="display:inline-block;background:#18181b;color:#fff;font-size:14px;font-weight:700;
                    padding:13px 24px;border-radius:12px;text-decoration:none">
            Ver oportunidade
          </a>
        </p>
        <p style="font-size:13px;line-height:1.6;margin:0 0 26px;color:#71717a">
          Se essa indicação resultar em contratação/conclusão paga do job, quem indicou você poderá receber 2% de comissão sobre esse job, conforme as regras da plataforma.
        </p>
        <p style="font-size:13px;font-weight:700;margin:0;color:#18181b">BrisaHub</p>
      </div>
    `,
  };
}
