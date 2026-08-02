# POS Price Override and Profit Display — v1.5.0

## What changed

- Every catalogue product added to POS now has a clearly labelled **Sale price for this bill** field.
- The cashier may temporarily change the sale price without changing the product's saved catalogue price.
- A **Changed** badge appears whenever the temporary price differs from the standard price.
- A **Reset** button restores the product's standard price immediately.
- The cart shows the product's standard price, cost per unit, profit per unit, and line profit.
- Selling below cost displays a red warning.
- Product cards show cost and the standard unit profit before the item is added.
- Item-level discounts are included in the profit calculation.
- Tax is excluded from profit. Whole-bill discounts are shown separately because they are not attributable to one product line.
- Manual quick items remain editable but do not show profit because no product cost is known.

## Database upgrade

The automatic MySQL schema migration adds nullable snapshot columns to `sale_items`:

- `standard_price`
- `product_cost`
- `profit_amount`

New sales store the authoritative catalogue price and cost from MySQL at checkout. The browser cannot supply or falsify these values. Existing sales remain valid; their new snapshot columns may be empty because the historical product cost cannot be reconstructed reliably.

## Important behaviour

Changing a price in POS affects only that cart line and completed invoice. It does not update the saved product selling price. Permanent product price changes should still be made from Products or Purchases.

Customer invoices and receipts continue to show only the actual selling price, discounts, tax, and totals. Product cost and profit are cashier-facing data and are not printed for the customer.
