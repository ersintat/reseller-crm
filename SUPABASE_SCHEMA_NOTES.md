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

Milestone 6D adds Supabase-backed statements and transactions in real auth mode:

1. Statements and transactions load from Supabase after login.
2. Admin statement creation writes to Supabase and relies on the database unique constraint to block duplicate dealer/month/year statements.
3. Admin-created transactions are inserted as `confirmed`.
4. Employee-created transactions are inserted as `pending_review`.
5. Admin approval/rejection updates transaction status in Supabase.
6. Dealer payments, payment allocations, employee commissions, employee payments, and employee payment allocations remain local/localStorage-backed.
7. Statement totals are still calculated in the frontend helper layer. Cached statement total updates are intentionally deferred until an RPC/recalculation milestone.

The next milestone should migrate dealer payments and payment allocations or add database RPCs for authoritative statement recalculation.
