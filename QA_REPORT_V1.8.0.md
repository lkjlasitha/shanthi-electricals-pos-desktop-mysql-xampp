# QA Report — v1.8.0

## Scope reviewed

- React product, supplier bill, returns, stock adjustment, transfer and dashboard flows
- Express routes, authentication/authorization and central error handling
- Sequelize product, stock, purchase, receipt, payment and return transactions
- Additive MySQL/MariaDB migration and database doctor
- Excel backup/restore compatibility
- Electron startup, keyboard-focus recovery, renderer-crash recovery, printing and graceful shutdown

## High-risk failures corrected

1. Product edit loaded stock but discarded it on save. Stock levels now reconcile transactionally and create auditable adjustment records.
2. Purchase `paid_amount` had no append-only payment history. A payment ledger now records initial and later part-payments.
3. Ordered goods could only be treated as fully received. Ordered, partially received and received quantities are now separate, preventing premature stock increases.
4. Concurrent receipts or payments could otherwise overwrite stale totals. The purchase and line rows are locked inside database transactions.
5. Supplier returns changed stock without reducing accounts payable. Return credits now reduce the net bill and expose supplier refunds/credits.
6. Invalid transfer/adjustment values could reach stock arithmetic as `NaN`, duplicate a product or target a missing record. All are now rejected before mutation.
7. Repeated clicks could create duplicate forms/transactions. Saving states now block repeat submissions on the affected screens.
8. Older backups would be rejected after adding the new payment table. Restore now accepts the rebuildable table difference and reconstructs derived rows.
9. Cancelled purchases could inflate dashboard/report totals. Financial aggregates now exclude them.
10. Common database disconnect, deadlock, bad-JSON and oversized-body failures now return recoverable API messages instead of generic failures.

## Automated verification completed

- 52 dependency-free unit and Electron service tests passed.
- Tests cover barcodes, dates/timezone handling, payments, product/variant payloads, price changes, sale lines, returns, supplier bills, partial receiving, payable calculations, supplier credits, stock reconciliation, XAMPP detection and MySQL setup validation.
- Every backend, Electron and project-script JavaScript file passed `node --check`.
- All package JSON files parsed successfully.
- Raw delimiter checks across all 30 JSX files found no mismatches.

## Environment-dependent verification

The uploaded source archive did not include `node_modules`, and dependency installation is unavailable in the isolated QA workspace. Therefore the following must be run on the Windows build machine with MySQL/MariaDB available:

```powershell
npm install
npm run db:setup
npm run verify
npm run desktop:start
```

Perform one final user-acceptance pass with a disposable database:

1. Edit a product's warehouse stock up and down; confirm a reason is required and Stock Adjustments shows the audit record.
2. Create an ordered supplier bill with no payment; confirm stock does not change.
3. Receive part of the order, then the balance; confirm stock increases only by each receipt.
4. Pay the bill in two parts; confirm payment history, outstanding totals and status changes.
5. Return some received goods; confirm stock decreases and the supplier bill credit/outstanding balance changes.
6. Filter bills by month, supplier, status and overdue state; compare dashboard and purchase-report totals.
7. Create a full Excel backup, restore it to a disposable database and rerun `npm run db:doctor`.
8. Build and open the Electron app; test keyboard focus after native dialogs and print one A4 purchase bill.

No QA process can prove the absence of every possible future failure, but the identified crash, concurrency, migration, restore and financial-integrity paths above are now guarded and tested.
