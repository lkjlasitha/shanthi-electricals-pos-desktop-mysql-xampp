# POS Input, Item Discount and Quick Item Release — v1.4.0

## Fixed: POS text and number fields

The POS no longer converts an empty quantity, price, discount, tax or received-amount field immediately to `0` while the cashier is editing it. Values remain as typed and are validated only when the sale is held or charged.

The barcode field also no longer steals focus after clicking a product. It is focused automatically only at initial POS entry, after a successful barcode scan, after completing/holding a sale, or when the cashier presses **F8** / **Focus scanner**.

Barcode-label design number fields were also changed to preserve raw typing while being edited.

The desktop shell also restores Chromium keyboard focus after native confirmation/alert dialogs and Windows task switching. This addresses the case where mouse-driven buttons still worked but text inputs stopped receiving keystrokes.

## Added: discount on a selected item

Each cart line now supports:

- no discount
- percentage discount
- fixed-amount discount
- one-click 5% and 10% discounts

The cart shows the saving for each item and separates item discounts from the optional whole-bill discount.

The backend independently validates every item discount. A percentage cannot exceed 100%, and a fixed discount cannot exceed that line's value.

## Added: quick/manual bill item

The POS now has **+ Quick item**. Enter an item name, price and quantity to place a product that is not in the catalogue directly on the bill.

A quick item:

- appears on sales history, A4 invoices, receipt PDFs and thermal receipts
- contributes to sale totals and revenue
- does not create a Product record
- does not reduce warehouse stock
- is excluded from catalogue best-selling-product reports
- is excluded from inventory returns because it never changed stock

The sale item table now stores a historical item-name/code snapshot. Existing installations are upgraded automatically by the additive startup migration.

## Upgrade an existing installed desktop app

1. Create a full Excel backup in **Settings**.
2. Close Shanthi Electricals POS.
3. Build v1.4.0 with `npm run desktop:make:win`, or install the supplied v1.4.0 setup program over the existing version.
4. Start the application normally. The database migration adds the manual-item columns and makes `sale_items.product_id` optional.
5. Test one normal product sale, one item discount and one quick-item sale before using it in production.

The upgrade does not delete products, sales, stock, users, settings or MySQL connection details.
