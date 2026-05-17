# Dealer Settlement Manager – Agent Instructions

## Scope
These instructions apply to the entire repository.

## Product Guardrails (must remain true)
1. `bank_payout` is **not** a payment to the dealer.
2. `bank_payout` is a platform payout deposited into dealer bank account.
3. Dealer open balance must be derived from statement `remaining_amount` values.
4. `net_profit = bank_payouts - printing_costs - shipping_costs - store_expenses + shareable_net_adjustments`.
5. `dealer_receivable_amount = company_share_amount + printing_costs + shipping_costs + dealer_receivable_adjustment`.
6. Store expenses reduce net profit before the dealer/company split and are not added back to dealer receivable.
7. Printing and shipping are company-paid, reduce net profit before the split, and are passed to dealer receivable for recovery.
8. Employee commission base = `company_share_amount - printing_costs - shipping_costs + commission_base_adjustments`.
9. Employee commission must never be negative.
10. Employee-created transactions default to `pending_review`.
11. Only `confirmed` transactions affect statement totals.
12. Payments must support FIFO and manual allocation.

## Engineering Notes
- Supabase-backed mode is implemented with demo/localStorage fallback.
- Do not change auth logic or RLS unless explicitly requested.
- Keep UI style professional SaaS admin dashboard (light theme, clean tables, indigo accent).
