# v1.6.0 — Quotation Builder, Advanced Customer Pipeline & QA Hardening

This release covers three things: a full-page quotation workflow with pricing
control and profit visibility, an advanced customer/credit pipeline, and a
system-wide stability pass.

## 1. Quotations — full page, price control, profit visibility

- **No more popup.** "New Quotation" now opens a full page
  (`/quotations/new`) with a product browser, cart, and totals panel — the
  same comfortable layout as the POS screen, instead of a cramped modal.
- **Price override & discounts, per line.** Every quoted line shows the
  catalogue price but can be changed for this quotation; a "Changed" badge
  and one-click "Reset" make it obvious when a price has been overridden.
  Each line also supports a percentage or fixed discount, plus a
  whole-quotation discount/shipping/tax at the bottom.
- **Profit panel for staff.** Every line shows cost/unit, profit/unit and
  line profit; the totals panel shows total cost and estimated profit for
  the whole quotation, clearly marked "for shop staff only — not printed."
  Lines quoted below cost are flagged in red.
- **Convert to Sale.** An open quotation can be turned into a real invoice
  with one click — stock is deducted, a payment can be recorded, and the
  quotation is linked to the resulting sale. Cost/profit are recomputed at
  conversion time in case the catalogue changed since the quote was made.
- Quotations can also be edited (while still open), cancelled, and are
  listed with their status (open / converted / expired / cancelled).

## 2. Advanced customer pipeline (regulars, credit, dues)

- **Customer types**: retail, wholesale, or credit account, each with an
  optional credit limit.
- **Customer profile page** (`/customers/:id`): purchase history with every
  bill and its own paid/due amount, recent quotations, account-level
  payment history, and a running-balance summary (from unpaid invoices and
  any pre-existing opening balance).
- **Record a payment** directly from a bill ("customer paid part of the
  bill") or against the general account balance, from the profile page.
- **Accounts Receivable** page (`/customers/receivables`): every customer
  who currently owes the shop money, largest balance first.
- **Dashboard & POS integration**: the dashboard now shows total money owed
  to the shop; the POS customer picker shows each customer's outstanding
  balance and warns the cashier if a credit-account customer is already
  over their credit limit.

## 3. QA / stability fixes

- Quotations now use the same validated line-item math as POS checkout
  (shared, unit-tested code) instead of trusting client-sent totals — this
  removes the previous risk of `NaN` totals, discounts larger than the
  line/quotation total, or quotes for products that no longer exist.
- `POST /sales/:id/payments` now locks the sale row before updating it
  (prevents two cashiers recording a payment on the same credit sale at the
  same moment from silently overwriting each other), rejects payments on an
  already fully-paid sale, and rejects a payment larger than the
  outstanding balance.
- Converting a quotation checks that every quoted product still exists and
  is active, and that stock is available, before creating the sale — so a
  stale quotation can't silently create a broken invoice.
- Added automated tests for the new quotation totals math and the customer
  due/credit aggregation (edge cases: discount larger than subtotal,
  negative shipping, account payments exceeding the opening balance, and
  missing/undefined inputs).

## Upgrading

No manual migration step is required — the backend automatically creates
the new `customer_payments` table and adds the new columns to `customers`,
`quotations` and `quotation_items` the next time it starts up (this is the
existing schema auto-migrator, unchanged).
