update public.talent_profiles tp
set marketplace_visible = false
from public.premium_workspace_talents pwt
where pwt.status = 'active'
  and pwt.removed_at is null
  and (
    pwt.talent_user_id = tp.user_id
    or pwt.talent_user_id = tp.id
  )
  and coalesce(tp.marketplace_visible, true) = true;
