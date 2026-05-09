-- Milestone 6B seed data for the financial schema.
-- These rows mirror the current mock/localStorage demo entities only at the
-- dealer, placeholder employee, and assignment level.

with dealer_seed (id, dealer_name, store_name, platform, dealer_share_percentage, company_share_percentage, currency, status) as (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'World of Wedding Co.', 'World of Wedding Co.', null::text, 25.000, 75.000, 'USD', 'active'::public.dealer_status),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'Venture Invitations', 'Venture Invitations', null::text, 25.000, 75.000, 'USD', 'active'::public.dealer_status),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'Nueva Invitations', 'Nueva Invitations', null::text, 25.000, 75.000, 'USD', 'active'::public.dealer_status),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'Emirates and Weddings', 'Emirates and Weddings', null::text, 25.000, 75.000, 'USD', 'active'::public.dealer_status),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'Astra Invitations', 'Astra Invitations', null::text, 25.000, 75.000, 'USD', 'active'::public.dealer_status),
    ('00000000-0000-4000-8000-000000000006'::uuid, 'LA Invitations', 'LA Invitations', null::text, 25.000, 75.000, 'USD', 'active'::public.dealer_status),
    ('00000000-0000-4000-8000-000000000007'::uuid, 'Invitations Club', 'Invitations Club', null::text, 25.000, 75.000, 'USD', 'active'::public.dealer_status)
)
insert into public.dealers (
  id,
  dealer_name,
  store_name,
  platform,
  dealer_share_percentage,
  company_share_percentage,
  currency,
  status
)
select
  id,
  dealer_name,
  store_name,
  platform,
  dealer_share_percentage,
  company_share_percentage,
  currency,
  status
from dealer_seed
on conflict (id) do update
set
  dealer_name = excluded.dealer_name,
  store_name = excluded.store_name,
  platform = excluded.platform,
  dealer_share_percentage = excluded.dealer_share_percentage,
  company_share_percentage = excluded.company_share_percentage,
  currency = excluded.currency,
  status = excluded.status;

insert into public.employees (id, name, email, status)
values (
  '00000000-0000-4000-8000-000000000101'::uuid,
  'Graphic Designer',
  null,
  'active'
)
on conflict (id) do update
set
  name = excluded.name,
  email = excluded.email,
  status = excluded.status;

with assignment_seed (id, employee_id, dealer_id, commission_rate) as (
  values
    (
      '00000000-0000-4000-8000-000000000201'::uuid,
      '00000000-0000-4000-8000-000000000101'::uuid,
      '00000000-0000-4000-8000-000000000001'::uuid,
      2.000
    ),
    (
      '00000000-0000-4000-8000-000000000202'::uuid,
      '00000000-0000-4000-8000-000000000101'::uuid,
      '00000000-0000-4000-8000-000000000002'::uuid,
      1.500
    ),
    (
      '00000000-0000-4000-8000-000000000203'::uuid,
      '00000000-0000-4000-8000-000000000101'::uuid,
      '00000000-0000-4000-8000-000000000003'::uuid,
      3.000
    )
)
insert into public.employee_store_assignments (
  id,
  employee_id,
  dealer_id,
  commission_rate,
  can_view_transactions,
  can_add_transactions,
  can_edit_transactions,
  can_view_commission,
  status
)
select
  id,
  employee_id,
  dealer_id,
  commission_rate,
  true,
  true,
  false,
  true,
  'active'::public.assignment_status
from assignment_seed
on conflict (employee_id, dealer_id) do update
set
  commission_rate = excluded.commission_rate,
  can_view_transactions = excluded.can_view_transactions,
  can_add_transactions = excluded.can_add_transactions,
  can_edit_transactions = excluded.can_edit_transactions,
  can_view_commission = excluded.can_view_commission,
  status = excluded.status;
