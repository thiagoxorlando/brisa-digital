-- DEV / TEST ONLY
-- Safe orphan cleanup helper for local or staging environments after deleting auth users.
-- Review every SELECT before running the matching DELETE.
-- Do not run blindly in production.

begin;

-- Preview orphan counts ------------------------------------------------------

select 'premium_workspaces' as table_name, count(*) as orphan_count
from public.premium_workspaces pw
where not exists (select 1 from auth.users u where u.id = pw.owner_user_id)
   or not exists (select 1 from public.profiles p where p.id = pw.owner_user_id and p.deleted_at is null);

select 'premium_workspace_members' as table_name, count(*) as orphan_count
from public.premium_workspace_members pwm
where not exists (select 1 from public.premium_workspaces pw where pw.id = pwm.workspace_id)
   or not exists (select 1 from auth.users u where u.id = pwm.user_id)
   or not exists (select 1 from public.profiles p where p.id = pwm.user_id and p.deleted_at is null);

select 'premium_workspace_talents' as table_name, count(*) as orphan_count
from public.premium_workspace_talents pwt
where not exists (select 1 from public.premium_workspaces pw where pw.id = pwt.workspace_id)
   or not exists (select 1 from auth.users u where u.id = pwt.talent_user_id)
   or not exists (select 1 from public.profiles p where p.id = pwt.talent_user_id and p.deleted_at is null);

select 'premium_agent_invites' as table_name, count(*) as orphan_count
from public.premium_agent_invites pai
where not exists (select 1 from public.premium_workspaces pw where pw.id = pai.workspace_id);

select 'premium_agent_wallet_transactions' as table_name, count(*) as orphan_count
from public.premium_agent_wallet_transactions pawt
where not exists (select 1 from public.premium_workspaces pw where pw.id = pawt.workspace_id)
   or not exists (select 1 from auth.users u where u.id = pawt.agent_user_id)
   or not exists (select 1 from public.profiles p where p.id = pawt.agent_user_id and p.deleted_at is null);

select 'agencies' as table_name, count(*) as orphan_count
from public.agencies a
where not exists (select 1 from auth.users u where u.id = coalesce(a.user_id, a.id))
   or not exists (select 1 from public.profiles p where p.id = coalesce(a.user_id, a.id) and p.deleted_at is null);

select 'jobs' as table_name, count(*) as orphan_count
from public.jobs j
where (j.agency_id is not null and not exists (select 1 from public.agencies a where a.id = j.agency_id and a.deleted_at is null))
   or (j.workspace_id is not null and not exists (select 1 from public.premium_workspaces pw where pw.id = j.workspace_id and pw.deleted_at is null));

select 'bookings' as table_name, count(*) as orphan_count
from public.bookings b
where (b.agency_id is not null and not exists (select 1 from public.agencies a where a.id = b.agency_id and a.deleted_at is null))
   or (b.talent_user_id is not null and not exists (select 1 from public.profiles p where p.id = b.talent_user_id and p.deleted_at is null))
   or (b.job_id is not null and not exists (select 1 from public.jobs j where j.id = b.job_id and j.deleted_at is null));

select 'contracts' as table_name, count(*) as orphan_count
from public.contracts c
where (c.agency_id is not null and not exists (select 1 from public.agencies a where a.id = c.agency_id and a.deleted_at is null))
   or (c.talent_id is not null and not exists (select 1 from public.profiles p where p.id = c.talent_id and p.deleted_at is null))
   or (c.job_id is not null and not exists (select 1 from public.jobs j where j.id = c.job_id and j.deleted_at is null));

select 'notifications' as table_name, count(*) as orphan_count
from public.notifications n
where n.user_id is not null
  and (
    not exists (select 1 from auth.users u where u.id = n.user_id)
    or not exists (select 1 from public.profiles p where p.id = n.user_id and p.deleted_at is null)
  );

select 'wallet_transactions' as table_name, count(*) as orphan_count
from public.wallet_transactions wt
where wt.user_id is not null
  and (
    not exists (select 1 from auth.users u where u.id = wt.user_id)
    or not exists (select 1 from public.profiles p where p.id = wt.user_id and p.deleted_at is null)
  );

select 'submissions' as table_name, count(*) as orphan_count
from public.submissions s
where (s.talent_user_id is not null and not exists (select 1 from public.profiles p where p.id = s.talent_user_id and p.deleted_at is null))
   or (s.job_id is not null and not exists (select 1 from public.jobs j where j.id = s.job_id and j.deleted_at is null));

-- Delete orphan rows ---------------------------------------------------------
-- Uncomment the blocks you want to run after reviewing the previews above.

-- delete from public.premium_agent_wallet_transactions pawt
-- where not exists (select 1 from public.premium_workspaces pw where pw.id = pawt.workspace_id)
--    or not exists (select 1 from auth.users u where u.id = pawt.agent_user_id)
--    or not exists (select 1 from public.profiles p where p.id = pawt.agent_user_id and p.deleted_at is null);

-- delete from public.premium_agent_invites pai
-- where not exists (select 1 from public.premium_workspaces pw where pw.id = pai.workspace_id);

-- delete from public.premium_workspace_members pwm
-- where not exists (select 1 from public.premium_workspaces pw where pw.id = pwm.workspace_id)
--    or not exists (select 1 from auth.users u where u.id = pwm.user_id)
--    or not exists (select 1 from public.profiles p where p.id = pwm.user_id and p.deleted_at is null);

-- delete from public.premium_workspace_talents pwt
-- where not exists (select 1 from public.premium_workspaces pw where pw.id = pwt.workspace_id)
--    or not exists (select 1 from auth.users u where u.id = pwt.talent_user_id)
--    or not exists (select 1 from public.profiles p where p.id = pwt.talent_user_id and p.deleted_at is null);

-- delete from public.notifications n
-- where n.user_id is not null
--   and (
--     not exists (select 1 from auth.users u where u.id = n.user_id)
--     or not exists (select 1 from public.profiles p where p.id = n.user_id and p.deleted_at is null)
--   );

-- delete from public.wallet_transactions wt
-- where wt.user_id is not null
--   and (
--     not exists (select 1 from auth.users u where u.id = wt.user_id)
--     or not exists (select 1 from public.profiles p where p.id = wt.user_id and p.deleted_at is null)
--   );

-- delete from public.submissions s
-- where (s.talent_user_id is not null and not exists (select 1 from public.profiles p where p.id = s.talent_user_id and p.deleted_at is null))
--    or (s.job_id is not null and not exists (select 1 from public.jobs j where j.id = s.job_id and j.deleted_at is null));

-- delete from public.contracts c
-- where (c.agency_id is not null and not exists (select 1 from public.agencies a where a.id = c.agency_id and a.deleted_at is null))
--    or (c.talent_id is not null and not exists (select 1 from public.profiles p where p.id = c.talent_id and p.deleted_at is null))
--    or (c.job_id is not null and not exists (select 1 from public.jobs j where j.id = c.job_id and j.deleted_at is null));

-- delete from public.bookings b
-- where (b.agency_id is not null and not exists (select 1 from public.agencies a where a.id = b.agency_id and a.deleted_at is null))
--    or (b.talent_user_id is not null and not exists (select 1 from public.profiles p where p.id = b.talent_user_id and p.deleted_at is null))
--    or (b.job_id is not null and not exists (select 1 from public.jobs j where j.id = b.job_id and j.deleted_at is null));

-- delete from public.jobs j
-- where (j.agency_id is not null and not exists (select 1 from public.agencies a where a.id = j.agency_id and a.deleted_at is null))
--    or (j.workspace_id is not null and not exists (select 1 from public.premium_workspaces pw where pw.id = j.workspace_id and pw.deleted_at is null));

-- delete from public.agencies a
-- where not exists (select 1 from auth.users u where u.id = coalesce(a.user_id, a.id))
--    or not exists (select 1 from public.profiles p where p.id = coalesce(a.user_id, a.id) and p.deleted_at is null);

-- delete from public.premium_workspaces pw
-- where not exists (select 1 from auth.users u where u.id = pw.owner_user_id)
--    or not exists (select 1 from public.profiles p where p.id = pw.owner_user_id and p.deleted_at is null);

rollback;

-- Change the final ROLLBACK to COMMIT only after reviewing the exact rows on a dev/test database.
