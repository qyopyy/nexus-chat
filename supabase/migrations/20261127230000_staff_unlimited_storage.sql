-- Unlimited storage for staff and VIP.
-- Nexus Drive already has no total cap for anyone (vault_limit = 100 TiB sentinel). The cap that bites is Acetate's
-- free quota, which every Acetate check skips for "premium" accounts through this one function. Accounts whose site
-- role is VIP, Moderator, Admin or Owner now count as premium for storage, so no Acetate limit applies to them.
-- Paid Acetate premium works exactly as before. Role changes take effect immediately (no cache).

create or replace function public.acetate_premium_active(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.acetate_entitlements e
    where e.user_id = p_user
      and e.tier = 'premium'
      and (
        e.lifetime
        or e.expires_at is null
        or e.expires_at > now()
      )
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = p_user
      and p.site_role in ('vip', 'moderator', 'admin', 'owner')
  );
$$;
