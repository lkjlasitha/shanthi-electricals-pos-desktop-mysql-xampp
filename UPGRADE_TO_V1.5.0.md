# Upgrade to v1.5.0

## Before upgrading

1. Open the installed POS.
2. Go to Settings and create a Full Excel Backup.
3. Confirm that XAMPP/MySQL is running and keep the backup outside the application folder.

## Build the upgraded installer on Windows

From the extracted project root:

```powershell
npm install
npm run verify
npm run desktop:make:win
```

Install the generated setup file over the existing installation:

```text
out\make\squirrel.windows\x64\Shanthi Electricals POS Setup.exe
```

## First launch after upgrade

The application automatically adds the new nullable financial snapshot columns to the existing MySQL `sale_items` table. It does not delete, recreate, or replace the existing database.

New sales store:

- actual temporary sale price,
- standard catalogue price at checkout,
- product cost at checkout,
- line profit after item discount and excluding tax.

Older sales remain usable. Their new cost/profit snapshot fields may be empty because their historical cost cannot be reconstructed reliably.

## Acceptance check

1. Add a product whose standard price is Rs. 100 and cost is Rs. 70.
2. Change **Sale price for this bill** to Rs. 95.
3. Confirm the **Changed** badge appears.
4. Confirm cost is Rs. 70, profit per unit is Rs. 25, and line profit changes with quantity.
5. Apply an item discount and confirm profit decreases immediately.
6. Click **Reset** and confirm the price returns to Rs. 100.
7. Complete the sale and confirm the customer invoice shows Rs. 95 but does not show cost or profit.
8. Reopen Products and confirm the permanent selling price is still Rs. 100.
