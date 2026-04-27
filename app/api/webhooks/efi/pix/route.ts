import { NextRequest } from "next/server";
import { handleEfiWebhook } from "../_handler";

// POST /api/webhooks/efi/pix
// Efí appends /pix to the webhook URL in some configurations.
// Delegates to the same handler as /api/webhooks/efi.
export async function POST(req: NextRequest) {
  return handleEfiWebhook(req);
}
