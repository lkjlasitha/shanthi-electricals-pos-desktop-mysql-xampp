# Requirements Audit — v1.7.0

## Quotation requirements

| Requirement | Status | Delivered behavior |
| --- | --- | --- |
| Change item price on quotation | Complete | Each quotation line has an editable temporary price, standard-price comparison, changed badge, and reset action. Catalogue price is not modified. |
| Add item and whole-quotation discounts | Complete | Percentage/fixed line discounts plus whole-quotation discount, shipping, and order tax are validated on both client and server. |
| Show cost and profit to shop staff | Complete | Cost/unit, profit/unit, line profit, total cost, and estimated net profit are visible in the builder. Below-cost lines are warned. These values are not printed for the customer. |
| User-friendly quotation without creation popup | Complete | New and existing quotations use `/quotations/new` and `/quotations/:id` full-page routes with product browser, cart, totals, and document actions. |
| Convert quote to POS sale safely | Complete | Conversion supports cash/card/bank/credit, full or partial payment, due date, stock deduction, profit snapshots, inactive-product/customer checks, expiry checks, and concurrency locking. |

## Customer and credit-pipeline requirements

| Requirement | Status | Delivered behavior |
| --- | --- | --- |
| Regular/wholesale/credit customer profiles | Complete | Customer type, notes, active state, credit limit, opening balance, and payment terms are stored and validated. |
| Show goods bought and related bill | Complete | Customer profile expands each bill to show every item, code, quantity, price, discount-adjusted line total, and invoice document reference. |
| Support credit and part payments | Complete | POS and quote conversion create paid, partial, or unpaid invoices. Additional payments can be recorded per bill. |
| Show amount to receive | Complete | Profile, customers list, receivables, dashboard, POS selector, and sales history use the same invoice/opening-balance ledger. |
| Record one payment against a running customer account | Complete | Account receipt is allocated atomically to opening balance and then oldest unpaid invoices; each bill's paid/due amount and status is updated. Overpayment is rejected. |
| Advanced receivables pipeline | Complete | Due dates, overdue days, overdue/current totals, oldest due date, unpaid bill count, last purchase/payment, account-payment allocation history, and credit-limit warnings are available. |
| Add balances to POS flow | Complete | POS shows existing balance, debt created by the current cart, projected balance, default terms, and projected over-limit warning; balances refresh after checkout. |
| Include later receipts in the POS cash pipeline | Complete | New invoice/account receipts attach to the cashier's open register, update register cash-in-hand, and appear in today's received-money KPI on the actual payment date. |

## Stability and data integrity

- Server recalculates quotation and sale totals from validated line data.
- Quotation conversion is single-use under a row lock and rechecks stock.
- Customer account payment allocation and invoice updates run in one transaction.
- Cash tender above total keeps the tender for change while capping paid amount at invoice total.
- Existing databases receive additive columns and due-date backfill automatically at startup.
- Legacy payment-method enums are expanded without deleting payment history.
- Automated unit tests cover totals, allocation, overpayment, payment terms, cash change, customer validation, migration behavior, discounts, variants, returns, and barcode/date utilities.

## Verification command

```text
npm run verify
```

This runs backend tests, Electron service tests, and the production React build.
