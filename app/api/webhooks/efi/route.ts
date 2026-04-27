import { NextRequest } from "next/server";
import { handleEfiWebhook } from "./_handler";

// POST /api/webhooks/efi
export async function POST(req: NextRequest) {
  return handleEfiWebhook(req);
}
