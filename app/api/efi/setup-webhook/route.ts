import path from "path";
import { NextRequest, NextResponse } from "next/server";
import EfiPay from "sdk-node-apis-efi";

// GET /api/efi/setup-webhook?secret=<EFI_SETUP_SECRET>
// Registers the platform webhook URL with Efí using the official SDK.
// Must be called once (or after any URL change).

export async function GET(req: NextRequest) {
  const setupSecret = process.env.EFI_SETUP_SECRET;
  const provided    = req.nextUrl.searchParams.get("secret");

  console.log("[EFI SETUP AUTH]", {
    hasEnvSecret: Boolean(setupSecret),
    provided,
    expected:     setupSecret,
    matches:      provided === setupSecret,
  });

  // Temporarily not blocking — checking logs to diagnose mismatch.
  // if (setupSecret && provided !== setupSecret) {
  //   return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // }

  const pixKey = process.env.EFI_PIX_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!pixKey) {
    return NextResponse.json({ error: "EFI_PIX_KEY not configured." }, { status: 500 });
  }
  if (!appUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not configured." }, { status: 500 });
  }

  const webhookUrl = `${appUrl}/api/webhooks/efi`;

  // Resolve cert — prefer file path, fall back to base64
  const certPath    = process.env.EFI_CERTIFICATE_PATH;
  const certBase64  = process.env.EFI_CERT_BASE64;
  let certificate: string;
  let cert_base64: boolean;

  if (certPath) {
    certificate = path.isAbsolute(certPath)
      ? certPath
      : path.resolve(process.cwd(), certPath);
    cert_base64 = false;
    console.log("[EFI SETUP WEBHOOK] cert source: file path, resolved:", certificate);
  } else if (certBase64) {
    certificate = certBase64;
    cert_base64 = true;
    console.log("[EFI SETUP WEBHOOK] cert source: EFI_CERT_BASE64 (base64)");
  } else {
    return NextResponse.json({ error: "No Efí certificate configured." }, { status: 500 });
  }

  console.log("[EFI SETUP WEBHOOK] registering", {
    hasPixKey:   Boolean(pixKey),
    webhookUrl,
    method:      "pixConfigWebhook",
  });

  const efipay = new EfiPay({
    sandbox:      false,
    client_id:    process.env.EFI_CLIENT_ID!,
    client_secret: process.env.EFI_CLIENT_SECRET!,
    certificate,
    cert_base64,
    validateMtls: false, // SDK sets x-skip-mtls-checking: true
  });

  const webhookToken = process.env.EFI_WEBHOOK_TOKEN;

  try {
    const result = await efipay.pixConfigWebhook(
      { chave: pixKey },
      {
        webhookUrl,
        ...(webhookToken ? { headers: { "pix-token": webhookToken } } : {}),
      },
    );

    console.log("[EFI WEBHOOK SETUP SUCCESS]", { webhookUrl, result });

    return NextResponse.json({ ok: true, webhookUrl, result });
  } catch (err: unknown) {
    console.error("[EFI SETUP WEBHOOK ERROR]", JSON.stringify(err, null, 2));
    return NextResponse.json(
      { error: "Falha ao registrar webhook no Efí.", detail: err },
      { status: 502 },
    );
  }
}
