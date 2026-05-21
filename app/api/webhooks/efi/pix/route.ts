import { type NextRequest } from "next/server";
import { handleEfiWebhook } from "../_handler";

export async function POST(req: NextRequest) {
  return handleEfiWebhook(req);
}
