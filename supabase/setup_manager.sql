-- Run only after the account has registered in PrintShop AI.
-- Replace the placeholder with the exact email address of the shop owner.
update public.users
set role = 'manager'
where lower(email) = lower('REPLACE_WITH_OWNER_EMAIL');

-- Confirm that exactly the intended account has the manager role.
select id, email, role
from public.users
where lower(email) = lower('REPLACE_WITH_OWNER_EMAIL');
