alter table public.employee_commissions
  drop constraint if exists employee_commissions_non_negative_amounts;

alter table public.employee_commissions
  add constraint employee_commissions_non_negative_amounts check (
    printing_costs >= 0
    and shipping_costs >= 0
    and commission_base >= 0
    and commission_amount >= 0
    and paid_amount >= 0
    and remaining_amount >= 0
  );
