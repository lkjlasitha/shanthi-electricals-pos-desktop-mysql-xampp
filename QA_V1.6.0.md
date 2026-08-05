# QA report — v1.6.0

## Automated verification

- `npm run verify`: passed.
- Backend unit tests: 43 passed.
- Electron/database-setup tests: 7 passed.
- Production React build: passed (1,086 modules transformed).

Coverage includes barcodes, customer balances, oldest-first allocations, excess credit, due dates, quotation financial snapshots, discounts/tax, sale validation, price overrides, manual items, returns, migrations, variants, database setup, and XAMPP detection.

## Failure cases hardened

- Empty carts and quotations.
- Invalid, inactive, or removed customers/products.
- Zero, negative, or invalid quantities, prices, payments, tax, and discounts.
- Discounts exceeding a line or document total.
- Partial sales to cash-only customers and credit-limit overruns.
- Duplicate payment updates and overpayment of settled invoices.
- Concurrent register closing and unauthorized register access.
- Impossible calendar dates and payment-term date drift.
- Editing an opening balance after account activity exists.
- Missing columns on older databases.
- UI render failures (the app-level error boundary remains enabled).

## Deployment checks

Before shop installation, create a backup and test the installer against a copy of the live MySQL database. Confirm one quotation, one partial-credit sale, one later customer payment, one excess-payment/customer-credit redemption, and one register close. Hardware-specific checks (printer, scanner, Windows permissions, and the exact XAMPP/MySQL build) must be completed on the target PC because those devices are unavailable in the source test environment.

## Dependency review

Previous production dependency findings were removed by the dependency refresh. The current audit reports a React Router RSC-mode advisory; this POS is a client-rendered SPA and does not enable React Server Components or server actions, so the affected path is absent. Update again when the router project publishes a non-advisory compatible release.
