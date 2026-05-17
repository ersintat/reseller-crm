# Supabase Integration Plan — Dealer Settlement Manager

This document is a phased technical plan for migrating the current mock/localStorage Dealer Settlement Manager to Supabase Auth, Supabase Postgres, and Row Level Security (RLS). It is intentionally a plan only: do not remove localStorage, add Supabase client code, or change financial formulas until the implementation phases begin.

## Current starting point

The app currently keeps demo data in React state and persists it to `localStorage`. The migration should preserve the current business semantics while moving durable data and authorization to Supabase.

Core guardrails to preserve:

- `bank_payout` is not a dealer payment; it is a platform payout deposited into a dealer bank account and is used only inside statement calculation.
- Dealer open balance must come from statement `remaining_amount` values, not raw transactions.
- Only `confirmed` transactions affect statement totals.
- Employee-created transactions default to `pending_review`.
- Store expenses reduce net profit before the dealer/company split and are not added back to dealer receivable.
- Printing/shipping reduce net profit before the split and are passed to dealer receivable for recovery.
- Dealer receivable is `company_share_amount + printing_costs + shipping_costs + dealer_receivable_adjustment`.
- Employee commissions are generated only for assigned stores.
- Employee commission base and commission amount must never be negative.

## Proposed enums

Create these PostgreSQL enum types first so tables and policies can reference stable values:

```sql
create type user_role as enum ('admin', 'employee');
create type dealer_status as enum ('active', 'review', 'inactive');
create type employee_status as enum ('active', 'inactive');
create type statement_status as enum ('draft', 'ready_to_close', 'open', 'partially_paid', 'carried_forward', 'closed');
create type transaction_type as enum ('bank_payout', 'store_expense', 'printing_cost', 'shipping_cost', 'manual_adjustment');
create type transaction_status as enum ('confirmed', 'pending_review', 'rejected');
create type adjustment_scope as enum ('dealer_receivable_only', 'shareable_net', 'employee_commission_base');
create type adjustment_direction as enum ('increase', 'decrease');
create type payment_allocation_mode as enum ('fifo', 'manual');
create type commission_status as enum ('open', 'partially_paid', 'paid', 'closed');
```

## Table-by-table schema outline

### `profiles`

Supabase-auth-linked user profile record.

Columns:

- `id uuid primary key references auth.users(id) on delete cascade`
- `email text not null unique`
- `display_name text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Notes:

- Created by an auth trigger on `auth.users` insert.
- Used by RLS helper functions to determine app identity.

### `user_roles`

Role mapping for app authorization.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references profiles(id) on delete cascade`
- `role user_role not null`
- `created_at timestamptz not null default now()`
- `unique(user_id, role)`

Notes:

- First signed-up user should automatically receive `admin`.
- Subsequent users default to no role or `employee` only when explicitly linked.

### `dealers`

Dealer/store settlement entity.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `status dealer_status not null default 'active'`
- `dealer_share_percentage numeric(7,6) not null default 0.25`
- `company_share_percentage numeric(7,6) not null default 0.75`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- `dealer_share_percentage >= 0`
- `company_share_percentage >= 0`
- Optional: `dealer_share_percentage + company_share_percentage = 1`

### `employees`

Employee business record, optionally linked to auth.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `auth_user_id uuid references profiles(id) on delete set null`
- `name text not null`
- `email text unique`
- `role_title text`
- `status employee_status not null default 'active'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Notes:

- Employees can be placeholders before they have login accounts.
- Later, an admin links `employees.email` or `employees.auth_user_id` to the corresponding Supabase user.

### `employee_store_assignments`

Store/dealer-specific commission assignment.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `employee_id uuid not null references employees(id) on delete cascade`
- `dealer_id uuid not null references dealers(id) on delete cascade`
- `commission_rate numeric(7,6) not null`
- `effective_from date not null default current_date`
- `effective_to date`
- `created_at timestamptz not null default now()`

Constraints:

- `commission_rate >= 0`
- `effective_to is null or effective_to >= effective_from`
- Add exclusion or app-level validation to prevent overlapping active assignment windows for the same employee/dealer.

### `statements`

Statement header and persisted snapshot totals.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `dealer_id uuid not null references dealers(id) on delete cascade`
- `period_month int not null check (period_month between 1 and 12)`
- `period_year int not null`
- `status statement_status not null default 'draft'`
- `total_bank_payouts numeric(12,2) not null default 0`
- `total_store_expenses numeric(12,2) not null default 0`
- `total_printing_costs numeric(12,2) not null default 0`
- `total_shipping_costs numeric(12,2) not null default 0`
- `adj_shareable numeric(12,2) not null default 0`
- `adj_receivable numeric(12,2) not null default 0`
- `shareable_net_amount numeric(12,2) not null default 0`
- `dealer_share_amount numeric(12,2) not null default 0`
- `company_share_amount numeric(12,2) not null default 0`
- `dealer_receivable_amount numeric(12,2) not null default 0`
- `paid_amount numeric(12,2) not null default 0`
- `remaining_amount numeric(12,2) not null default 0`
- `created_by uuid references profiles(id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- `unique(dealer_id, period_year, period_month)`
- `paid_amount >= 0`
- `remaining_amount >= 0`

Notes:

- `remaining_amount` is the source of truth for dealer open balance.
- Totals should be regenerated by trusted service/RPC when transactions or allocations change.

### `transactions`

Settlement transaction lines for statements.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `dealer_id uuid not null references dealers(id) on delete cascade`
- `statement_id uuid not null references statements(id) on delete cascade`
- `transaction_date date not null`
- `type transaction_type not null`
- `status transaction_status not null default 'pending_review'`
- `amount numeric(12,2) not null check (amount > 0)`
- `description text`
- `order_code text`
- `adjustment_scope adjustment_scope`
- `adjustment_direction adjustment_direction`
- `created_by uuid references profiles(id) on delete set null`
- `approved_by uuid references profiles(id) on delete set null`
- `approved_at timestamptz`
- `rejected_by uuid references profiles(id) on delete set null`
- `rejected_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- If `type = 'manual_adjustment'`, `adjustment_scope` and `adjustment_direction` must be non-null.
- If `type <> 'manual_adjustment'`, adjustment fields should be null.
- Employee-created transactions must default to `pending_review`; admin-created transactions can default to `confirmed` through an RPC or trigger.

### `dealer_payments`

Actual money collected from a dealer. This is separate from `bank_payout`.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `dealer_id uuid not null references dealers(id) on delete cascade`
- `amount numeric(12,2) not null check (amount > 0)`
- `currency text not null default 'USD'`
- `payment_date date not null`
- `description text`
- `allocation_mode payment_allocation_mode not null`
- `created_by uuid not null references profiles(id) on delete restrict`
- `created_at timestamptz not null default now()`

Notes:

- Admin only.
- Never conflate with `transactions.type = 'bank_payout'`.

### `dealer_payment_allocations`

Allocations from dealer payments to statements.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `payment_id uuid not null references dealer_payments(id) on delete cascade`
- `statement_id uuid not null references statements(id) on delete cascade`
- `allocated_amount numeric(12,2) not null check (allocated_amount > 0)`
- `created_at timestamptz not null default now()`

Constraints:

- `unique(payment_id, statement_id)`
- Allocation total per statement must not exceed statement receivable.
- Allocation total per payment must not exceed payment amount.

### `employee_commissions`

Generated employee commission entries per employee and statement.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `employee_id uuid not null references employees(id) on delete cascade`
- `dealer_id uuid not null references dealers(id) on delete cascade`
- `statement_id uuid not null references statements(id) on delete cascade`
- `period_month int not null check (period_month between 1 and 12)`
- `period_year int not null`
- `company_share_amount numeric(12,2) not null default 0`
- `printing_costs numeric(12,2) not null default 0`
- `shipping_costs numeric(12,2) not null default 0`
- `commission_base_adjustments numeric(12,2) not null default 0`
- `commission_base numeric(12,2) not null default 0`
- `commission_rate numeric(7,6) not null`
- `commission_amount numeric(12,2) not null default 0`
- `paid_amount numeric(12,2) not null default 0`
- `remaining_amount numeric(12,2) not null default 0`
- `status commission_status not null default 'open'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- `unique(employee_id, statement_id)`
- `commission_base >= 0`
- `commission_amount >= 0`
- `paid_amount >= 0`
- `remaining_amount >= 0`

### `employee_payments`

Actual commission payments made to employees.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `employee_id uuid not null references employees(id) on delete cascade`
- `amount numeric(12,2) not null check (amount > 0)`
- `currency text not null default 'USD'`
- `payment_date date not null`
- `description text`
- `allocation_mode payment_allocation_mode not null`
- `created_by uuid not null references profiles(id) on delete restrict`
- `created_at timestamptz not null default now()`

Notes:

- Admin only.

### `employee_payment_allocations`

Allocations from employee payments to commission rows.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `payment_id uuid not null references employee_payments(id) on delete cascade`
- `commission_id uuid not null references employee_commissions(id) on delete cascade`
- `allocated_amount numeric(12,2) not null check (allocated_amount > 0)`
- `created_at timestamptz not null default now()`

Constraints:

- `unique(payment_id, commission_id)`
- Allocation total per commission must not exceed commission amount.
- Allocation total per payment must not exceed payment amount.

## RLS policy outline

Create helper SQL functions before policies:

- `app.current_user_has_role(role user_role) returns boolean`
- `app.current_employee_id() returns uuid`
- `app.employee_assigned_to_dealer(dealer_id uuid) returns boolean`
- `app.is_admin() returns boolean`

### Admin access

Admin policies should provide full read/write access to all domain tables:

- `using (app.is_admin())`
- `with check (app.is_admin())`

Apply to profiles, roles, dealers, employees, assignments, statements, transactions, dealer payments/allocations, employee commissions, employee payments/allocations.

### Employee dealer visibility

Employees can read only dealers assigned through `employee_store_assignments`:

- `dealers`: read where `app.employee_assigned_to_dealer(id)`
- `statements`: read where assigned to `statements.dealer_id`
- `transactions`: read where assigned to `transactions.dealer_id`
- `dealer_payments` and `dealer_payment_allocations`: generally do not expose to employees unless product explicitly wants employees to see payment status; default recommendation is no employee access to payment records.

### Employee transactions

Employees can insert transactions only for assigned dealers/statements:

- `with check (app.employee_assigned_to_dealer(dealer_id) and status = 'pending_review')`

Employees should not update `status`, `approved_by`, `approved_at`, `rejected_by`, or `rejected_at`.

Recommendation:

- Use an `insert_employee_transaction` RPC to force `status = 'pending_review'` server-side.
- Allow employees to update only their own `pending_review` transactions through an RPC or column-restricted application logic.

### Transaction approval

Admin only:

- Update transactions from `pending_review` to `confirmed` or `rejected`.
- Set approval/rejection metadata.
- Trigger/recalculate statement totals after approval/rejection.

### Dealer payments and dealer allocations

Admin only:

- Insert/update/delete dealer payments.
- Insert/update/delete dealer payment allocations.
- Run FIFO/manual allocation RPCs.
- Recalculate statement `paid_amount`, `remaining_amount`, and `status` after allocation.

### Employee commissions and employee payments

Employees:

- Read only their own `employee_commissions`.
- Read own `employee_payment_allocations` only if joined through own commissions/payments and product wants payment visibility.
- Cannot create/update/delete commission rows or payment rows.

Admins:

- Full access to commission/payment rows.
- Run commission generation and employee payment allocation RPCs.

## Auth strategy

1. Enable Supabase Auth email/password or magic-link login.
2. Create an `auth.users` insert trigger that inserts a `profiles` row.
3. First signed-up user becomes admin:
   - Use a transaction in the profile creation trigger or a bootstrap RPC.
   - If no `user_roles` rows exist, insert `(new_user, 'admin')`.
4. Employees can exist as placeholder records before login.
5. Admin can later link an employee to an auth user by matching email or selecting a `profiles.id`.
6. Once auth and RLS are live, remove the temporary role switcher and derive role/employee context from Supabase session + database queries.

## Data migration and seed strategy

Initial seed data:

- Dealers:
  - World of Wedding Co.
  - Venture Invitations
  - Nueva Invitations
  - Emirates and Weddings
  - Astra Invitations
  - LA Invitations
  - Invitations Club
- Placeholder employee:
  - Graphic Designer
- Assignments:
  - Graphic Designer → World of Wedding Co. at `0.02`
  - Graphic Designer → Venture Invitations at `0.015`
  - Graphic Designer → Nueva Invitations at `0.03`

Transition approach:

1. Keep localStorage demo mode behind a development-only toggle while read-only Supabase pages are introduced.
2. Add seed SQL for dealers, employee placeholder, and assignments.
3. Do not automatically upload arbitrary localStorage user data into production tables.
4. If demo data import is needed, build a one-off admin-only importer that validates statements, transactions, payments, allocations, and commissions before insert.

## Service layer plan

Introduce frontend service modules that hide Supabase details from pages. Pages should stop mutating arrays directly and call services instead.

### Dealer services

- `listDealers()`
- `getDealer(dealerId)`
- `getDealerLedger(dealerId)`
- `getDealerOpenBalance(dealerId)`

### Statement services

- `listStatementsForDealer(dealerId)`
- `createStatement({ dealerId, periodYear, periodMonth })`
- `markStatementReady(statementId)`
- `closeStatement(statementId)`
- `recalculateStatement(statementId)`

### Transaction services

- `listTransactions(filters)`
- `createTransaction(input)`
- `updatePendingTransaction(transactionId, input)`
- `approveTransaction(transactionId)`
- `rejectTransaction(transactionId, reason?)`

### Dealer payment services

- `listDealerPayments(dealerId)`
- `previewDealerPaymentFIFO({ dealerId, amount })`
- `recordDealerPaymentFIFO(input)`
- `recordDealerPaymentManual(input)`
- `listStatementAllocations(statementId)`

### Employee commission services

- `listEmployees()`
- `getEmployeeCommissionLedger(employeeId)`
- `generateCommissionsForStatement(statementId)`
- `getEmployeeOpenCommissionBalance(employeeId)`
- `previewEmployeePaymentFIFO({ employeeId, amount })`
- `recordEmployeePaymentFIFO(input)`
- `recordEmployeePaymentManual(input)`

## Calculation ownership recommendation

### Keep in frontend initially

- Display-only formatting.
- UI previews of FIFO/manual allocations.
- Client-side helper text and form validation.
- Non-authoritative calculation previews for draft UX.

### Move to database RPC/functions before production

- Statement total recalculation.
- Approval transition logic.
- Dealer payment allocation creation and validation.
- Statement paid/remaining/status updates.
- Commission generation.
- Employee payment allocation creation and validation.

Rationale:

- RLS cannot protect business correctness if critical math remains only in the browser.
- Payment and commission allocation must be transactionally consistent.
- Duplicate commission generation should be prevented by unique constraints and upsert/RPC logic.

Recommended RPCs:

- `recalculate_statement(statement_id uuid)`
- `approve_transaction(transaction_id uuid)`
- `reject_transaction(transaction_id uuid, reason text)`
- `record_dealer_payment_fifo(...)`
- `record_dealer_payment_manual(...)`
- `generate_employee_commissions_for_statement(statement_id uuid)`
- `record_employee_payment_fifo(...)`
- `record_employee_payment_manual(...)`

## Recommended migration order

### A. Supabase client + auth shell

- Add Supabase client configuration.
- Add login/logout pages.
- Add session provider.
- Keep localStorage demo mode available.
- Do not remove role switcher until real role reads are stable.

### B. Migrations + seed data

- Add enum migrations.
- Add tables in dependency order.
- Add indexes and constraints.
- Add seed data for seven dealers and Graphic Designer assignments.
- Add first-admin bootstrap trigger/RPC.

### C. Read-only database-backed dealers/statements

- Implement read services for dealers, statements, and transactions.
- Add feature flag to switch pages from localStorage to Supabase reads.
- Validate statement totals match mock fixtures.

### D. Write transactions + approvals

- Implement transaction creation RPC.
- Employee insert defaults to `pending_review` server-side.
- Admin approval/rejection RPC recalculates statements.
- Add RLS tests for assigned/unassigned employees.

### E. Dealer payments + allocations

- Implement FIFO/manual payment RPCs.
- Validate allocation totals in database transactions.
- Recalculate statement paid/remaining/status.
- Add tests for partial and full allocation.

### F. Employee commissions + payments

- Implement commission generation RPC on statement close/open.
- Add unique protections for employee/statement commission rows.
- Implement employee payment FIFO/manual RPCs.
- Add tests for zero-floor commission base and assigned-store-only generation.

### G. Remove localStorage dependency

- Remove localStorage as primary persistence.
- Optionally keep demo mode behind explicit dev-only flag.
- Remove temporary role switcher.
- Ensure all pages derive identity from Supabase Auth + RLS-backed queries.

### H. QA/RLS tests

- Add SQL/RLS tests for admin and employee access.
- Add service integration tests for calculations and allocation RPCs.
- Add UI smoke tests for core workflows.
- Test corrupted/incomplete data paths and duplicate prevention.

## Risks and mitigations

### RLS locking admin out

Risk:

- If the first-admin bootstrap or role helper fails, no user can manage data.

Mitigation:

- Create a tested bootstrap migration/RPC.
- Keep a service-role-only recovery script documented.
- Add SQL tests for `app.is_admin()`.

### Duplicate commission generation

Risk:

- Closing a statement multiple times can create duplicate commissions.

Mitigation:

- Add `unique(employee_id, statement_id)`.
- Use upsert in `generate_employee_commissions_for_statement`.
- Preserve paid state for partially/fully paid commissions.

### Allocation consistency

Risk:

- Concurrent payment allocations can over-allocate statements or commissions.

Mitigation:

- Use database transactions and row locks in payment RPCs.
- Recheck remaining amounts inside the RPC before insert.
- Add constraints and validation queries.

### Recalculation mismatch

Risk:

- Frontend previews and database authoritative calculations diverge.

Mitigation:

- Keep frontend calculations as previews only.
- Return authoritative totals from RPCs after writes.
- Add shared fixture tests that compare expected values against database functions.

### localStorage/database divergence

Risk:

- During transition, localStorage data may conflict with Supabase data.

Mitigation:

- Add a clear data source mode indicator.
- Do not silently sync localStorage into production.
- Provide explicit reset/import tools only for admin/demo environments.

## Open questions

1. Should employees be allowed to see dealer payment status, or only statement/transaction data for assigned dealers?
2. Should statement close change status to `closed` immediately, or does `open` mean closed-for-calculation but open-for-payment?
3. Should commissions generate from both `open` and `closed` statements, or only a final close state?
4. Should commission rates be snapshotted from assignment effective dates at statement period end or statement close date?
5. Should dealer/company share percentages be snapshotted per statement to preserve historical splits?
6. Do dealer payments require external reference numbers, payment method, or attachment support?
7. Should multi-currency be modeled now, or is USD-only acceptable for first Supabase schema?
8. Should rejected transaction reason be required?
9. Do admins need audit logs for every approval/payment/allocation mutation?
10. Should database functions be exposed as RPCs only, or should some writes use direct table inserts with triggers?
