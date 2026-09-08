# SQL-to-MongoDB cutover checklist

## Before cutover

- Schedule downtime and stop new sales, returns, purchases, and stock changes.
- Export a final `.xlsx` backup from the old POS.
- Record dashboard totals, customer receivables, supplier payables, stock valuation, and document counts.
- Prepare an empty MongoDB database on a replica set, sharded cluster, or Atlas.
- Create a least-privilege application user with read/write access to that database.

## Import

- Configure this edition with the new MongoDB URI.
- Sign in with the initial administrator.
- Restore the final legacy `.xlsx` backup from Settings.
- Do not manually edit the backup workbook; edited types or IDs can invalidate relationships.

## Acceptance checks

- Run `npm run db:doctor` and confirm transaction-capable deployment is reported.
- Compare document counts for sales, purchases, products, customers, suppliers, and returns.
- Compare total stock and spot-check at least ten products across every warehouse.
- Compare customer receivables and supplier payables.
- Open and print several old invoices, quotations, purchases, transfers, and returns.
- Test a sale, partial payment, return, purchase receipt, stock transfer, and backup/restore in a non-production copy.

## Go live

- Keep the old database read-only for the agreed retention period.
- Take a MongoDB snapshot immediately after acceptance.
- Document the production URI owner, backup schedule, restore procedure, and support contact without recording passwords in this repository.
