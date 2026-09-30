// Client-side only — imported exclusively from "use client" components.

export type ReceiptData = {
  receiptType: "saque" | "pagamento" | "transacao";
  id: string;
  amount: number;
  netAmount?: number | null;
  feeAmount?: number | null;
  status: string | null;
  createdAt: string;
  processedAt?: string | null;

  provider?: string | null;
  providerStatus?: string | null;
  transferId?: string | null;

  holderName?: string | null;
  pixKeyType?: string | null;
  pixKeyValue?: string | null;

  talentName?: string | null;
  jobTitle?: string | null;
  bookingId?: string | null;
  description?: string | null;
  adminNote?: string | null;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function brl(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

function maskPixKey(type: string | null, value: string | null): string {
  if (!value) return "—";
  if (type === "cpf" && value.length >= 4)
    return `***.***.${value.slice(-4, -2)}-${value.slice(-2)}`;
  if (type === "cnpj" && value.length >= 4)
    return `**/****-${value.slice(-2)}`;
  if (type === "email") {
    const [user, domain] = value.split("@");
    return `${user.slice(0, 2)}***@${domain ?? ""}`;
  }
  if (type === "phone" && value.length >= 4)
    return `+55 ** *****-${value.slice(-4)}`;
  if (value.length > 8) return `${value.slice(0, 4)}…${value.slice(-4)}`;
  return value;
}

function hex(h: string): [number, number, number] {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h)!;
  return [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)];
}

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/brand/castanet-symbol.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── main export ───────────────────────────────────────────────────────────────

export async function generateReceiptPdf(data: ReceiptData): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const PAGE_W = 210;
  const PAGE_H = 297;
  const M = 20;          // margin
  const CW = PAGE_W - M * 2; // content width = 170

  // ── palette ──
  const C = {
    teal:      "#0f766e",
    tealDark:  "#0d6462",
    tealBg:    "#f0fdfa",
    tealBorder:"#99f6e4",
    successBg: "#d1fae5",
    successTxt:"#065f46",
    errorBg:   "#fee2e2",
    errorTxt:  "#991b1b",
    infoBg:    "#dbeafe",
    infoTxt:   "#1e40af",
    warnBg:    "#fef9c3",
    warnTxt:   "#92400e",
    gray:      "#6b7280",
    darkGray:  "#374151",
    dark:      "#111827",
    light:     "#f9fafb",
    border:    "#e5e7eb",
    white:     "#ffffff",
  };

  const fill = (c: string) => doc.setFillColor(...hex(c));
  const stroke = (c: string) => doc.setDrawColor(...hex(c));
  const color = (c: string) => doc.setTextColor(...hex(c));

  // ── status helpers ──
  const STATUS_LABEL: Record<string, string> = {
    paid: "Concluído", confirmed: "Confirmado", pago: "Pago",
    cancelled: "Cancelado", rejected: "Cancelado",
    failed: "Falhou", processing: "Em processamento",
    pending: "Pendente", pending_payment: "Aguardando Pagamento",
  };

  function statusColors(s: string | null) {
    const k = s ?? "";
    if (["paid", "confirmed", "pago"].includes(k)) return { bg: C.successBg, txt: C.successTxt };
    if (["cancelled", "rejected", "failed"].includes(k)) return { bg: C.errorBg, txt: C.errorTxt };
    if (k === "processing") return { bg: C.infoBg, txt: C.infoTxt };
    return { bg: C.warnBg, txt: C.warnTxt };
  }

  const TITLE = {
    saque:    "Comprovante de Saque",
    pagamento:"Comprovante de Pagamento",
    transacao:"Comprovante de Transação",
  }[data.receiptType];

  const TYPE_LABEL = {
    saque: "Saque PIX", pagamento: "Pagamento", transacao: "Transação",
  }[data.receiptType];

  const PIX_TYPE_LABEL: Record<string, string> = {
    cpf: "CPF", cnpj: "CNPJ", email: "E-mail", phone: "Telefone", random: "Chave Aleatória",
  };

  // ── load logo ──
  const logoDataUrl = await fetchLogoDataUrl();

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════════════════

  const HEADER_H = 50;

  // main teal background
  fill(C.teal);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");

  // accent bar at the very top
  fill(C.tealDark);
  doc.rect(0, 0, PAGE_W, 2.5, "F");

  // subtle decorative circle (top-right)
  fill("#0d6b64");
  doc.circle(PAGE_W - 5, 5, 28, "F");

  let logoEndX = M;

  if (logoDataUrl) {
    try {
      // white rounded pill behind logo
      fill(C.white);
      doc.roundedRect(M - 1, 9, 22, 13, 2, 2, "F");
      doc.addImage(logoDataUrl, "PNG", M + 4.5, 10, 11, 11);
      logoEndX = M + 24;
    } catch {
      logoEndX = M;
    }
  }

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  color(C.white);
  doc.text(TITLE, logoEndX, 21);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(200, 240, 235);
  doc.text("Documento gerado automaticamente pela plataforma CastAnet", logoEndX, 28);

  // Date line in header
  const dateRef = data.processedAt ?? data.createdAt;
  const dateStr = new Date(dateRef).toLocaleString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  doc.setFontSize(8);
  doc.setTextColor(170, 230, 222);
  doc.text(dateStr, M, 41);

  // ═══════════════════════════════════════════════════════════════════════════
  // AMOUNT CARD
  // ═══════════════════════════════════════════════════════════════════════════

  let y = HEADER_H + 10; // 60

  const CARD_H = 38;
  fill(C.tealBg);
  stroke(C.tealBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, CW, CARD_H, 4, 4, "FD");

  // Net amount (large)
  const netAmt = (data.netAmount !== null && data.netAmount !== undefined)
    ? data.netAmount
    : data.amount;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  color(C.successTxt);
  doc.text(brl(netAmt), PAGE_W / 2, y + 13, { align: "center" });

  // Fee breakdown (small)
  if (data.feeAmount && data.feeAmount > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    color(C.gray);
    doc.text(
      `Taxa: ${brl(data.feeAmount)} · Valor bruto: ${brl(data.amount)}`,
      PAGE_W / 2, y + 20, { align: "center" },
    );
  }

  // Status badge
  const sc = statusColors(data.status);
  const statusLabel = STATUS_LABEL[data.status ?? ""] ?? data.status ?? "—";
  const badgeW = Math.max(36, statusLabel.length * 2.6 + 10);
  const badgeX = PAGE_W / 2 - badgeW / 2;
  const badgeY = data.feeAmount && data.feeAmount > 0 ? y + 25 : y + 22;

  fill(sc.bg);
  doc.roundedRect(badgeX, badgeY, badgeW, 7, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  color(sc.txt);
  doc.text(statusLabel, PAGE_W / 2, badgeY + 4.8, { align: "center" });

  y += CARD_H + 10; // 108

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION RENDERER
  // ═══════════════════════════════════════════════════════════════════════════

  const ROW_H = 8;

  function drawSection(
    title: string,
    rows: Array<[string, string | null | undefined]>,
    startY: number,
  ): number {
    const valid = rows.filter(([, v]) => v != null && v !== "");
    if (valid.length === 0) return startY;

    // Section title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    color(C.teal);
    doc.text(title.toUpperCase(), M, startY + 4);

    // Underline
    stroke(C.tealBorder);
    doc.setLineWidth(0.4);
    doc.line(M, startY + 6, M + CW, startY + 6);

    let ry = startY + 13;

    valid.forEach(([label, value], i) => {
      if (i % 2 === 0) {
        fill(C.light);
        doc.rect(M, ry - 5.5, CW, ROW_H, "F");
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      color(C.gray);
      doc.text(label, M + 3, ry);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      color(C.dark);
      // clamp long values
      const maxValW = CW * 0.58;
      doc.text(value!, M + CW - 3, ry, { align: "right", maxWidth: maxValW });

      ry += ROW_H;
    });

    return ry + 6;
  }

  // ─── Transaction Details ──────────────────────────────────────────────────

  y = drawSection("Detalhes da Transação", [
    ["Tipo da transação", TYPE_LABEL],
    data.transferId ? ["ID da transferência", data.transferId] : ["ID da transferência", null],
    ["ID interno", data.id],
    ["Provedor", data.provider === "asaas" ? "Asaas PIX" : (data.provider ?? "CastAnet")],
    data.providerStatus ? ["Status do provedor", data.providerStatus] : ["Status", null],
    ["Origem", "CastAnet"],
    data.adminNote ? ["Observação", data.adminNote] : ["Observação", null],
  ], y);

  // ─── Recipient ────────────────────────────────────────────────────────────

  const hasRecipient = data.holderName || data.pixKeyType || data.pixKeyValue;
  if (hasRecipient) {
    y = drawSection("Destinatário", [
      ["Favorecido", data.holderName ?? null],
      data.pixKeyType ? ["Tipo de chave PIX", PIX_TYPE_LABEL[data.pixKeyType] ?? data.pixKeyType] : ["Tipo", null],
      data.pixKeyValue ? ["Chave PIX", maskPixKey(data.pixKeyType ?? null, data.pixKeyValue)] : ["Chave", null],
    ], y);
  }

  // ─── References ───────────────────────────────────────────────────────────

  const hasRef = data.talentName || data.jobTitle || data.bookingId || data.description;
  if (hasRef) {
    y = drawSection("Referências", [
      ["Talento / Agência", data.talentName ?? null],
      ["Vaga / Título", data.jobTitle ?? null],
      ["ID da reserva", data.bookingId ?? null],
      ["Descrição", data.description ?? null],
    ], y);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════════════════════════

  const FOOTER_Y = PAGE_H - 22;

  stroke(C.border);
  doc.setLineWidth(0.25);
  doc.line(M, FOOTER_Y - 2, PAGE_W - M, FOOTER_Y - 2);

  // CastAnet brand mark in footer
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  color(C.teal);
  doc.text("CastAnet", M, FOOTER_Y + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  color(C.gray);
  doc.text("Este comprovante foi gerado automaticamente pela CastAnet.", M + 19, FOOTER_Y + 4);
  doc.text("Em caso de dúvida, acesse seu painel financeiro.", M, FOOTER_Y + 9);

  const generatedAt = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  doc.setFontSize(7);
  doc.text(`Gerado em ${generatedAt}`, PAGE_W - M, FOOTER_Y + 9, { align: "right" });

  // ═══════════════════════════════════════════════════════════════════════════
  // SAVE
  // ═══════════════════════════════════════════════════════════════════════════

  const prefix = data.receiptType === "saque" ? "comprovante-saque" : "comprovante-pagamento";
  doc.save(`${prefix}-${data.id}.pdf`);
}
