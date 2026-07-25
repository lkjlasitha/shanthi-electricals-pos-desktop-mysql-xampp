# Shanthi Electricals POS 1.1.0 — consolidated release

This repository consolidates every correction and feature discussed during the Laravel-to-Node migration and the later prototype review.

## Included

- One root `npm run dev` command starts the Express backend and Vite frontend together on Windows, macOS, and Linux.
- Additive MySQL schema migration and `db:doctor`, including legacy compatibility for transaction totals, product units, expense amounts, and product price history.
- Shanthi Electricals branding and Sri Lankan defaults.
- Dashboard cards, seven-day sales/purchase graph, six-month business graph, top products, top customers, low-stock alerts, recent sales, and warehouse-aware totals.
- Audited cost-price and selling-price adjustments, including price history and optional updates during purchase receiving.
- Printable and downloadable sales receipts, A4 invoices, quotations, purchases, returns, transfers, adjustments, and reports.
- PDF and Excel report downloads.
- Full-database Excel backup and transactional restore with a server-side pre-restore safety backup.
- Automatic EAN-13 product barcode generation and configurable barcode-label printing.
- USB barcode-reader support through HID Keyboard mode, scanner autofocus, F8 focus shortcut, scanner testing, scanner-suffix cleanup, and safe barcode capture on the Add Product form.
- Original-document-based customer and supplier returns, partial-return tracking, over-return prevention, original-price/cost calculation, and stock validation.

## Upgrade from an earlier prototype

1. Back up the current MySQL database.
2. Extract this release into a new directory.
3. Copy only the existing `backend/.env` file into the new directory.
4. Run:

```powershell
npm install
npm run db:setup
npm run test
npm run build
npm run dev
```

Do not merge `node_modules`, old frontend build output, or old source files into this release.

## Barcode scanner

Use a USB scanner configured as **HID Keyboard**, enable EAN-13 and CODE128, and configure **Enter/CR** as the scan suffix. The POS scan field focuses automatically. Press **F8** at any time on the POS screen to restore scanner focus. The Barcode Labels page includes a scanner test box.

## Database safety

`npm run db:migrate` only adds missing tables/columns and normalizes compatibility values. It does not drop the database. Still create a backup before upgrading production shop data.

## 1.2.0 product-family update

The product catalogue now supports Laravel-style parent products and sellable variants, plus a faster multi-attribute builder. See `VARIANT_RELEASE_NOTES.md` and `PRODUCT_VARIANTS_GUIDE.md`.
