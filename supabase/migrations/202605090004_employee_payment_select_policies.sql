drop policy if exists "Employees can select own employee payments" on public.employee_payments;
create policy "Employees can select own employee payments"
on public.employee_payments
for select
to authenticated
using (employee_id = public.current_employee_id());

drop policy if exists "Employees can select own visible employee payment allocations" on public.employee_payment_allocations;
create policy "Employees can select own visible employee payment allocations"
on public.employee_payment_allocations
for select
to authenticated
using (
  exists (
    select 1
    from public.employee_commissions ec
    where ec.id = employee_payment_allocations.commission_id
      and ec.employee_id = public.current_employee_id()
      and public.can_employee_view_commission(ec.dealer_id)
  )
);
