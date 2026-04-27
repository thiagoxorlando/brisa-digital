import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { getEfiClient } from "@/lib/efiClient";

// POST /api/efi/setup-webhook
// Registers the platform webhook URL with Efí for the configured PIX key.
// Must be called once (or after any URL change) from an admin session.

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const pixKey    = process.env.EFI_PIX_KEY;
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL;

  if (!pixKey) {
    return NextResponse.json({ error: "EFI_PIX_KEY not configured." }, { status: 500 });
  }
  if (!appUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not configured." }, { status: 500 });
  }

  const webhookUrl = `${appUrl}/api/webhooks/efi`;

  let efi: Awaited<ReturnType<typeof getEfiClient>>;
  try {
    efi = await getEfiClient();
  } catch (err: unknown) {
    const error = err as { message?: string; code?: string; stack?: string; response?: { status?: number; data?: unknown } };
    console.error("[EFI SETUP WEBHOOK ERROR FULL]", {
      message:        error?.message,
      code:           error?.code,
      responseStatus: error?.response?.status,
      responseData:   error?.response?.data,
      stack:          error?.stack,
    });
    return NextResponse.json({ error: "Falha ao conectar com Efí." }, { status: 500 });
  }

  try {
    const res = await efi.put(`/v2/webhook/${encodeURIComponent(pixKey)}`, {
      webhookUrl,
    });

    console.log("[EFI WEBHOOK SETUP SUCCESS]", {
      pixKey,
      webhookUrl,
      status: res.status,
      data:   res.data,
    });

    return NextResponse.json({
      ok:         true,
      webhookUrl,
      efi_status: res.status,
      efi_data:   res.data,
    });
  } catch (err: unknown) {
    const error = err as { message?: string; code?: string; stack?: string; response?: { status?: number; data?: unknown } };
    console.error("[EFI SETUP WEBHOOK ERROR FULL]", {
      message:        error?.message,
      code:           error?.code,
      responseStatus: error?.response?.status,
      responseData:   JSON.stringify(error?.response?.data ?? null, null, 2),
      stack:          error?.stack,
    });

    return NextResponse.json(
      {
        error:      "Falha ao registrar webhook no Efí.",
        efi_status: error?.response?.status ?? null,
        efi_data:   error?.response?.data   ?? null,
      },
      { status: 502 },
    );
  }
}
