# Shanthi Electricals POS 1.2.0 — product variants

This release starts from the consolidated Shanthi Electricals build and adds product-family and variant management based on the uploaded Laravel POS design.

## Added

- Parent product families using `main_products`
- Individually sellable product variants
- Multi-attribute variant metadata
- Quick one-variant-per-line entry
- Attribute matrix and Cartesian-combination generation
- Wire-roll, LED-bulb and size templates
- Bulk cost, selling price, alert and starting-stock defaults
- Variant-specific automatic EAN-13 barcodes
- Add-more-variants workflow
- Convert-existing-product workflow that preserves stock and history
- Family and variant badges in the product list
- Variant-aware schema migration and database diagnosis
- Backfill support for Laravel-style `variation_products`

## Preserved

All earlier dashboard, price history, printing, PDF, Excel, backup/restore, barcode scanner, returns, Windows launcher and schema-compatibility fixes remain included.
