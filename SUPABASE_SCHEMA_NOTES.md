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

The next milestone should add database RPCs for authoritative recalculation and transactional payment allocation.
