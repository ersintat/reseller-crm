# Dealer Settlement Manager

Baseline React + TypeScript + Vite app for the Dealer Settlement Manager product.

## Stack
- React
- TypeScript
- Vite
- Tailwind CSS
- Supabase Auth foundation with mock/localStorage business data

## Getting Started

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in terminal (typically `http://localhost:5173`).

## Supabase Auth Setup

Copy `.env.example` to `.env.local` and fill in the values from your Supabase project:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Run the SQL migration in `supabase/migrations/202605090001_auth_foundation.sql` against your Supabase database. It creates:
- `user_role` enum
- `profiles`
- `user_roles`
- `has_role(user_id, role)` helper
- auth user profile bootstrap trigger
- RLS policies for profiles and role reads

### First Admin Bootstrap

The `handle_new_user` trigger inserts a profile for every new `auth.users` row. If there is no existing `admin` role, the new user is assigned `admin`. This means the first signed-up user becomes the initial admin. Later users do not automatically become admin while an admin role already exists.

## Demo Mode Behavior

If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing, the app stays in demo mode:
- No Supabase client is created.
- `/login` and `/signup` redirect back to the app.
- The temporary Admin / Employee role switcher remains visible.
- Mock state continues to persist in `localStorage`.

If both Supabase env vars are present:
- `/login` and `/signup` use Supabase Auth.
- Protected app pages redirect unauthenticated users to `/login`.
- The temporary role switcher is hidden after login.
- The active app role is derived from `user_roles`.

## Baseline Features
- SaaS admin dashboard layout with sidebar and top header.
- Light theme with white/off-white surfaces and deep indigo accent.
- Role switcher (Admin / Employee) for temporary permission simulation in demo mode.
- Supabase Auth shell for real sign in/sign up when env vars are configured.
- Employee role restricted to assigned stores.
- Mock data:
  - 7 stores/dealers
  - 1 Graphic Designer employee with 3 store assignments

## Routes
- `/` Dashboard
- `/login`
- `/signup`
- `/dealers`
- `/dealers/:dealerId`
- `/statements/:statementId`
- `/transactions`
- `/employees`
- `/employees/:employeeId`
- `/assignments`
- `/settings`
- `/my-commissions`

## What Remains Mock / LocalStorage
In real auth mode, the app now loads these tables from Supabase:
- dealers
- employees
- employee store assignments
- statements
- transactions
- dealer payments
- dealer payment allocations
- employee commissions
- employee payments
- employee payment allocations

These areas intentionally remain mock/localStorage-backed:
- settlement calculations

When Supabase activity data is active, the app shows: `Supabase settlement, commissions & assignments`.

Statement, transaction, dealer payment, dealer payment allocation, employee commission, employee payment, employee payment allocation, and assignment edit writes use Supabase in auth mode. Cached statement `paid_amount` and `remaining_amount` columns are not authoritative yet; the UI still derives paid and remaining amounts from dealer payment allocations with the existing frontend helpers. Employee commission generation and payment allocation still use the frontend calculation helpers; database RPCs/triggers are deferred.

## Demo persistence
- The mock app state is persisted to `localStorage` using a versioned key prefix: `dealer-settlement-manager:v1`.
- Persisted slices include statements, transactions, dealer payments/allocations, and employee commissions/payments/allocations.
- Use **Settings → Reset Demo Data** to clear persisted state and restore seeded defaults.
- TODO: this temporary browser persistence will be replaced by Supabase-backed persistence.
