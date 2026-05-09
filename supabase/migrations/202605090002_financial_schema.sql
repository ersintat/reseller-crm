-- Milestone 6B: financial schema, helper functions, and RLS foundation.
-- This migration intentionally does not connect the React app to Supabase data.
-- Authoritative recalculation RPCs/triggers are deferred to later milestones.

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'dealer_status') then
    create type public.dealer_status as enum ('active', 'review', 'inactive');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'employee_status') then
    create type public.employee_status as enum ('active', 'inactive');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'statement_status') then
    create type public.statement_status as enum ('draft', 'ready_to_close', 'open', 'partially_paid', 'carried_forward', 'closed');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'transaction_type') then
    create type public.transaction_type as enum ('bank_payout', 'store_expense', 'printing_cost', 'shipping_cost', 'manual_adjustment');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'transaction_status') then
    create type public.transaction_status as enum ('confirmed', 'pending_review', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'adjustment_scope') then
    create type public.adjustment_scope as enum ('dealer_receivable_only', 'shareable_net', 'employee_commission_base');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'adjustment_direction') then
    create type public.adjustment_direction as enum ('increase', 'decrease');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'payment_allocation_mode') then
    create type public.payment_allocation_mode as enum ('fifo', 'manual');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'commission_status') then
    create type public.commission_status as enum ('open', 'partially_paid', 'paid', 'closed');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'assignment_status') then
    create type public.assignment_status as enum ('active', 'inactive');
  end if;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.dealers (
  id uuid primary key default gen_random_uuid(),
  dealer_name text not null,
  store_name text not null,
  platform text,
  dealer_share_percentage numeric(6,3) not null,
  company_share_percentage numeric(6,3) not null,
  currency text not null default 'USD',
  status public.dealer_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealers_share_percentages_range check (
    dealer_share_percentage between 0 and 100
    and company_share_percentage between 0 and 100
  ),
  constraint dealers_share_percentages_total check (
    dealer_share_percentage + company_share_percentage = 100
  )
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  user_id uuid references auth.users(id) on delete set null,
  status public.employee_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employee_store_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  commission_rate numeric(6,3) not null,
  can_view_transactions boolean not null default true,
  can_add_transactions boolean not null default true,
  can_edit_transactions boolean not null default false,
  can_view_commission boolean not null default true,
  status public.assignment_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_store_assignments_unique_pair unique (employee_id, dealer_id),
  constraint employee_store_assignments_commission_rate_range check (commission_rate between 0 and 100)
);

create table public.statements (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  period_month int not null,
  period_year int not null,
  status public.statement_status not null default 'draft',
  total_bank_payouts numeric(14,2) not null default 0,
  total_store_expenses numeric(14,2) not null default 0,
  shareable_net_amount numeric(14,2) not null default 0,
  dealer_share_amount numeric(14,2) not null default 0,
  company_share_amount numeric(14,2) not null default 0,
  total_printing_costs numeric(14,2) not null default 0,
  total_shipping_costs numeric(14,2) not null default 0,
  dealer_receivable_adjustment numeric(14,2) not null default 0,
  employee_commission_base_adjustment numeric(14,2) not null default 0,
  dealer_receivable_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  remaining_amount numeric(14,2) not null default 0,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint statements_unique_dealer_period unique (dealer_id, period_month, period_year),
  constraint statements_unique_id_dealer unique (id, dealer_id),
  constraint statements_period_month_range check (period_month between 1 and 12),
  constraint statements_non_negative_amounts check (
    total_bank_payouts >= 0
    and total_store_expenses >= 0
    and shareable_net_amount >= 0
    and dealer_share_amount >= 0
    and company_share_amount >= 0
    and total_printing_costs >= 0
    and total_shipping_costs >= 0
    and dealer_receivable_amount >= 0
    and paid_amount >= 0
    and remaining_amount >= 0
  )
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  statement_id uuid not null references public.statements(id) on delete cascade,
  type public.transaction_type not null,
  amount numeric(14,2) not null,
  currency text not null default 'USD',
  date date not null,
  order_code text,
  description text,
  adjustment_scope public.adjustment_scope,
  adjustment_direction public.adjustment_direction,
  created_by uuid references auth.users(id) on delete set null,
  created_by_role public.user_role,
  status public.transaction_status not null default 'pending_review',
  attachment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_statement_dealer_fk foreign key (statement_id, dealer_id)
    references public.statements(id, dealer_id) on delete cascade,
  constraint transactions_positive_amount check (amount > 0),
  constraint transactions_manual_adjustment_fields check (
    (
      type = 'manual_adjustment'
      and adjustment_scope is not null
      and adjustment_direction is not null
    )
    or (
      type <> 'manual_adjustment'
      and adjustment_scope is null
      and adjustment_direction is null
    )
  )
);

create table public.dealer_payments (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  amount numeric(14,2) not null,
  currency text not null default 'USD',
  payment_date date not null,
  description text,
  allocation_mode public.payment_allocation_mode not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_payments_positive_amount check (amount > 0)
);

create table public.dealer_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.dealer_payments(id) on delete cascade,
  statement_id uuid not null references public.statements(id) on delete cascade,
  allocated_amount numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint dealer_payment_allocations_positive_amount check (allocated_amount > 0),
  constraint dealer_payment_allocations_unique_pair unique (payment_id, statement_id)
);

create table public.employee_commissions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  statement_id uuid not null references public.statements(id) on delete cascade,
  period_month int not null,
  period_year int not null,
  company_share_amount numeric(14,2) not null default 0,
  printing_costs numeric(14,2) not null default 0,
  shipping_costs numeric(14,2) not null default 0,
  commission_base_adjustments numeric(14,2) not null default 0,
  commission_base numeric(14,2) not null default 0,
  commission_rate numeric(6,3) not null,
  commission_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  remaining_amount numeric(14,2) not null default 0,
  status public.commission_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_commissions_unique_employee_statement unique (employee_id, statement_id),
  constraint employee_commissions_statement_dealer_fk foreign key (statement_id, dealer_id)
    references public.statements(id, dealer_id) on delete cascade,
  constraint employee_commissions_period_month_range check (period_month between 1 and 12),
  constraint employee_commissions_rate_range check (commission_rate between 0 and 100),
  constraint employee_commissions_non_negative_amounts check (
    company_share_amount >= 0
    and printing_costs >= 0
    and shipping_costs >= 0
    and commission_base >= 0
    and commission_amount >= 0
    and paid_amount >= 0
    and remaining_amount >= 0
  )
);

create table public.employee_payments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  amount numeric(14,2) not null,
  currency text not null default 'USD',
  payment_date date not null,
  description text,
  allocation_mode public.payment_allocation_mode not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_payments_positive_amount check (amount > 0)
);

create table public.employee_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.employee_payments(id) on delete cascade,
  commission_id uuid not null references public.employee_commissions(id) on delete cascade,
  allocated_amount numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint employee_payment_allocations_positive_amount check (allocated_amount > 0),
  constraint employee_payment_allocations_unique_pair unique (payment_id, commission_id)
);

create trigger dealers_set_updated_at
before update on public.dealers
for each row execute function public.set_updated_at();

create trigger employees_set_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

create trigger employee_store_assignments_set_updated_at
before update on public.employee_store_assignments
for each row execute function public.set_updated_at();

create trigger statements_set_updated_at
before update on public.statements
for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create trigger dealer_payments_set_updated_at
before update on public.dealer_payments
for each row execute function public.set_updated_at();

create trigger employee_commissions_set_updated_at
before update on public.employee_commissions
for each row execute function public.set_updated_at();

create trigger employee_payments_set_updated_at
before update on public.employee_payments
for each row execute function public.set_updated_at();

create index dealers_status_idx on public.dealers(status);
create index employees_user_id_idx on public.employees(user_id);
create index employees_status_idx on public.employees(status);
create index employee_store_assignments_employee_id_idx on public.employee_store_assignments(employee_id);
create index employee_store_assignments_dealer_id_idx on public.employee_store_assignments(dealer_id);
create index employee_store_assignments_status_idx on public.employee_store_assignments(status);
create index statements_dealer_period_idx on public.statements(dealer_id, period_year, period_month);
create index statements_status_idx on public.statements(status);
create index transactions_statement_id_idx on public.transactions(statement_id);
create index transactions_dealer_status_idx on public.transactions(dealer_id, status);
create index transactions_created_by_idx on public.transactions(created_by);
create index dealer_payments_dealer_id_idx on public.dealer_payments(dealer_id);
create index dealer_payment_allocations_payment_id_idx on public.dealer_payment_allocations(payment_id);
create index dealer_payment_allocations_statement_id_idx on public.dealer_payment_allocations(statement_id);
create index employee_commissions_employee_id_idx on public.employee_commissions(employee_id);
create index employee_commissions_dealer_id_idx on public.employee_commissions(dealer_id);
create index employee_commissions_statement_id_idx on public.employee_commissions(statement_id);
create index employee_commissions_status_idx on public.employee_commissions(status);
create index employee_payments_employee_id_idx on public.employee_payments(employee_id);
create index employee_payment_allocations_payment_id_idx on public.employee_payment_allocations(payment_id);
create index employee_payment_allocations_commission_id_idx on public.employee_payment_allocations(commission_id);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_role(auth.uid(), 'admin');
$$;

create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id
  from public.employees e
  where e.user_id = auth.uid()
    and e.status = 'active'
    and public.has_role(auth.uid(), 'employee')
  order by e.created_at asc
  limit 1;
$$;

create or replace function public.is_assigned_to_dealer(check_dealer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.employee_store_assignments esa
    join public.employees e on e.id = esa.employee_id
    join public.dealers d on d.id = esa.dealer_id
    where esa.dealer_id = check_dealer_id
      and esa.employee_id = public.current_employee_id()
      and esa.status = 'active'
      and e.status = 'active'
      and d.status = 'active'
  );
$$;

create or replace function public.can_employee_view_dealer(check_dealer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.employee_store_assignments esa
    join public.employees e on e.id = esa.employee_id
    join public.dealers d on d.id = esa.dealer_id
    where esa.dealer_id = check_dealer_id
      and esa.employee_id = public.current_employee_id()
      and esa.status = 'active'
      and esa.can_view_transactions = true
      and e.status = 'active'
      and d.status = 'active'
  );
$$;

create or replace function public.can_employee_add_transaction(check_dealer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.employee_store_assignments esa
    join public.employees e on e.id = esa.employee_id
    join public.dealers d on d.id = esa.dealer_id
    where esa.dealer_id = check_dealer_id
      and esa.employee_id = public.current_employee_id()
      and esa.status = 'active'
      and esa.can_add_transactions = true
      and e.status = 'active'
      and d.status = 'active'
  );
$$;

create or replace function public.can_employee_view_commission(check_dealer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.employee_store_assignments esa
    join public.employees e on e.id = esa.employee_id
    join public.dealers d on d.id = esa.dealer_id
    where esa.dealer_id = check_dealer_id
      and esa.employee_id = public.current_employee_id()
      and esa.status = 'active'
      and esa.can_view_commission = true
      and e.status = 'active'
      and d.status = 'active'
  );
$$;

alter table public.dealers enable row level security;
alter table public.employees enable row level security;
alter table public.employee_store_assignments enable row level security;
alter table public.statements enable row level security;
alter table public.transactions enable row level security;
alter table public.dealer_payments enable row level security;
alter table public.dealer_payment_allocations enable row level security;
alter table public.employee_commissions enable row level security;
alter table public.employee_payments enable row level security;
alter table public.employee_payment_allocations enable row level security;

create policy "Admins can manage dealers"
on public.dealers
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Employees can select assigned dealers"
on public.dealers
for select
to authenticated
using (public.is_assigned_to_dealer(id));

create policy "Admins can manage employees"
on public.employees
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Employees can select own employee row"
on public.employees
for select
to authenticated
using (user_id = auth.uid());

create policy "Admins can manage employee store assignments"
on public.employee_store_assignments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Employees can select own active assignments"
on public.employee_store_assignments
for select
to authenticated
using (employee_id = public.current_employee_id() and status = 'active');

create policy "Admins can manage statements"
on public.statements
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Employees can select statements for viewable dealers"
on public.statements
for select
to authenticated
using (public.can_employee_view_dealer(dealer_id));

create policy "Admins can manage transactions"
on public.transactions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Employees can select transactions for viewable dealers"
on public.transactions
for select
to authenticated
using (public.can_employee_view_dealer(dealer_id));

create policy "Employees can insert pending transactions for assigned dealers"
on public.transactions
for insert
to authenticated
with check (
  public.can_employee_add_transaction(dealer_id)
  and created_by = auth.uid()
  and created_by_role = 'employee'
  and status = 'pending_review'
);

create policy "Admins can manage dealer payments"
on public.dealer_payments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage dealer payment allocations"
on public.dealer_payment_allocations
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage employee commissions"
on public.employee_commissions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Employees can select own visible commissions"
on public.employee_commissions
for select
to authenticated
using (
  employee_id = public.current_employee_id()
  and public.can_employee_view_commission(dealer_id)
);

create policy "Admins can manage employee payments"
on public.employee_payments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage employee payment allocations"
on public.employee_payment_allocations
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant usage on type public.dealer_status to authenticated;
grant usage on type public.employee_status to authenticated;
grant usage on type public.statement_status to authenticated;
grant usage on type public.transaction_type to authenticated;
grant usage on type public.transaction_status to authenticated;
grant usage on type public.adjustment_scope to authenticated;
grant usage on type public.adjustment_direction to authenticated;
grant usage on type public.payment_allocation_mode to authenticated;
grant usage on type public.commission_status to authenticated;
grant usage on type public.assignment_status to authenticated;

grant select, insert, update, delete on public.dealers to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant select, insert, update, delete on public.employee_store_assignments to authenticated;
grant select, insert, update, delete on public.statements to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.dealer_payments to authenticated;
grant select, insert, update, delete on public.dealer_payment_allocations to authenticated;
grant select, insert, update, delete on public.employee_commissions to authenticated;
grant select, insert, update, delete on public.employee_payments to authenticated;
grant select, insert, update, delete on public.employee_payment_allocations to authenticated;

-- TODO Milestone 6C/6D:
-- - Add RPCs for transaction approval/rejection and statement recalculation.
-- - Add payment allocation RPCs that lock rows and prevent over-allocation.
-- - Add employee commission generation RPC that preserves paid/partial rows.
-- - Add SQL tests for RLS admin/employee access paths.
