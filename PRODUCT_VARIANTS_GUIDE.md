# Product families and variants

Shanthi Electricals POS now supports the parent-product and sellable-variant pattern used by the reference Laravel POS.

## Data model

A **product family** stores the shared identity of an item, such as `DIMO LED Bulb` or `Kelani Wire Roll`. Each **variant** remains a normal product record and therefore has its own:

- Barcode or SKU
- Cost price and selling price
- Price-change history
- Warehouse stock
- Low-stock alert
- Purchase, sale, quotation, transfer, adjustment and return history
- Barcode label

The family is stored in `main_products`. Sellable variants are stored in `products` and linked through `main_product_id`. Attribute definitions and values are additionally recorded in `variations`, `variation_types` and `variation_products`. Flexible multi-attribute values are preserved in `products.variant_attributes`.

## Creating a family

Open **Products** and choose **Product with Variants**.

### Quick list

Use this when each required variant is already known. Enter one variant per line, for example:

```text
50m Red
100m Brown
```

This creates only those two variants, rather than every possible length/colour combination.

### Attribute matrix

Use this when every combination should be created. For example:

```text
Length: 50m, 100m
Colour: Red, Brown, Black
```

The system generates six variants. A maximum of 100 variants is allowed in one request to prevent accidental oversized combinations.

Built-in starting templates are provided for:

- Wire rolls: Length + Colour
- LED bulbs: Wattage
- General size-based products

## Bulk entry conveniences

- Apply one default cost, selling price, low-stock alert and starting quantity to all generated rows.
- Edit any row after applying defaults.
- Leave the barcode blank to generate a unique EAN-13 barcode.
- Enter or scan a supplier/manufacturer barcode for a specific variant.
- Disable or remove unwanted combinations before saving.
- Select one warehouse for the initial quantities; all other warehouses start at zero.

## Adding variants later

Every product-family row has an **Add variants** action. It opens the same quick-list and matrix tools and copies the family’s category, brand, units, tax and notes from an existing variant.

## Converting an existing product

Choose **Make family** beside a single product. Its barcode, stock, cost, selling price and history are preserved. The product becomes the first variant, and new variants are added in the same transaction.

## Behaviour elsewhere

The POS, purchases, quotations, stock movements, returns, reports and barcode-label page continue to use individual product IDs. This means selecting `DIMO LED Bulb - 12W` cannot accidentally change the stock of `DIMO LED Bulb - 50W`.

## Upgrade

Back up MySQL, extract this project into a new folder, copy `backend/.env`, and run:

```powershell
npm install
npm run db:setup
npm run test
npm run build
npm run dev
```

The additive migration creates or updates the variant-related tables and columns without deleting existing products.
