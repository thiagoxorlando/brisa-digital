alter table if exists public.admin_notification_broadcasts
  add column if not exists archived_at timestamptz null,
  add column if not exists deleted_at timestamptz null;

create index if not exists admin_notification_broadcasts_archived_at_idx
  on public.admin_notification_broadcasts (archived_at);

create index if not exists admin_notification_broadcasts_deleted_at_idx
  on public.admin_notification_broadcasts (deleted_at);
