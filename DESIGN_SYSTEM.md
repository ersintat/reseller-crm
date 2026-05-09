# Dealer Settlement Manager Design System

## 1. Product Visual Identity

Dealer Settlement Manager is a finance and admin operations SaaS product for settlement review, dealer receivables, transaction approvals, and employee commission tracking.

The product should feel professional, calm, precise, and trustworthy. The visual language should support repeated operational use: scanning numbers, comparing rows, reviewing exceptions, and moving through approval workflows without distraction.

The reference quality bar is modern finance SaaS: Stripe, Ramp, Mercury, and Linear-inspired clarity, restraint, density, and polish. The interface should not copy any of those products directly. It should use the same principles: crisp hierarchy, quiet surfaces, exact labels, clean tables, subtle borders, and confident use of whitespace.

Core visual traits:
- Light theme by default.
- White and off-white surfaces.
- Deep indigo as the primary accent.
- Slate neutrals for text and structure.
- Semantic color used sparingly for status and risk.
- Dense but readable operational layouts.
- Minimal decoration; no marketing-style hero sections.

## 2. Layout Principles

### App Shell

The app should use a stable SaaS admin shell:
- Left sidebar for primary navigation.
- Topbar for environment/auth context, current user, role, and sign-out.
- Main content area for page-specific workflows.

The shell should feel persistent and calm. Avoid large animated or decorative elements.

### Sidebar Behavior

Sidebar should:
- Remain fixed-width on desktop.
- Use clear nav labels.
- Show active page state.
- Group admin-only and employee/self-service sections when navigation grows.
- Collapse or become a drawer on smaller screens in a later phase.

Recommended desktop width: `240px` to `264px`.

### Topbar Structure

Topbar should contain:
- Left: environment/status text such as `Supabase auth · Mock financial data` or `Demo mode`.
- Right: signed-in user, role, and sign-out action.
- In demo mode only: temporary role switcher.

The topbar should not carry page titles. Page titles belong inside page headers.

### Page Header Pattern

Every page should start with:
- Optional eyebrow for module/category.
- Page title.
- One-sentence subtitle explaining operational purpose.
- Optional right-side controls for primary page actions.

Example:
- Eyebrow: `Finance Operations`
- Title: `Admin Dashboard`
- Subtitle: `Monitor dealer receivables, pending transactions, and employee commissions.`

### Content Width

Admin dashboard and operational tables should use full available content width with internal padding.

Recommended:
- Main content padding: `24px`.
- Large pages: full width.
- Forms and detail panels: constrained inner grids where useful.
- Avoid narrow centered layouts except auth pages and focused forms.

### Section Spacing

Use consistent vertical rhythm:
- Page header to KPI grid: `24px`.
- Between major sections: `20px` to `24px`.
- Card internal padding: `16px`.
- Table cell padding: `12px 16px`.

Avoid nested cards. Sections can be bordered surfaces; repeated entities can be cards.

### Responsive Behavior

Desktop:
- Dense tables and multi-column KPI grids.
- Dashboard: 4 KPI cards, then 2- or 3-column section grids.

Tablet:
- KPI cards wrap to 2 columns.
- Tables remain horizontally scrollable if needed.

Mobile:
- KPI cards stack.
- Tables may scroll horizontally.
- Sidebar should eventually become a drawer.
- Page actions should stack under page header.

## 3. Color System

### Backgrounds

Use a quiet neutral canvas:
- App background: `#f8fafc` / Tailwind `slate-50`.
- Alternate subtle background: `#f1f5f9` / `slate-100`.

### Surfaces

Primary surfaces:
- Cards, panels, tables: `#ffffff`.
- Table header rows: `#f8fafc`.
- Hover rows: `#f8fafc`.

### Borders

Use subtle borders to structure information:
- Default border: `#e2e8f0` / `slate-200`.
- Softer divider: `#f1f5f9` / `slate-100`.
- Focus border: deep indigo.

### Primary Accent

Deep indigo should remain the primary action and link color:
- Primary accent: `#2d2f8f`.
- Light accent background: `#eef2ff` / `indigo-50`.
- Accent border: `#c7d2fe` / `indigo-200`.

Use indigo for:
- Primary buttons.
- Active nav state.
- Links.
- Selected filters.
- Small module eyebrows.

### Text Hierarchy

Recommended hierarchy:
- Primary text: `#0f172a` / `slate-900`.
- Secondary text: `#475569` / `slate-600`.
- Muted text: `#64748b` / `slate-500`.
- Disabled/helper text: `#94a3b8` / `slate-400`.

### Semantic Colors

Use semantic color sparingly and consistently:

Paid / closed / successful:
- Background: `emerald-50`
- Text: `emerald-700`
- Border: `emerald-200`

Open / neutral:
- Background: `slate-100`
- Text: `slate-700`
- Border: `slate-200`

Pending / review / partial:
- Background: `amber-50`
- Text: `amber-700`
- Border: `amber-200`

Rejected / error:
- Background: `red-50`
- Text: `red-700`
- Border: `red-200`

Expense / negative operational cost:
- Use red or rose sparingly in amount text only when it improves clarity.
- Do not color every cost aggressively; finance UIs should remain calm.

Payments / credits:
- Use emerald text for payment rows or negative ledger movement.
- Include a minus sign or explicit label; never rely on color alone.

## 4. Typography System

Use system fonts currently configured in the app:
`Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif`.

### Headings

Page title:
- `24px`, semibold, `slate-950`.

Section title:
- `16px`, semibold, `slate-950`.

Panel/card title:
- `14px` to `15px`, medium or semibold.

Avoid oversized headings in operational dashboards.

### Body Text

Default body:
- `14px`, regular, `slate-700`.

Secondary body:
- `13px` to `14px`, `slate-500` or `slate-600`.

### Table Text

Table body:
- `14px`, regular.

Table headers:
- `12px`, uppercase, medium, slight tracking, `slate-500`.

Important row labels:
- `14px`, medium, `slate-950`.

### Helper Text

Helper text:
- `12px`, `slate-500`.
- Use below labels/forms or inside cards.
- Keep helper text factual, not marketing.

### Number / KPI Styling

KPI numbers:
- `24px` to `28px`, semibold.
- Use tabular alignment if a future font setting supports it.

Table money values:
- `14px`, medium.
- Right-align in tables.
- Preserve currency formatting.

## 5. Component Design Rules

### KPI Cards

KPI cards should include:
- Label.
- Primary value.
- Short helper text.
- Optional small context/trend pill.

Rules:
- Keep labels uppercase or small-medium for scanability.
- Values should be visually dominant.
- Use semantic context pill only when useful.
- Avoid large icons unless they add clear meaning.

### Data Tables

Tables are the core UI pattern.

Rules:
- Header row with muted background.
- Consistent cell padding.
- Money columns right-aligned.
- Row hover state.
- Status column uses `StatusBadge`.
- Row action links should be right-aligned.
- Empty states should live inside the table/panel body.
- Avoid wrapping critical money values.

### Status Badges

Status badges should:
- Use semantic color mapping.
- Be small, bordered, and readable.
- Preserve exact status text unless a display label map is introduced.

Suggested mapping:
- `closed`, `paid`: emerald.
- `open`: slate.
- `pending_review`, `draft`, `partially_paid`, `review`: amber.
- `rejected`, `error`: red.

### Buttons

Primary button:
- Indigo background.
- White text.
- Medium weight.
- Used for main create/submit actions.

Secondary button:
- White background.
- Slate border.
- Slate text.

Danger button:
- Red background or red text, depending on destructive severity.

Rules:
- Button copy should be action-oriented.
- Avoid ambiguous labels like `Submit` where `Record Payment` or `Add Transaction` is clearer.

### Forms

Form rules:
- Use labels or strong placeholders where current UI is compact.
- Group related fields.
- Use helper text for rules that affect financial calculations.
- Inputs should be consistent height.
- Manual adjustment scope/direction should appear only when transaction type is `manual_adjustment`.
- Required validation should be clear and immediate.

### Modals

Future modal rules:
- Use modals for confirmation, focused editing, or destructive actions.
- Do not use modals for large data entry flows.
- Include clear title, short explanation, primary action, secondary cancel.

### Empty States

Empty states should sound operational, not placeholder-like.

Good:
- `No transactions are waiting for review.`
- `No payment allocation rows yet.`

Avoid:
- `TODO`
- `Coming soon`
- `No data lol`

### Alerts / Flash Messages

Flash messages:
- Use top content area below topbar.
- Clear after user action or remain dismissible.
- Use semantic styling based on success/warning/error.
- Text should explain what happened, not what the system attempted.

## 6. Finance-Specific UI Rules

Money values in tables should be right-aligned.

Ledger rows:
- Positive receivables should be neutral/slate.
- Payments/credits should be visually distinct, preferably emerald text plus negative sign.
- Expenses should be clearly labeled as expenses and may use red/rose text when they reduce value.

Terminology:
- Never label `bank_payout` as dealer payment.
- Use: `Platform payout deposited into dealer bank account`.
- Use: `Dealer receivable`, `Company share`, `Dealer share`, `Printing cost`, `Shipping cost`, `Store expense`.

Complex settlement logic needs helper text:
- `bank_payout is a platform payout deposited into the dealer bank account. It is not a dealer payment.`
- `Pending review transactions do not affect totals until approved.`
- `Open balance is derived from statement remaining amounts.`

Approval workflows:
- Pending rows should be visually distinct.
- Admin review entry points should be obvious.
- Employee-created rows should show submitted-by context.

## 7. Page-Specific Improvement Plan

### Admin Dashboard

Target:
- Finance operations command center.

Improve:
- KPI cards.
- Settlement Overview.
- Action Required queue.
- Employee Commission Snapshot.
- Recent Activity feed.
- Dense tables with right-aligned amounts.

### Dealers

Target:
- Dealer receivables index.

Improve:
- Add page header and filter/search row.
- Add dealer/store/status/open balance/current month columns.
- Right-align money columns.
- Add clearer empty state if filters produce no results.

### Dealer Profile

Target:
- Single dealer account view.

Improve:
- Keep summary cards at top.
- Add statement/payment tabs or clearly separated sections.
- Make ledger rows visually distinct by type.
- Surface last payment and outstanding balance.
- Keep `Record Dealer Payment` admin-only.

### Statement Detail

Target:
- Settlement calculation review and transaction entry.

Improve:
- Preserve detailed calculation breakdown.
- Add clearer transaction table grouping by confirmed vs pending.
- Add admin commission preview panel.
- Improve employee transaction entry panel.
- Keep helper text visible for `bank_payout` and `pending_review`.

### Transactions

Target:
- Admin approval queue and transaction search.

Improve:
- Add segmented filters for status.
- Make pending queue visually prominent.
- Right-align amounts.
- Add row-level approve/reject buttons with consistent button style.
- Keep employee role restricted.

### Employees

Target:
- Commission liability overview.

Improve:
- Add employee search/filter.
- Show assigned stores compactly.
- Right-align commission balances.
- Use status badges for open/paid/partial.

### Employee Profile

Target:
- Commission ledger and payment history.

Improve:
- Strengthen KPI cards.
- Split commission ledger and payment recording.
- Make FIFO/manual allocation clearer.
- Add empty state for no payments.

### Assignments

Target:
- Store assignment visibility and future editing.

Improve:
- Add clear permission columns.
- Add assignment effective dates in future.
- Add edit action in future phase.
- Keep current milestone read-only until CRUD is intentionally added.

### My Commissions

Target:
- Employee self-service commission ledger.

Improve:
- Keep employee-focused metrics.
- Add assigned stores context.
- Show commission entries with statement links.
- Keep admin dealer financial totals out of this page.

### Settings

Target:
- Environment and demo controls.

Improve:
- Split demo controls, auth status, and future Supabase diagnostics.
- Make Reset Demo Data visibly destructive.
- Show current mode: demo vs Supabase auth.

## 8. Implementation Phases

### Phase 1: Design Tokens / Shared Components

Add shared primitives:
- Page header.
- Section card.
- KPI card.
- Data table wrappers.
- Empty state.
- Button variants.
- Form field wrapper.

Keep this phase visual only.

### Phase 2: App Shell Polish

Improve:
- Active sidebar state.
- Topbar alignment.
- Auth/demo mode display.
- Mobile sidebar behavior if needed.

No business logic changes.

### Phase 3: Dashboard Redesign

Apply design system to Admin Dashboard first.

Validate:
- KPI values match current calculations.
- Pending count matches transactions.
- Employee dashboard remains unchanged.

### Phase 4: Table / Form Polish

Apply shared table and form rules to:
- Dealers.
- Transactions.
- Employees.
- Statement Detail transaction form.

Keep formulas untouched.

### Phase 5: Assignment Editing

Only after visual consistency is stable:
- Add admin assignment editing.
- Validate employee store access rules.
- Keep mock/localStorage until data migration phase.

### Phase 6: Final QA

Check:
- Desktop and mobile layouts.
- Text overflow.
- Money alignment.
- Semantic status colors.
- Auth mode and demo mode.
- Employee restrictions.
- Pending transaction workflow.

Run:
- `npm run build`
- Browser smoke tests for admin and employee roles.
