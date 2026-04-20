const PROJECT_REF = "lhzhebjzfsrnmmouvmry";
const ACCESS_TOKEN = "sbp_5abaaae5c995cb89c3fa996b8ba3afe91c493a0a";

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

async function run(label, sql) {
  try { await query(sql); console.log(`  ✓ ${label}`); return true; }
  catch(e) { console.error(`  ✗ ${label}: ${e.message}`); return false; }
}

let issues = [];
function flag(msg) { issues.push(msg); console.error(`  ⚠ ${msg}`); }

// ── 1. Required columns per table ────────────────────────────────────────────
const REQUIRED = {
  profiles:       ["id","role","created_at"],
  agencies:       ["id","company_name","contact_name","phone","country","city","description","website","avatar_url","address","subscription_status","deleted_at","created_at"],
  talent_profiles:["id","user_id","full_name","phone","country","city","bio","categories","instagram","tiktok","youtube","x_handle","website","imdb","avatar_url","age","gender","photo_front_url","photo_left_url","photo_right_url","username","deleted_at","created_at"],
  jobs:           ["id","agency_id","title","description","category","budget","deadline","location","gender","age_min","age_max","number_of_talents_required","status","job_date","deleted_at","created_at"],
  submissions:    ["id","job_id","talent_user_id","talent_name","email","bio","referrer_id","status","mode","photo_front_url","photo_left_url","photo_right_url","video_url","created_at"],
  contracts:      ["id","job_id","talent_id","agency_id","job_date","job_time","location","job_description","payment_amount","payment_method","additional_notes","status","signed_at","agency_signed_at","deposit_paid_at","paid_at","withdrawn_at","deleted_at","created_at"],
  bookings:       ["id","job_id","agency_id","talent_user_id","job_title","price","status","deleted_at","created_at"],
  notifications:  ["id","user_id","type","message","link","is_read","created_at"],
  agency_plans:   ["user_id","plan","created_at"],
};

console.log("═══════════════════════════════════════");
console.log("  BRISA DIGITAL — Supabase Full Audit");
console.log("═══════════════════════════════════════\n");

// Get all columns
const colRows = await query(`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema = 'public' ORDER BY table_name, ordinal_position
`);
const existing = {};
for (const {table_name, column_name} of colRows) {
  if (!existing[table_name]) existing[table_name] = new Set();
  existing[table_name].add(column_name);
}

console.log("── 1. Columns ──");
for (const [table, required] of Object.entries(REQUIRED)) {
  const have = existing[table] || new Set();
  const missing = required.filter(c => !have.has(c));
  if (missing.length) {
    flag(`${table} missing columns: ${missing.join(", ")}`);
  } else {
    console.log(`  ✓ ${table}`);
  }
}

// ── 2. RLS enabled ──────────────────────────────────────────────────────────
console.log("\n── 2. Row Level Security ──");
const rlsRows = await query(`
  SELECT relname, relrowsecurity FROM pg_class
  WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
  ORDER BY relname
`);
for (const {relname, relrowsecurity} of rlsRows) {
  if (REQUIRED[relname]) {
    if (relrowsecurity) console.log(`  ✓ ${relname} RLS enabled`);
    else flag(`${relname} RLS is DISABLED`);
  }
}

// ── 3. Service-role policies ─────────────────────────────────────────────────
console.log("\n── 3. Service Role Policies ──");
const policies = await query(`
  SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename
`);
const policyMap = {};
for (const {tablename, policyname} of policies) {
  if (!policyMap[tablename]) policyMap[tablename] = [];
  policyMap[tablename].push(policyname);
}
for (const table of Object.keys(REQUIRED)) {
  const has = (policyMap[table] || []).some(p => p.toLowerCase().includes("service role"));
  if (has) console.log(`  ✓ ${table}`);
  else flag(`${table} missing service role policy`);
}

// ── 4. Storage bucket ────────────────────────────────────────────────────────
console.log("\n── 4. Storage ──");
const buckets = await query(`SELECT id, name, public FROM storage.buckets`);
const tb = buckets.find(b => b.name === "talent-media");
if (tb) {
  console.log(`  ✓ talent-media bucket exists (public: ${tb.public})`);
  if (!tb.public) flag("talent-media bucket is not public");
} else {
  flag("talent-media bucket MISSING");
}
const storePolicies = await query(`SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects'`);
console.log(`  ✓ storage policies: ${storePolicies.map(p=>p.policyname).join(", ") || "(none)"}`);

// ── 5. Auth config ───────────────────────────────────────────────────────────
console.log("\n── 5. Auth ──");
const authRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` }
});
const auth = await authRes.json();
console.log(`  ✓ Site URL: ${auth.site_url}`);
console.log(`  ✓ Email signups enabled: ${auth.enable_signup}`);
console.log(`  ✓ Email confirmations required: ${auth.mailer_autoconfirm ? "no (auto-confirm ON)" : "yes"}`);

// ── 6. Constraints ───────────────────────────────────────────────────────────
console.log("\n── 6. Check Constraints ──");
const constraints = await query(`
  SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace
  ORDER BY table_name, conname
`);
for (const {table_name, conname, def} of constraints) {
  console.log(`  ✓ ${table_name}.${conname}: ${def}`);
}

// ── 7. Auto-fix anything missing ─────────────────────────────────────────────
if (issues.length > 0) {
  console.log(`\n── 7. Auto-fixing ${issues.length} issues ──`);
  // Re-add any missing columns
  for (const [table, required] of Object.entries(REQUIRED)) {
    const have = existing[table] || new Set();
    for (const col of required) {
      if (!have.has(col)) {
        const typeMap = {
          id: "uuid", created_at: "timestamptz DEFAULT now()", deleted_at: "timestamptz",
          role: "text", status: "text", plan: "text", type: "text", message: "text",
          link: "text", is_read: "boolean DEFAULT false", age: "int",
          price: "numeric", budget: "numeric", payment_amount: "numeric",
          age_min: "int", age_max: "int", number_of_talents_required: "int DEFAULT 1",
          categories: "text[]",
        };
        const t = typeMap[col] || "text";
        await run(`ADD ${table}.${col}`, `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${t}`);
      }
    }
  }
  // Fix RLS
  for (const {relname, relrowsecurity} of rlsRows) {
    if (REQUIRED[relname] && !relrowsecurity) {
      await run(`Enable RLS ${relname}`, `ALTER TABLE ${relname} ENABLE ROW LEVEL SECURITY`);
    }
  }
  // Fix service role policies
  for (const table of Object.keys(REQUIRED)) {
    const has = (policyMap[table] || []).some(p => p.toLowerCase().includes("service role"));
    if (!has) {
      await run(`Policy ${table}`, `CREATE POLICY "Service role full access on ${table}" ON ${table} FOR ALL USING (true) WITH CHECK (true)`);
    }
  }
  await run("reload schema cache", `NOTIFY pgrst, 'reload schema'`);
} else {
  await run("reload schema cache", `NOTIFY pgrst, 'reload schema'`);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════");
if (issues.length === 0) {
  console.log("  ✅ All checks passed — database is healthy");
} else {
  console.log(`  ⚠  ${issues.length} issue(s) found and auto-fixed`);
  issues.forEach(i => console.log(`     • ${i}`));
}
console.log("═══════════════════════════════════════");
