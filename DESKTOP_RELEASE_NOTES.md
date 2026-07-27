# Desktop Release Notes — v1.4.0


## POS improvements in v1.4.0

- Fixed POS number fields that could not be cleared and retyped naturally.
- Prevented the barcode scanner field from stealing focus while another input is being edited.
- Added system-wide Electron keyboard-focus recovery after native dialogs and window focus changes.
- Added percentage and fixed discounts per sale item, including 5% and 10% quick actions.
- Added one-off manual bill items with name, quantity and price.
- Added automatic MySQL migration for manual sale-item columns and nullable product references.
- Updated invoices, receipts, sales history, returns and product-sales reporting for manual items.

## Added

- Electron desktop shell for the existing React/Vite and Express system.
- Squirrel.Windows installer configuration through Electron Forge.
- First-run XAMPP / standalone / network MySQL setup window.
- XAMPP installation and configured-port detection.
- MySQL connection testing with user-friendly error messages.
- Optional database creation and dedicated limited POS database account provisioning.
- Encrypted MySQL password and JWT secret storage through Electron `safeStorage`.
- React production build served by Express on a random localhost port.
- Single-instance desktop behavior and startup/recovery dialogs.
- Windows app-data, log and safety-backup directories.
- Native printer enumeration and Electron printing.
- Optional silent thermal-receipt printing to a selected Windows printer.
- Desktop settings for printer selection, data folders and database reconfiguration.
- First-run creation of roles, default warehouse, LKR currency, units, settings and the first POS administrator.
- Offline system-font configuration; Google Fonts are no longer required.
- Desktop service unit tests for MySQL validation/error handling and XAMPP configuration parsing.

## Preserved

- MySQL/MariaDB and Sequelize schema.
- Product families and product variants.
- Existing sales, purchases, stock, returns, quotations, reports and user management.
- Full Excel backup and restore format.
- Browser development workflow.

## Build commands

```powershell
npm install
npm run verify
npm run desktop:start
npm run desktop:make:win
```
