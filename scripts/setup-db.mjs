import pg from "pg";
import dns from "dns";
import { promisify } from "util";
const { Client } = pg;
const resolve4 = promisify(dns.resolve4);

// Force IPv4 to avoid ETIMEDOUT on IPv6
const [ipv4] = await resolve4("db.lhzhebjzfsrnmmouvmry.supabase.co");
console.log("Resolved to IPv4:", ipv4);

const client = new Client({
  host: ipv4,
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: "Vx3c42rw44.",
  ssl: { rejectUnauthorized: false },
});

const SQL = `
create extension if not exists "uuid-ossp";

create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text check (role in ('agency', 'talent', 'admin')),
  created_at timestamptz default now()
);
alter table profiles enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='Users can read own profile') then
    create policy "Users can read own profile" on profiles for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='Service role full access on profiles') then
    create policy "Service role full access on profiles" on profiles for all using (true) with check (true);
  end if;
end $$;

create table if not exists agencies (
  id                  uuid primary key references auth.users(id) on delete cascade,
  company_name        text,
  contact_name        text,
  phone               text,
  country             text,
  city                text,
  description         text,
  website             text,
  avatar_url          text,
  address             text,
  subscription_status text not null default 'active' check (subscription_status in ('active','inactive')),
  deleted_at          timestamptz,
  created_at          timestamptz default now()
);
alter table agencies enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='agencies' and policyname='Service role full access on agencies') then
    create policy "Service role full access on agencies" on agencies for all using (true) with check (true);
  end if;
end $$;

create table if not exists talent_profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  full_name       text,
  phone           text,
  country         text,
  city            text,
  bio             text,
  categories      text[],
  instagram       text,
  tiktok          text,
  youtube         text,
  x_handle        text,
  website         text,
  imdb            text,
  avatar_url      text,
  age             int,
  gender          text,
  photo_front_url text,
  photo_left_url  text,
  photo_right_url text,
  username        text unique,
  deleted_at      timestamptz,
  created_at      timestamptz default now()
);
alter table talent_profiles enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='talent_profiles' and policyname='Service role full access on talent_profiles') then
    create policy "Service role full access on talent_profiles" on talent_profiles for all using (true) with check (true);
  end if;
end $$;

create table if not exists jobs (
  id                         uuid primary key default uuid_generate_v4(),
  agency_id                  uuid references auth.users(id) on delete cascade,
  title                      text not null,
  description                text,
  category                   text,
  budget                     numeric,
  deadline                   date,
  location                   text,
  gender                     text,
  age_min                    int,
  age_max                    int,
  number_of_talents_required int default 1,
  status                     text not null default 'open' check (status in ('open','closed','draft')),
  job_date                   date,
  deleted_at                 timestamptz,
  created_at                 timestamptz default now()
);
alter table jobs enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='jobs' and policyname='Service role full access on jobs') then
    create policy "Service role full access on jobs" on jobs for all using (true) with check (true);
  end if;
end $$;

create table if not exists submissions (
  id              uuid primary key default uuid_generate_v4(),
  job_id          uuid references jobs(id) on delete cascade,
  talent_user_id  uuid references auth.users(id) on delete cascade,
  talent_name     text,
  email           text,
  bio             text,
  referrer_id     uuid references auth.users(id) on delete set null,
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  mode            text,
  photo_front_url text,
  photo_left_url  text,
  photo_right_url text,
  video_url       text,
  created_at      timestamptz default now()
);
alter table submissions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='submissions' and policyname='Service role full access on submissions') then
    create policy "Service role full access on submissions" on submissions for all using (true) with check (true);
  end if;
end $$;

create table if not exists contracts (
  id               uuid primary key default uuid_generate_v4(),
  job_id           uuid references jobs(id) on delete set null,
  talent_id        uuid references auth.users(id) on delete set null,
  agency_id        uuid references auth.users(id) on delete set null,
  job_date         date,
  job_time         time,
  location         text,
  job_description  text,
  payment_amount   numeric,
  payment_method   text,
  additional_notes text,
  status           text not null default 'sent' check (status in ('sent','signed','rejected','confirmed','deposit_paid','paid','cancelled','withdrawn')),
  signed_at        timestamptz,
  agency_signed_at timestamptz,
  deposit_paid_at  timestamptz,
  paid_at          timestamptz,
  withdrawn_at     timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz default now()
);
alter table contracts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='contracts' and policyname='Service role full access on contracts') then
    create policy "Service role full access on contracts" on contracts for all using (true) with check (true);
  end if;
end $$;

create table if not exists bookings (
  id             uuid primary key default uuid_generate_v4(),
  job_id         uuid references jobs(id) on delete set null,
  agency_id      uuid references auth.users(id) on delete set null,
  talent_user_id uuid references auth.users(id) on delete set null,
  job_title      text,
  price          numeric,
  status         text not null default 'pending' check (status in ('pending','pending_payment','paid','cancelled')),
  deleted_at     timestamptz,
  created_at     timestamptz default now()
);
alter table bookings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='bookings' and policyname='Service role full access on bookings') then
    create policy "Service role full access on bookings" on bookings for all using (true) with check (true);
  end if;
end $$;

create table if not exists notifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade,
  type       text,
  message    text,
  link       text,
  is_read    boolean default false,
  created_at timestamptz default now()
);
alter table notifications enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='notifications' and policyname='Users can read own notifications') then
    create policy "Users can read own notifications" on notifications for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='notifications' and policyname='Users can update own notifications') then
    create policy "Users can update own notifications" on notifications for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='notifications' and policyname='Service role full access on notifications') then
    create policy "Service role full access on notifications" on notifications for all using (true) with check (true);
  end if;
end $$;

create table if not exists agency_plans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan       text not null default 'pro' check (plan in ('pro','basic')),
  created_at timestamptz default now()
);
alter table agency_plans enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='agency_plans' and policyname='Service role full access on agency_plans') then
    create policy "Service role full access on agency_plans" on agency_plans for all using (true) with check (true);
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('talent-media', 'talent-media', true)
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='objects' and policyname='Anyone can read talent-media') then
    create policy "Anyone can read talent-media" on storage.objects for select using (bucket_id = 'talent-media');
  end if;
  if not exists (select 1 from pg_policies where tablename='objects' and policyname='Authenticated users can upload to talent-media') then
    create policy "Authenticated users can upload to talent-media" on storage.objects for insert with check (bucket_id = 'talent-media' and auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='objects' and policyname='Authenticated users can update talent-media') then
    create policy "Authenticated users can update talent-media" on storage.objects for update using (bucket_id = 'talent-media' and auth.role() = 'authenticated');
  end if;
end $$;

notify pgrst, 'reload schema';
`;

async function main() {
  console.log("Connecting...");
  await client.connect();
  console.log("Connected.\n");

  const steps = SQL.split(/;\s*\n+/).map(s => s.trim()).filter(Boolean);
  let ok = 0, fail = 0;

  for (const stmt of steps) {
    const label = stmt.replace(/\s+/g, " ").slice(0, 70);
    try {
      await client.query(stmt);
      console.log(`  ✓ ${label}`);
      ok++;
    } catch (e) {
      console.error(`  ✗ ${label}`);
      console.error(`    → ${e.message}`);
      fail++;
    }
  }

  await client.end();
  console.log(`\nDone — ${ok} ok, ${fail} failed.`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
