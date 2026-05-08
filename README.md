# Dealer Settlement Manager

Baseline React + TypeScript + Vite app for the Dealer Settlement Manager product.

## Stack
- React
- TypeScript
- Vite
- Tailwind CSS
- Supabase-compatible architecture (mock-only baseline)

## Getting Started

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in terminal (typically `http://localhost:5173`).

## Baseline Features
- SaaS admin dashboard layout with sidebar and top header.
- Light theme with white/off-white surfaces and deep indigo accent.
- Role switcher (Admin / Employee) for temporary permission simulation.
- Employee role restricted to assigned stores.
- Mock data:
  - 7 stores/dealers
  - 1 Graphic Designer employee with 3 store assignments
- Placeholder pages for all required modules.

## Routes
- `/` Dashboard
- `/dealers`
- `/dealers/:dealerId`
- `/statements/:statementId`
- `/transactions`
- `/employees`
- `/employees/:employeeId`
- `/assignments`
- `/settings`
- `/my-commissions`

## Mock-only Notice
This version intentionally does not include:
- Supabase client integration
- Real authentication
- Real approval workflow
- Real financial settlement logic

See TODO comments in source for integration points.

## Demo persistence
- The mock app state is persisted to `localStorage` using a versioned key prefix: `dealer-settlement-manager:v1`.
- Persisted slices include statements, transactions, dealer payments/allocations, and employee commissions/payments/allocations.
- Use **Settings → Reset Demo Data** to clear persisted state and restore seeded defaults.
- TODO: this temporary browser persistence will be replaced by Supabase-backed persistence.
