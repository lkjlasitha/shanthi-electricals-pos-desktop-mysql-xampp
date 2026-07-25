# Dashboard and Price Adjustment Guide

## Dashboard

The Shanthi Electricals dashboard now follows the useful overview pattern from the Laravel POS while keeping the Node/React design.

It shows:

- Today's net sales, purchases, returns, received payments and expenses.
- Current-month sales, purchases, operating expenses and an estimated result.
- Current stock cost valuation for the selected warehouse.
- A seven-day sales-versus-purchases line graph.
- A six-month sales, purchases and expenses graph.
- Top-selling products for the current month.
- Top customers for the current month.
- Recent sales and low-stock alerts.

Cashiers assigned to a warehouse see warehouse-specific transaction and stock figures. Users without a warehouse assignment see consolidated figures.

## Manual price adjustment

Open **Products** and select **Adjust prices** beside a product.

The dialog allows either or both of these values to change:

- Cost price
- Selling price

A reason is mandatory. Every change stores:

- Previous and new cost price
- Previous and new selling price
- Date and time
- User
- Change source
- Reason
- Purchase reference when the change came from receiving stock

The product list shows the current unit margin. A warning is displayed when the proposed selling price is lower than the proposed cost.

## Updating prices while receiving a purchase

When the entered supplier cost differs from the product's current cost, the purchase line shows the percentage increase or decrease.

Users with `products.manage` permission can choose to:

- Save the entered purchase cost as the product's new cost price.
- Change the selling price at the same time.
- Change only the selling price while keeping the existing cost.
- Record the purchase without changing either catalogue price.

Price changes are applied only when the purchase is received successfully. Stock receipt, purchase creation, product-price update and price-history creation use the same database transaction, so they cannot be partially applied.

Historical invoices, quotations and purchase documents keep their original line prices. Changing the current product price affects only future transactions.

## Database upgrade

After extracting this revision and copying `backend/.env`, run:

```powershell
npm install
npm run db:check
npm run db:migrate
npm run db:doctor
npm run seed
npm run test
npm run build
npm run dev
```

The migration creates the `product_price_histories` table automatically. Full Excel backups include this table without additional configuration.
