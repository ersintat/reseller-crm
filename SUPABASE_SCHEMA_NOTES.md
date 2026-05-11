# Supabase Financial Schema Notes

Milestone 6B adds the financial database foundation only. The React app still uses mock React state and `localStorage` for dealers, statements, transactions, payments, assignments, and commissions.

## Migrations Added

- `supabase/migrations/202605090002_financial_schema.sql`
  - Financial enums for dealers, employees, statements, transactions, adjustments, payments, commissions, and assignments.
  - Domain tables for dealers, employees, employee store assignments, statements, transactions, dealer payments, dealer payment allocations, employee commissions, employee payments, and employee payment allocations.
  - Core integrity constraints for percentages, positive amounts, statement periods, unique dealer periods, unique employee/dealer assignments, and unique payment allocations.
  - Helper functions: `is_admin()`, `current_employee_id()`, `is_assigned_to_dealer(dealer_id)`, `can_employee_view_dealer(dealer_id)`, `can_employee_add_transaction(dealer_id)`, and `can_employee_view_commission(dealer_id)`.
  - RLS enabled on all financial tables with admin management policies and employee read/insert policies scoped by active assignments and permission flags.

- `supabase/migrations/202605090003_financial_seed.sql`
  - Seed dealers for the seven current mock stores.
  - Seed placeholder employee `Graphic Designer`.
  - Seed assignments:
    - Graphic Designer -> World of Wedding Co. at 2%
    - Graphic Designer -> Venture Invitations at 1.5%
    - Graphic Designer -> Nueva Invitations at 3%

- `supabase/migrations/202605090004_employee_payment_select_policies.sql`
  - Adds employee select policies for their own employee payment rows.
  - Adds employee select policies for employee payment allocations tied to their own visible commission rows.

- `supabase/migrations/202605110001_multi_currency_foundation.sql`
  - Adds original-currency storage columns to transactions, dealer payments, and employee payments.
  - Adds USD allocation columns to dealer and employee payment allocation tables.
  - Adds a `currency` clarity column to employee commissions.
  - Backfills existing data so current `amount` values remain USD equivalents.
  - Adds positive exchange-rate constraints for money-moving rows.

- `supabase/migrations/202605110002_pending_order_costs.sql`
  - Adds `public.pending_order_costs` for unresolved printing/shipping cost follow-up.
  - Enables RLS with admin full access and employee select/insert access scoped by active assignment permissions.
  - Pending rows are reminders only and do not affect statement totals.

## Implemented

- Schema and RLS foundation for future Supabase-backed financial data.
- Positive transaction amount storage, with transaction type and adjustment direction left to determine calculation behavior.
- Employee-created transaction policy requiring `pending_review`, `created_by = auth.uid()`, and `created_by_role = 'employee'`.
- Employee access policies that respect active assignments and permission flags.
- Admin full access policies via the existing `has_role(auth.uid(), 'admin')` auth foundation helper.

## Not Implemented Yet

- The UI is not connected to these financial tables.
- Mock/localStorage persistence remains the active data source.
- No statement recalculation triggers or financial formula changes were added.
- No transaction approval/rejection RPCs were added.
- No dealer or employee payment allocation RPCs were added.
- No employee commission generation RPC was added.

## Next Milestone

Milestone 6C added read-only Supabase financial reference data:

1. Dealers, employees, and employee-store assignments can be loaded from Supabase after login.
2. Statement, transaction, dealer payment, employee commission, and employee payment activity still uses local React state and `localStorage`.
3. Reference-data load failures fall back to the local mock reference data with a non-blocking warning.
4. Assignment edits in this phase are local overrides only; they are not written back to Supabase.

Milestone 6D added Supabase-backed statements and transactions in real auth mode:

1. Statements and transactions load from Supabase after login.
2. Admin statement creation writes to Supabase and relies on the database unique constraint to block duplicate dealer/month/year statements.
3. Admin-created transactions are inserted as `confirmed`.
4. Employee-created transactions are inserted as `pending_review`.
5. Admin approval/rejection updates transaction status in Supabase.
6. Dealer payments, payment allocations, employee commissions, employee payments, and employee payment allocations remained local/localStorage-backed in 6D.
7. Statement totals are still calculated in the frontend helper layer. Cached statement total updates are intentionally deferred until an RPC/recalculation milestone.

Milestone 6E added Supabase-backed dealer payments and dealer payment allocations in real auth mode:

1. Dealer payments and dealer payment allocations load from Supabase after login.
2. Admin Record Dealer Payment writes one `dealer_payments` row plus its `dealer_payment_allocations` rows.
3. FIFO and manual allocation logic still runs in the frontend using the existing helpers.
4. Employees cannot create dealer payments because the UI remains admin-only and RLS restricts payment writes to admins.
5. Statement paid and remaining values are still derived in the UI from allocation rows. Cached statement `paid_amount` and `remaining_amount` updates in Supabase are deferred.
6. Employee commissions, employee payments, and employee payment allocations remained local/localStorage-backed in 6E.

Milestone 6F added Supabase-backed employee commissions, employee payments, and employee payment allocations in real auth mode:

1. Employee commissions, employee payments, and employee payment allocations load from Supabase after login.
2. Commission generation still uses the existing frontend helper logic and writes calculated rows with `upsert` on `employee_id + statement_id`.
3. Existing `paid` and `partially_paid` commission rows are not overwritten by regeneration.
4. Admin Record Employee Payment writes one `employee_payments` row plus its `employee_payment_allocations` rows.
5. Employee commission paid/remaining/status cached columns are updated after employee payment allocation. Statement paid/remaining cached columns are still deferred.
6. Assignment edit persistence remained a local override in 6F.
7. Calculation RPCs/triggers remain deferred; the frontend helper layer remains the source for settlement and commission calculations.

Milestone 6G adds Supabase-backed assignment editing in real auth mode:

1. Admin assignment edits write to `employee_store_assignments`.
2. Commission rate, transaction permission flags, commission visibility, and active/inactive status persist after refresh.
3. Demo mode still edits assignment state through localStorage.
4. Rate changes affect future generated commission rows only; paid and partially paid commission rows are not retroactively overwritten.
5. Permission changes immediately affect employee dealer visibility, transaction form access, and My Commissions visibility through the existing assignment-derived UI state.

Milestone MC-1 adds the multi-currency storage foundation:

1. USD remains the app reporting/base currency.
2. Existing `amount` fields remain USD equivalents during the transition.
3. Transactions, dealer payments, and employee payments now store:
   - `original_amount`
   - `original_currency`
   - `exchange_rate_to_usd`
   - `usd_amount`
4. Dealer and employee payment allocations now store `allocated_usd_amount`.
5. Employee commissions include `currency = 'USD'` for clarity.
6. The React service layer maps snake_case currency fields to camelCase fields and prefers `usd_amount` over legacy `amount` when reading Supabase data.
7. The current UI still captures USD amounts. Manual original-currency and exchange-rate entry will be added in a later UI milestone.
8. Calculation helpers use USD values through compatibility helpers and do not double-convert existing data.

Milestone MC-2 adds transaction and dealer payment UI support for multi-currency entry:

1. Transaction forms capture original amount, `USD`/`TRY`/`AUD`, and exchange rate to USD.
2. Dealer payment forms capture original payment amount, payment currency, and exchange rate to USD.
3. USD equivalents are rounded to two decimals and stored in both `amount` and `usd_amount` for compatibility.
4. Transaction and dealer payment displays show original currency, exchange rate, and applied USD equivalent.
5. Statement totals, dashboards, dealer open balances, and payment allocation logic remain USD/reporting-currency based.
6. Employee payment TRY support remains deferred to MC-3.

Milestone MC-3 adds employee payment original-currency UI support:

1. Employee commissions remain earned, owed, and reported in USD.
2. Admin employee payments can be recorded in `TRY`, `USD`, or `AUD`, with `TRY` as the default.
3. The payment form captures original payment amount, payment currency, and exchange rate to USD.
4. FIFO and manual commission payment allocation use the rounded USD equivalent against USD commission balances.
5. Employee payment rows store original amount/currency/rate plus the USD equivalent in `amount` and `usd_amount`.
6. Employee Profile and My Commissions ledgers show original payment context and applied USD equivalent.

Exchange-rate lookup support:

1. Transaction, dealer payment, and employee payment forms auto-fill exchange rates from Frankfurter for non-USD currencies.
2. USD remains fixed at rate `1`.
3. Lookup uses the selected form date and stores only the final entered `exchange_rate_to_usd` value on save.
4. Users can manually override fetched rates, and historical saved rows are never recalculated automatically when market rates change later.
5. Failed lookups leave the field editable with a manual-entry warning.

Pending Order Costs support:

1. Pending Order Costs track orders where platform payout exists but printing/shipping costs are not finalized yet.
2. Pending costs do not affect statement totals, dealer receivables, dashboard totals, or commission calculations.
3. Admins and permitted employees can create pending costs for assigned dealers.
4. Admins can edit, cancel, or resolve pending costs.
5. Resolving a pending cost creates real confirmed `printing_cost` and/or `shipping_cost` transactions on the selected target statement.
6. Only those resolved transaction rows affect statement totals and downstream commission generation.

The next milestone should add database RPCs for authoritative recalculation and transactional payment allocation.

## Employee Auth + RLS QA Setup

The financial schema already supports linking a real Supabase Auth user to the seeded `Graphic Designer` employee row:

- `public.employees.user_id` references `auth.users(id)`.
- `public.user_roles` stores the app role used by `AuthProvider`.
- `public.current_employee_id()` resolves the active employee row by `employees.user_id = auth.uid()` and `user_roles.role = 'employee'`.

Create or invite the employee user in Supabase Auth first, or sign up through `/signup`. Then run this SQL in the Supabase SQL Editor, replacing the email value:

```sql
-- Link an Auth user to the seeded Graphic Designer employee record.
with target_user as (
  select id, email
  from auth.users
  where lower(email) = lower('graphic.designer@example.com')
  limit 1
),
target_employee as (
  select id
  from public.employees
  where name = 'Graphic Designer'
  limit 1
)
update public.employees e
set user_id = target_user.id
from target_user, target_employee
where e.id = target_employee.id;

-- Ensure the Auth user has the employee app role.
with target_user as (
  select id
  from auth.users
  where lower(email) = lower('graphic.designer@example.com')
  limit 1
)
insert into public.user_roles (user_id, role)
select id, 'employee'::public.user_role
from target_user
on conflict (user_id, role) do nothing;

-- Optional safety check: do not leave this test user as admin.
with target_user as (
  select id
  from auth.users
  where lower(email) = lower('graphic.designer@example.com')
  limit 1
)
delete from public.user_roles
where user_id in (select id from target_user)
  and role = 'admin';
```

Verification query:

```sql
select
  e.id as employee_id,
  e.name,
  e.email,
  e.user_id,
  au.email as auth_email,
  array_agg(ur.role order by ur.role) as roles
from public.employees e
left join auth.users au on au.id = e.user_id
left join public.user_roles ur on ur.user_id = e.user_id
where e.name = 'Graphic Designer'
group by e.id, e.name, e.email, e.user_id, au.email;
```

Employee session QA checklist:

1. Sign out of the admin session and sign in as the linked employee user.
2. Confirm sidebar only shows `Dashboard`, `Dealers`, and `My Commissions`.
3. Confirm `Employees`, `Assignments`, `Settings`, and `Transactions` are not visible.
4. Confirm Dealers only shows active assigned stores allowed by current permissions. With the current QA state, `World of Wedding Co.` should be visible, `Venture Invitations` should be visible but not allow adding transactions, and `Nueva Invitations` should be hidden while inactive. Astra, LA Invitations, Emirates and Weddings, and Invitations Club should be hidden.
5. Open World of Wedding Co. and confirm Add Transaction is visible when `can_add_transactions = true`.
6. Open Venture Invitations and confirm Add Transaction is hidden when `can_add_transactions = false`.
7. Temporarily set `can_view_transactions = false` for a store as admin, then sign in as employee and confirm the dealer/statement detail route redirects away.
8. Temporarily set `can_view_commission = false` for a store as admin, then sign in as employee and confirm related rows disappear from My Commissions.
9. Add an employee transaction on an allowed statement and verify in `public.transactions` that `status = 'pending_review'`, `created_by = auth.uid()` for the employee user, and `created_by_role = 'employee'`.
10. Sign back in as admin, approve or reject the pending transaction, refresh, and confirm the status persists. Only approved `confirmed` transactions should affect totals.

RLS expectations:

- Employees cannot insert dealer payments, employee payments, assignment updates, or admin-only reference rows.
- Employees can select only their active assigned dealers and related statements/transactions according to assignment permissions.
- Employees can insert only pending transactions for dealers where `can_add_transactions = true`.
- Employees can select only their own visible commission/payment rows.
