# Dealer Settlement Manager – Agent Instructions

## Scope
These instructions apply to the entire repository.

## Product Guardrails (must remain true)
1. `bank_payout` is **not** a payment to the dealer.
2. `bank_payout` is a platform payout deposited into dealer bank account.
3. Dealer open balance must be derived from statement `remaining_amount` values.
4. `dealer_receivable_amount = company_share_amount + printing_costs + shipping_costs + dealer_receivable_adjustment`.
5. Store expenses reduce shareable net amount.
6. Printing and shipping are company-paid and passed to dealer receivable.
7. Employee commission base = `company_share_amount - printing_costs - shipping_costs + commission_base_adjustments`.
8. Employee commission must never be negative.
9. Employee-created transactions default to `pending_review`.
10. Only `confirmed` transactions affect statement totals.
11. Payments must support FIFO and manual allocation (future implementation).

## Engineering Notes
- Current baseline uses mock data only.
- Supabase integration is planned; add TODOs where repositories/services will be wired.
- Real auth is not yet implemented; role switcher is temporary.
- Keep UI style professional SaaS admin dashboard (light theme, clean tables, indigo accent).
