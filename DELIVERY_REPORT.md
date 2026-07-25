# Shanthi Electricals POS — Delivery Report

## Requested work completed

The Node.js prototype has been rebranded from Electro POS to **Shanthi Electricals** and extended using the original Laravel POS document workflows as a functional reference.

### Printable and downloadable documents

- POS sale: dedicated 80 mm browser receipt, 80 mm PDF receipt, and A4 sales invoice PDF.
- Sales history: the same receipt and invoice actions for every saved sale.
- Quotations: A4 print view and PDF download.
- Purchases: A4 print view and PDF download.
- Sale returns: printable credit note and PDF.
- Purchase returns: printable return note and PDF.
- Warehouse transfers: printable transfer note and PDF.
- Stock adjustments: printable adjustment note and PDF.
- Reports: browser print, PDF download, and Excel download for sales, purchases, top-selling products, and stock valuation.

Documents use the business identity, address, contact information, TIN/VAT number, LKR settings, terms, and footer configured in Settings.

### Full Excel backup and restore

- Exports every MySQL base table into one `.xlsx` workbook.
- Preserves IDs, relationships, timestamps, settings, transactions, stock, users, and password hashes.
- Uses a protected metadata worksheet and table map.
- Restore requires an administrator or another user with `settings.manage` permission.
- Restore requires the exact confirmation text `RESTORE`.
- The workbook must match the current database table set; partial or edited backups are rejected.
- A pre-restore safety workbook is written to `backend/backups/` before replacement starts.
- Restore runs in a database transaction and always re-enables MySQL foreign-key checks.

### Rebranding

Visible application branding, package identities, login, navigation, browser title, API health identity, seed defaults, PDF documents, Excel reports, backup names, and local-storage keys now use Shanthi Electricals. Existing login storage is migrated from the old key names, and known prototype business names in the database are upgraded without overwriting a genuine custom name.


### Dashboard and price control update

- Dashboard expanded using the Laravel dashboard as a workflow reference.
- Added today's sales/purchases/returns/receipts/expenses cards.
- Added seven-day sales-versus-purchases line graph.
- Added six-month sales/purchases/expenses graph.
- Added current-month top-products and top-customers charts.
- Added stock cost valuation, recent sales and warehouse-aware low-stock alerts.
- Added `product_price_histories` for audited cost and selling-price changes.
- Added a dedicated Products → Adjust prices workflow with mandatory reason and margin warning.
- Added optional cost and selling-price updates while receiving a purchase.
- Purchase stock receipt and requested price changes run in one database transaction.
- Existing sales, quotations and purchase lines retain the price captured when they were created.

## First run

Copy your existing `backend/.env` into this project and run from the project root:

```powershell
npm install
npm run db:check
npm run db:doctor
npm run db:migrate
npm run seed
npm run test
npm run build
npm run dev
```

Open `http://localhost:5173`.

## Production safety

Before the first restore test, create a normal MySQL backup and test the Excel restore against a disposable database copy. Excel backup is useful for application-level portability but should supplement, not replace, scheduled database-server backups.

### Dashboard expense, barcode and returns correction

- Added `expenses.amount` to the explicit critical-column migration and database doctor checks.
- Added safe copying from known legacy expense-value columns before zero-filling unresolved null values.
- Added automatic unique EAN-13 generation when a new product is opened or saved without a code.
- Added a barcode-label design and print page with physical label sizes and EAN-13/CODE128 support.
- Replaced the list-only Returns page with customer-return and supplier-return forms.
- Added return actions to sale and purchase details.
- Return parties, warehouse, unit values, and allowed quantities are now derived from the original document.
- Added partial-return accounting, duplicate-line aggregation, over-return prevention, and transactional stock updates.

See `DASHBOARD_BARCODE_RETURNS_FIX.md` for the exact original defects and the corrected workflows.
