# Shanthi Electricals POS v1.6.0

## Quotation workspace

- Quotations are now created and edited on a full page instead of inside a modal.
- Staff can change the quoted unit price and apply fixed, percentage, line, and whole-quotation discounts.
- Standard selling price, unit cost, profit, below-cost warnings, and estimated quotation profit remain visible while preparing a quote.
- Price, cost, discount, and profit are snapshotted on every saved line, so future catalogue changes do not rewrite history.
- Active quotations can be reopened and revised safely.

## Customer accounts and credit

- Customer profiles now support an account code, active/inactive status, credit approval, credit limit, payment terms, notes, and an opening amount due.
- Profiles show lifetime sales, bills, purchased items, returns, payments, current amount due, overdue amount, customer credit, and a running statement.
- Receipts settle the oldest open bills first. Excess receipts remain as customer credit and automatically apply to a future sale.
- The POS shows the selected customer's amount due, overdue amount, and spending power and can receive account payments without leaving checkout.
- Partial and credit sales are blocked unless the customer has enough customer credit or an approved limit.
- Due dates are calculated from customer payment terms.
- Cash account receipts are included in register cash-in-hand calculations.

## Stability and integrity

- Checkout separates cash received from the amount applied to a bill, preventing tender/change from overpaying an invoice.
- Sale payments are transactional, locked against double updates, and cannot exceed the bill balance.
- Registers are locked while closing, count actual cash rows, and cannot be closed by an unauthorized cashier.
- Invalid dates, negative amounts, excessive discounts, inactive records, duplicate customer codes, and credit-limit violations return actionable errors.
- Opening balances cannot be silently rewritten after customer activity begins.
- Database migrations add all v1.6.0 fields automatically at startup.
- Production dependencies were refreshed, including Multer 2 and the maintained React Router line.

## Upgrade

1. Create a normal POS backup.
2. Replace the application files with v1.6.0.
3. Run `npm install` with Node.js 20 or newer when using the source version.
4. Start the app; the schema migrator adds the new fields automatically.
5. Open each credit customer's profile and set **Allow credit**, **Credit limit**, and **Payment terms**.
6. Run `npm run verify` before packaging from source.

Existing sales, payments, customers, quotations, products, stock, and documents are retained.
