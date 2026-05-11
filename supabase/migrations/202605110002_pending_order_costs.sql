create table if not exists public.pending_order_costs (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  statement_id uuid references public.statements(id) on delete set null,
  order_code text not null,
  cost_scope text not null,
  estimated_printing_cost numeric(14,2),
  estimated_shipping_cost numeric(14,2),
  final_printing_cost numeric(14,2),
  final_shipping_cost numeric(14,2),
  currency text not null default 'USD',
  exchange_rate_to_usd numeric(18,8) not null default 1,
  note text,
  status text not null default 'pending',
  created_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pending_order_costs_order_code_required check (length(trim(order_code)) > 0),
  constraint pending_order_costs_scope_valid check (cost_scope in ('printing', 'shipping', 'both')),
  constraint pending_order_costs_status_valid check (status in ('pending', 'partially_resolved', 'resolved', 'cancelled')),
  constraint pending_order_costs_estimated_non_negative check (
    (estimated_printing_cost is null or estimated_printing_cost >= 0)
    and (estimated_shipping_cost is null or estimated_shipping_cost >= 0)
  ),
  constraint pending_order_costs_final_non_negative check (
    (final_printing_cost is null or final_printing_cost >= 0)
    and (final_shipping_cost is null or final_shipping_cost >= 0)
  ),
  constraint pending_order_costs_exchange_rate_positive check (exchange_rate_to_usd > 0)
);

drop trigger if exists pending_order_costs_set_updated_at on public.pending_order_costs;
create trigger pending_order_costs_set_updated_at
before update on public.pending_order_costs
for each row execute function public.set_updated_at();

create index if not exists pending_order_costs_dealer_status_idx on public.pending_order_costs(dealer_id, status);
create index if not exists pending_order_costs_statement_id_idx on public.pending_order_costs(statement_id);
create index if not exists pending_order_costs_created_by_idx on public.pending_order_costs(created_by);

alter table public.pending_order_costs enable row level security;

drop policy if exists "Admins can manage pending order costs" on public.pending_order_costs;
create policy "Admins can manage pending order costs"
on public.pending_order_costs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Employees can select pending costs for viewable dealers" on public.pending_order_costs;
create policy "Employees can select pending costs for viewable dealers"
on public.pending_order_costs
for select
to authenticated
using (public.can_employee_view_dealer(dealer_id));

drop policy if exists "Employees can insert pending costs for assigned dealers" on public.pending_order_costs;
create policy "Employees can insert pending costs for assigned dealers"
on public.pending_order_costs
for insert
to authenticated
with check (
  public.can_employee_add_transaction(dealer_id)
  and created_by = auth.uid()
  and status = 'pending'
);

grant select, insert, update, delete on public.pending_order_costs to authenticated;
