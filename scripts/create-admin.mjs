// Creates admin@admin.com / 123456 and sets role = 'admin' in profiles.
// Run once: node scripts/create-admin.mjs

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

// Load .env.local manually (dotenv doesn't pick it up by default)
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  const env = readFileSync(join(root, ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && !k.startsWith("#")) process.env[k.trim()] = v.join("=").trim();
  }
} catch {}

const url     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !svcKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, svcKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL    = "admin@admin.com";
const PASSWORD = "123456";

// 1. Create the auth user
const { data: created, error: createErr } = await supabase.auth.admin.createUser({
  email:             EMAIL,
  password:          PASSWORD,
  email_confirm:     true,   // skip confirmation email
});

if (createErr && !createErr.message.includes("already been registered")) {
  console.error("Failed to create user:", createErr.message);
  process.exit(1);
}

// If user already exists, fetch their ID
let userId = created?.user?.id;
if (!userId) {
  const { data: list } = await supabase.auth.admin.listUsers();
  userId = list?.users?.find((u) => u.email === EMAIL)?.id;
}

if (!userId) {
  console.error("Could not resolve user ID");
  process.exit(1);
}

// 2. Upsert profile with role = admin
const { error: profileErr } = await supabase
  .from("profiles")
  .upsert({ id: userId, role: "admin" }, { onConflict: "id" });

if (profileErr) {
  console.error("Failed to set profile role:", profileErr.message);
  process.exit(1);
}

console.log(`Admin account ready — email: ${EMAIL}  password: ${PASSWORD}  id: ${userId}`);
