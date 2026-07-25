# Product and Report Fixes

This build repairs the failures shown in the supplied server log.

## Product creation

- Empty `product_unit`, `sale_unit`, and `purchase_unit` values are converted to SQL `NULL`.
- When only a stock unit is selected, it is automatically used as the sale and purchase unit.
- Category, brand, main-product, unit, and warehouse IDs are checked before insertion.
- Product prices, stock alerts, initial stock, and tax percentages are validated.
- The product form now exposes separate sale and purchase unit selectors.
- Foreign-key errors now distinguish an invalid selection from a record that is already referenced.

## Reports and database schema

- Added `npm run db:migrate`.
- Startup automatically performs the same additive migration.
- Critical report columns are added explicitly before the generic model scan, without dropping tables or deleting rows.
- Sequelize models are discovered through `sequelize.modelManager.models`, with fallbacks for other registry shapes.
- Every added column is re-read from MySQL immediately; migration stops with the exact column name if MySQL did not create it.
- Added `npm run db:doctor` to print actual table columns and missing requirements.
- Known legacy totals are copied into `sales.grand_total`, `purchases.grand_total`, `sale_items.sub_total`, and `purchase_items.sub_total` where possible.
- Null totals are normalized to zero after compatible values are copied.
- Top-products reporting now uses a MySQL `ONLY_FULL_GROUP_BY`-safe aggregate query.
- Report API values are returned as numbers and report errors are displayed in the UI.

## First run after replacing an older build

```powershell
npm install
npm run db:check
npm run db:doctor
npm run db:migrate
npm run seed
npm run dev
```

Back up a database containing real shop data before any deployment update.
