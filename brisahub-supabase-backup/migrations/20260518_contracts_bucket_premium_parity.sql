-- =============================================================================
-- Contracts storage parity for open + Premium workspace flows
-- - aligns bucket limit with API validation (20MB)
-- - allows authenticated agencies to upload original PDFs for open jobs
-- - allows Premium owners to upload for any workspace job
-- - allows Premium agents to upload only for jobs they created
-- - allows talents to upload signed PDFs only for their own contracts
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contracts',
  'contracts',
  false,
  20971520,
  array['application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ─── 1. Ensure talent_user_id column exists and is backfilled ─────────────────

alter table public.contracts
  add column if not exists talent_user_id uuid;

-- Backfill from talent_id (legacy uuid column) where present
do $$ begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'contracts'
      and column_name  = 'talent_id'
  ) then
    update public.contracts
    set    talent_user_id = talent_id::uuid
    where  talent_user_id is null
      and  talent_id is not null;
  end if;
end $$;

-- ─── 2. Storage policy: agency uploads original contract PDF ─────────────────

do $$ begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'contracts_bucket_authenticated_insert_original'
  ) then
    create policy contracts_bucket_authenticated_insert_original
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'contracts'
        and (
          -- Legacy path: contracts/<agency_uid>/<job_id>/...
          (
            array_length(storage.foldername(name), 1) >= 3
            and (storage.foldername(name))[1] = 'contracts'
            and (storage.foldername(name))[2] = auth.uid()::text
            and exists (
              select 1
              from public.jobs j
              where j.id::text = (storage.foldername(name))[3]
                and j.agency_id = auth.uid()
                and j.workspace_id is null
            )
          )
          or
          -- Open-job path: contracts/open/<agency_uid>/jobs/<job_id>/...
          (
            array_length(storage.foldername(name), 1) >= 5
            and (storage.foldername(name))[1] = 'contracts'
            and (storage.foldername(name))[2] = 'open'
            and (storage.foldername(name))[3] = auth.uid()::text
            and (storage.foldername(name))[4] = 'jobs'
            and exists (
              select 1
              from public.jobs j
              where j.id::text = (storage.foldername(name))[5]
                and j.agency_id = auth.uid()
                and j.workspace_id is null
            )
          )
          or
          -- Premium workspace path: contracts/workspaces/<ws_id>/jobs/<job_id>/agency/<user_id>/...
          (
            array_length(storage.foldername(name), 1) >= 7
            and (storage.foldername(name))[1] = 'contracts'
            and (storage.foldername(name))[2] = 'workspaces'
            and (storage.foldername(name))[4] = 'jobs'
            and (storage.foldername(name))[6] = 'agency'
            and (storage.foldername(name))[7] = auth.uid()::text
            and exists (
              select 1
              from public.jobs j
              join public.premium_workspace_members pwm
                on pwm.workspace_id = j.workspace_id
               and pwm.user_id      = auth.uid()
               and pwm.status       = 'active'
              where j.id::text           = (storage.foldername(name))[5]
                and j.workspace_id::text = (storage.foldername(name))[3]
                and (
                  pwm.role = 'owner'
                  or j.created_by_user_id = auth.uid()
                )
            )
          )
        )
      );
  end if;
end $$;

-- ─── 3. Storage policy: talent uploads signed contract PDF ────────────────────

do $$ begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'contracts_bucket_authenticated_insert_signed'
  ) then
    create policy contracts_bucket_authenticated_insert_signed
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'contracts'
        and array_length(storage.foldername(name), 1) >= 4
        and (storage.foldername(name))[1] = 'contracts'
        and (storage.foldername(name))[2] = 'signed'
        and (storage.foldername(name))[3] = auth.uid()::text
        and exists (
          select 1
          from public.contracts c
          where c.id::text       = (storage.foldername(name))[4]
            and c.talent_user_id = auth.uid()
        )
      );
  end if;
end $$;
