-- Admin audit log table.
-- Records every significant admin action for accountability.
-- The application layer writes here via lib/auditLog.ts (service role).
-- No RLS needed — only the service role writes; reads are admin-only via service role queries.

create table if not exists admin_audit_logs (
  id           uuid        default gen_random_uuid() primary key,
  admin_id     uuid        not null,
  action       text        not null,
  entity_type  text        not null,
  entity_id    text,
  before       jsonb,
  after        jsonb,
  metadata     jsonb,
  created_at   timestamptz default now() not null
);

create index if not exists admin_audit_logs_admin_id_idx   on admin_audit_logs (admin_id);
create index if not exists admin_audit_logs_entity_idx     on admin_audit_logs (entity_type, entity_id);
create index if not exists admin_audit_logs_created_at_idx on admin_audit_logs (created_at desc);
