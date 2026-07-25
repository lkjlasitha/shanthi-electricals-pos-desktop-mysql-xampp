# Dashboard, Barcode and Returns Fixes

## Dashboard expense error

The dashboard previously queried `expenses.amount`, but older installations could have an `expenses` table without that column. The startup migrator did not treat the field as critical, so the API failed with:

```text
Unknown column 'amount' in 'field list'
```

This revision adds `expenses.amount` through the additive schema migrator before dashboard queries run. If a compatible legacy column exists (`expense_amount`, `expense_total`, `grand_total`, `total`, `total_amount`, `cost`, or `value`), its values are copied. Otherwise existing rows receive `0`, which prevents the dashboard from failing while keeping the original rows.

After upgrading, run:

```powershell
npm run db:check
npm run db:migrate
npm run db:doctor
```

`db:doctor` should report `amount` in the `expenses` column list and finish with `Schema check passed.`

## Automatic product barcodes

When **Add Product** opens, the application requests a unique EAN-13 barcode automatically. If that request is interrupted, the backend generates another unique barcode when the product is saved, so the code field may safely be left blank.

Manual codes are still supported. Existing CODE128 products remain printable.

## Barcode label designer

Open **Products → Barcode Labels** or use **Barcode Labels** in the navigation.

The page supports:

- Product search and per-product label quantity
- 40 × 25, 50 × 30, 60 × 40, and 70 × 40 mm labels
- Shop name, product name, selling price, and cut-border controls
- Padding, gap, and font-size controls
- EAN-13 and CODE128 rendering
- Browser printing to A4 sheets or label printers
- **Save as PDF** through the browser print dialog

A print job is limited to 500 labels to avoid freezing the browser.

## Why returns did not work before

The previous **Returns** screen only listed existing return records. It had no form that could create a return, and the sales/purchase detail dialogs did not link to a return workflow. Although POST endpoints existed, they expected the frontend to manually provide customer/supplier, warehouse, prices, and quantities. They also did not compare the requested quantity with the original transaction or earlier returns.

## Corrected return workflow

Customer and supplier returns are now created against the original sale or purchase:

1. Open **Returns** and select **Customer Return** or **Supplier Return**, or use the return action in a sale/purchase detail dialog.
2. Select the original document.
3. The system loads the original items, original quantity, quantity already returned, remaining returnable quantity, and original unit value.
4. Enter only the quantities being returned.
5. Save the return.

The backend, not the browser, derives the customer/supplier, warehouse, and refund/cost values from the original document. It groups duplicate product lines, blocks products that were not on the document, prevents over-returns, and applies stock changes inside one database transaction.

- Customer return: stock is added back to the original warehouse.
- Supplier return: stock is deducted from the original warehouse and is blocked when current stock is insufficient.
- Repeated partial returns are supported until the original quantity has been fully returned.
