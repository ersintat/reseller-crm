# Dealer Settlement Manager

Baseline React + TypeScript + Vite app for the Dealer Settlement Manager product.

## Stack
- React
- TypeScript
- Vite
- Tailwind CSS
- Supabase Auth and Supabase-backed settlement data with demo/localStorage fallback

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

## Multi-Currency Foundation

USD remains the reporting and dashboard currency. Supabase money-moving rows now include original-currency storage fields for future multi-currency UI work:

- `original_amount`
- `original_currency`
- `exchange_rate_to_usd`
- `usd_amount`

Existing `amount` fields remain USD equivalents during the transition. The service layer reads `usd_amount` when present and falls back to `amount`, so current statements, payments, commissions, and dashboard totals continue to behave as before.

Transaction entry, dealer payment entry, and employee payment entry now support original-currency input. Transactions and dealer payments support `USD`, `TRY`, and `AUD`; employee payments default to `TRY` and also support `USD` and `AUD`. Users enter the original amount, original currency, and exchange rate to USD; the app stores the rounded USD equivalent in both `amount` and `usd_amount` for compatibility. Statement totals, dashboards, dealer balances, and employee commission balances still report in USD. Employee commissions are owed in USD, while employee payment ledgers show both the original payment currency and applied USD equivalent.

Exchange rates can be auto-filled from the Frankfurter API using the selected form date and currency. USD uses a fixed rate of `1`; TRY and AUD attempt to fetch the historical rate to USD. The rate field always remains editable, and saved historical records keep the final captured exchange rate instead of updating automatically later.

## Demo persistence
- The mock app state is persisted to `localStorage` using a versioned key prefix: `dealer-settlement-manager:v1`.
- Persisted slices include statements, transactions, dealer payments/allocations, and employee commissions/payments/allocations.
- Use **Settings → Reset Demo Data** to clear persisted state and restore seeded defaults.
- TODO: this temporary browser persistence will be replaced by Supabase-backed persistence.

## Vercel Deployment

The app is a Vite single-page React app. `vercel.json` rewrites all routes to `index.html` so refreshed deep links such as `/dealers/:dealerId` and `/statements/:statementId` continue to work.

1. Push the repository to GitHub.
2. In Vercel, create a new project from the GitHub repository.
3. Set the framework preset to **Vite** if Vercel does not detect it automatically.
4. Configure environment variables in Vercel:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

5. Use these build settings:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`

### Production Deployment Checklist

- Supabase auth and financial migrations have been applied.
- RLS policies are applied and enabled.
- First admin user has been created.
- Graphic Designer or other employee auth users are linked to `employees.user_id`.
- Employee users have matching `user_roles` rows with the `employee` role.
- Vercel environment variables are configured.
- Admin login is tested in the deployed app.
- Employee login is tested in the deployed app.
- Statement, transaction, payment, commission, and assignment flows are smoke-tested after deployment.

### Known Production Hardening Backlog

- Move statement and commission recalculation into database RPCs or triggers.
- Make payment creation and allocation insertion atomic with database transactions or RPCs.
- Add immutable approval and audit history for transaction review.
- Run direct RLS/API abuse tests with employee-scoped tokens.
- Make cached statement and commission totals authoritative in the database.
