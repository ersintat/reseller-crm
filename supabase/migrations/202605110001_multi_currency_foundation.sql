-- Milestone MC-1: multi-currency storage foundation.
-- USD remains the reporting/base currency. Existing amount fields remain USD
-- equivalents for backward compatibility while original currency fields are
-- introduced for future UI milestones.

alter table public.transactions
  add column if not exists original_amount numeric(14,2),
  add column if not exists original_currency text not null default 'USD',
  add column if not exists exchange_rate_to_usd numeric(18,8) not null default 1,
  add column if not exists usd_amount numeric(14,2);

update public.transactions
set
  original_amount = coalesce(original_amount, amount),
  original_currency = coalesce(nullif(original_currency, ''), nullif(currency, ''), 'USD'),
  exchange_rate_to_usd = coalesce(exchange_rate_to_usd, 1),
  usd_amount = coalesce(usd_amount, amount);

alter table public.dealer_payments
  add column if not exists original_amount numeric(14,2),
  add column if not exists original_currency text not null default 'USD',
  add column if not exists exchange_rate_to_usd numeric(18,8) not null default 1,
  add column if not exists usd_amount numeric(14,2);

update public.dealer_payments
set
  original_amount = coalesce(original_amount, amount),
  original_currency = coalesce(nullif(original_currency, ''), nullif(currency, ''), 'USD'),
  exchange_rate_to_usd = coalesce(exchange_rate_to_usd, 1),
  usd_amount = coalesce(usd_amount, amount);

alter table public.dealer_payment_allocations
  add column if not exists allocated_usd_amount numeric(14,2);

update public.dealer_payment_allocations
set allocated_usd_amount = coalesce(allocated_usd_amount, allocated_amount);

alter table public.employee_payments
  add column if not exists original_amount numeric(14,2),
  add column if not exists original_currency text not null default 'TRY',
  add column if not exists exchange_rate_to_usd numeric(18,8) not null default 1,
  add column if not exists usd_amount numeric(14,2);

update public.employee_payments
set
  original_amount = coalesce(original_amount, amount),
  original_currency = coalesce(nullif(original_currency, ''), nullif(currency, ''), 'TRY'),
  exchange_rate_to_usd = coalesce(exchange_rate_to_usd, 1),
  usd_amount = coalesce(usd_amount, amount);

alter table public.employee_payment_allocations
  add column if not exists allocated_usd_amount numeric(14,2);

update public.employee_payment_allocations
set allocated_usd_amount = coalesce(allocated_usd_amount, allocated_amount);

alter table public.employee_commissions
  add column if not exists currency text not null default 'USD';

update public.employee_commissions
set currency = coalesce(nullif(currency, ''), 'USD');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_exchange_rate_positive'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_exchange_rate_positive check (exchange_rate_to_usd > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'dealer_payments_exchange_rate_positive'
      and conrelid = 'public.dealer_payments'::regclass
  ) then
    alter table public.dealer_payments
      add constraint dealer_payments_exchange_rate_positive check (exchange_rate_to_usd > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'employee_payments_exchange_rate_positive'
      and conrelid = 'public.employee_payments'::regclass
  ) then
    alter table public.employee_payments
      add constraint employee_payments_exchange_rate_positive check (exchange_rate_to_usd > 0);
  end if;
end;
$$;
