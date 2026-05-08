# Dealer Settlement Manager – Project Spec (Baseline v0)

## Objective
Create a React + TypeScript + Vite baseline for a dealer settlement admin dashboard with role-aware navigation, mock data, and placeholder modules.

## Current Scope (Implemented in v0)
- Frontend-only baseline.
- Route skeleton for all core modules.
- Sidebar + top header layout.
- Temporary role switcher for Admin vs Employee.
- Mock data for 7 dealer stores and 1 Graphic Designer employee.
- Employee view restricted to assigned stores.

## Required Business Rules (Documented for future logic)
1. `bank_payout` is NOT a dealer payment.
2. `bank_payout` is platform payout into dealer bank account.
3. Dealer open balance from statement `remaining_amount` (not raw transactions).
4. `dealer_receivable_amount = company_share_amount + printing_costs + shipping_costs + dealer_receivable_adjustment`.
5. Store expenses reduce shareable net.
6. Printing/shipping are company-paid and passed to dealer receivable.
7. Employee commission base = `company_share_amount - printing_costs - shipping_costs + commission_base_adjustments`.
8. Employee commission must never be negative.
9. Employee-created transactions default to `pending_review`.
10. Only `confirmed` transactions affect statement totals.
11. Payments should support FIFO and manual allocation.

## Architecture Direction
- Supabase-compatible architecture:
  - Future data access layer should isolate queries and RPC usage.
  - Future auth should map users to roles and store assignments.
  - RLS-ready schema and policy conventions planned.
- UI currently uses mock in-memory data.

## Planned Core Modules
- Dashboard
- Dealers
- Dealer Profile
- Statement Detail
- Transactions
- Employees
- Employee Profile / Commission Ledger
- Assignments
- Settings
- My Commissions

## Out of Scope for v0
- Real settlement calculations
- Statement close/open cycle
- Real approvals
- Real auth/session management
- Live Supabase database integration
