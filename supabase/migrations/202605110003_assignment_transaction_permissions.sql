alter table public.employee_store_assignments
  add column if not exists transaction_approval_mode text not null default 'pending_review',
  add column if not exists can_delete_transactions boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employee_store_assignments_transaction_approval_mode_valid'
      and conrelid = 'public.employee_store_assignments'::regclass
  ) then
    alter table public.employee_store_assignments
      add constraint employee_store_assignments_transaction_approval_mode_valid
      check (transaction_approval_mode in ('pending_review', 'confirmed'));
  end if;
end $$;

create or replace function public.can_employee_create_confirmed_transaction(check_dealer_id uuid)
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
      and esa.can_add_transactions = true
      and esa.transaction_approval_mode = 'confirmed'
      and e.status = 'active'
      and d.status = 'active'
  );
$$;

create or replace function public.can_employee_edit_transaction(check_dealer_id uuid)
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
      and esa.can_edit_transactions = true
      and e.status = 'active'
      and d.status = 'active'
  );
$$;

create or replace function public.can_employee_delete_transaction(check_dealer_id uuid)
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
      and esa.can_delete_transactions = true
      and e.status = 'active'
      and d.status = 'active'
  );
$$;

drop policy if exists "Employees can insert pending transactions for assigned dealers" on public.transactions;
drop policy if exists "Employees can insert transactions for assigned dealers" on public.transactions;
create policy "Employees can insert transactions for assigned dealers"
on public.transactions
for insert
to authenticated
with check (
  public.can_employee_add_transaction(dealer_id)
  and created_by = auth.uid()
  and created_by_role = 'employee'
  and (
    status = 'pending_review'
    or (status = 'confirmed' and public.can_employee_create_confirmed_transaction(dealer_id))
  )
);

drop policy if exists "Employees can update own transactions for editable dealers" on public.transactions;
create policy "Employees can update own transactions for editable dealers"
on public.transactions
for update
to authenticated
using (
  created_by = auth.uid()
  and public.can_employee_edit_transaction(dealer_id)
)
with check (
  created_by = auth.uid()
  and public.can_employee_edit_transaction(dealer_id)
  and (
    status = 'pending_review'
    or (status = 'confirmed' and public.can_employee_create_confirmed_transaction(dealer_id))
  )
);

drop policy if exists "Employees can delete own transactions for deletable dealers" on public.transactions;
create policy "Employees can delete own transactions for deletable dealers"
on public.transactions
for delete
to authenticated
using (
  created_by = auth.uid()
  and public.can_employee_delete_transaction(dealer_id)
);
