-- Support conversation archive.
-- Archived conversations are closed conversations the admin has moved to storage.
-- archived_at IS NOT NULL means archived. No new status value — archive state is separate.

alter table support_conversations
  add column if not exists archived_at  timestamptz,
  add column if not exists archived_by  uuid;

create index if not exists support_conversations_archived_at_idx
  on support_conversations (archived_at)
  where archived_at is not null;
