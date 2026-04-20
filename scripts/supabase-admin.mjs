const PROJECT_REF = "lhzhebjzfsrnmmouvmry";
const ACCESS_TOKEN = "sbp_5abaaae5c995cb89c3fa996b8ba3afe91c493a0a";

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

async function run(label, sql) {
  try {
    await query(sql);
    console.log(`  ✓ ${label}`);
  } catch(e) {
    console.error(`  ✗ ${label}: ${e.message}`);
  }
}

// Fix misnamed columns from old schema
await run("bookings: add status check constraint", `
  ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
  ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
    CHECK (status IN ('pending','pending_payment','paid','cancelled'))
`);

await run("contracts: add status check constraint", `
  ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
  ALTER TABLE contracts ADD CONSTRAINT contracts_status_check
    CHECK (status IN ('sent','signed','rejected','confirmed','deposit_paid','paid','cancelled','withdrawn'))
`);

await run("jobs: add status check constraint", `
  ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
  ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
    CHECK (status IN ('open','closed','draft'))
`);

// Add missing columns from old-schema tables
await run("bookings: add job_id FK", `
  ALTER TABLE bookings ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL
`);

await run("contracts: add job_id FK", `
  ALTER TABLE contracts ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL
`);

// RLS policies — ensure service role can do everything
const tables = ["profiles","agencies","talent_profiles","jobs","submissions","contracts","bookings","notifications","agency_plans"];
for (const t of tables) {
  await run(`RLS on ${t}`, `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  await run(`policy ${t} service role`, `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename='${t}' AND policyname='Service role full access on ${t}'
      ) THEN
        CREATE POLICY "Service role full access on ${t}" ON ${t} FOR ALL USING (true) WITH CHECK (true);
      END IF;
    END $$
  `);
}

// Notifications user policies
await run("policy notifications select", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='Users can read own notifications') THEN
      CREATE POLICY "Users can read own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
    END IF;
  END $$
`);
await run("policy notifications update", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='Users can update own notifications') THEN
      CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
    END IF;
  END $$
`);

// Storage policies
await run("storage policy read", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Anyone can read talent-media') THEN
      CREATE POLICY "Anyone can read talent-media" ON storage.objects FOR SELECT USING (bucket_id = 'talent-media');
    END IF;
  END $$
`);
await run("storage policy insert", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Authenticated users can upload to talent-media') THEN
      CREATE POLICY "Authenticated users can upload to talent-media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'talent-media' AND auth.role() = 'authenticated');
    END IF;
  END $$
`);
await run("storage policy update", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Authenticated users can update talent-media') THEN
      CREATE POLICY "Authenticated users can update talent-media" ON storage.objects FOR UPDATE USING (bucket_id = 'talent-media' AND auth.role() = 'authenticated');
    END IF;
  END $$
`);

await run("reload schema cache", `NOTIFY pgrst, 'reload schema'`);

// Final column check
console.log("\n=== Final schema ===");
const cols = await query(`
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position
`);
const byTable = {};
for (const {table_name, column_name} of cols) {
  if (!byTable[table_name]) byTable[table_name] = [];
  byTable[table_name].push(column_name);
}
for (const [t, c] of Object.entries(byTable)) {
  console.log(`  ${t}: ${c.join(", ")}`);
}
