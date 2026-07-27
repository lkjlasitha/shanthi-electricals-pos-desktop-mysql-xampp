# Shanthi Electricals POS — Electron + React + Express + MySQL

A complete point-of-sale, inventory, purchasing, quotation, return and reporting system for Shanthi Electricals. The project supports both browser development and a Windows desktop installer while keeping **MySQL/MariaDB** as the database.

## Project layout

```text
backend/       Express API, Sequelize models, MySQL migrations and services
frontend/      React + Vite POS interface
electron/      Desktop main process, secure preload APIs and database setup UI
resources/     Windows application icons
forge.config.cjs
```

## Main features

- JWT authentication with admin, manager and cashier roles
- Products, product families and individually sellable variants
- EAN-13/CODE128 barcode generation, scanning and label printing
- Multi-warehouse stock, transfers and adjustments
- Purchases, sales/POS checkout and cash-register shifts
- Per-item percentage/fixed discounts with quick 5% and 10% actions
- Quick/manual bill items for products not yet saved in the catalogue
- Original-document sale and purchase returns with quantity protection
- Quotations and held carts
- Customers, suppliers, expenses and settings
- Dashboard KPIs, charts, stock valuation and low-stock alerts
- A4 documents, 80 mm receipts, PDF and Excel exports
- Full-database Excel backup and guarded restore
- Electron desktop app with XAMPP detection and MySQL credential setup
- Native Windows printer selection and optional silent receipt printing

## Windows desktop application

The desktop build contains Electron, React and Express. It does not embed MySQL. On first launch it offers:

1. **Use XAMPP** — detect local XAMPP/MariaDB and its configured port.
2. **Use MySQL Server** — enter a local, standalone or network MySQL/MariaDB host, port, username and password.

The recommended setup creates a dedicated POS database account and does not retain the MySQL administrator password. Saved application credentials and the JWT secret are encrypted by the operating system.

Complete instructions are in [DESKTOP_MYSQL_INSTALLATION.md](DESKTOP_MYSQL_INSTALLATION.md).

### Run the desktop app during development

```powershell
npm install
npm run verify
npm run desktop:start
```

### Build the Windows installer

```powershell
npm install
npm run desktop:make:win
```

The installer is generated under:

```text
out\make\squirrel.windows\x64\Shanthi Electricals POS Setup.exe
```

The target computer requires XAMPP/MySQL locally or access to a network MySQL server. It does not require Node.js, npm or the source project.

## Browser development

Copy the backend environment template:

```powershell
copy backend\.env.example backend\.env
```

Edit `backend/.env`, start MySQL/MariaDB, then run:

```powershell
npm install
npm run db:setup
npm run dev
```

Development URLs:

- API: `http://localhost:4000`
- React: `http://localhost:5173`

The Vite server proxies `/api` to Express.

## Useful commands

```text
npm run dev                 browser development
npm run test                backend and desktop service tests
npm run build               React production build
npm run verify              tests plus production build
npm run db:check            test the .env MySQL connection
npm run db:migrate          additive schema migration
npm run db:doctor           inspect required MySQL columns
npm run seed                create defaults for browser development
npm run desktop:start       build and open Electron
npm run desktop:package     create an unpacked desktop package
npm run desktop:make:win    create the Windows installer
```

## First database initialization

The desktop setup performs this automatically. For browser development, `npm run db:setup`:

- creates the configured database when allowed
- creates missing tables
- runs additive, non-destructive schema migrations
- verifies critical reporting and product-variant columns
- creates roles, warehouse, LKR currency, units, categories, brands and settings
- creates the seed administrator when no matching user exists

Change the browser seed administrator password after first login. The desktop setup requires the user to choose the first POS password instead of relying on a default.

## MySQL/XAMPP behaviour

`ECONNREFUSED` means no database server is accepting connections at the selected host and port. Start MySQL in XAMPP or start the standalone MySQL/MariaDB Windows service.

For a central server, configure:

- a stable LAN IP address
- Windows Firewall inbound access to the selected MySQL port
- MySQL/MariaDB `bind-address`
- a MySQL account allowed from the POS computer

Do not restore separate copies of the same backup on every client when all clients share one central database.

## Desktop data and security

The installed application does not write into `Program Files`. Per-user files are stored under:

```text
%APPDATA%\Shanthi Electricals POS\
├── config\database.json
├── app-data\backups\
└── logs\desktop.log
```

The MySQL database remains on the selected database server. **Settings → Change Database** removes only the local encrypted connection configuration and restarts setup; it does not remove MySQL data.

Electron renderer windows use context isolation, sandboxing and narrow preload APIs. React does not receive direct Node.js, filesystem, shell or MySQL access.

## Printing and barcode readers

A standard USB barcode reader should be configured as a USB HID keyboard with Enter/CR after each scan.

In the desktop application, **Settings → Desktop application** can enumerate Windows printers. Select the thermal printer and test with silent printing disabled. A4 documents always use the normal print dialog. Browser mode continues to use a browser print popup.

## Excel backup and restore

Open **Settings → Full Excel backup** to download every table in one `.xlsx` workbook. It contains commercial data and password hashes, so protect it as a database dump.

Restore requires typing `RESTORE`. Before replacing table data, the server writes a safety workbook. In desktop mode it is stored under the app-data backup directory; in browser mode it remains under `backend/backups` unless `POS_DATA_DIR` is configured.

## Product variants

A product can remain a single item or become a family with separately priced, stocked and barcoded variants. Examples include wire length/colour, cable size/core count and bulb wattage/colour. See [PRODUCT_VARIANTS_GUIDE.md](PRODUCT_VARIANTS_GUIDE.md).

## Release information

- [POS_INPUT_DISCOUNT_QUICK_ITEM_RELEASE.md](POS_INPUT_DISCOUNT_QUICK_ITEM_RELEASE.md)
- [DESKTOP_RELEASE_NOTES.md](DESKTOP_RELEASE_NOTES.md)
- [VARIANT_RELEASE_NOTES.md](VARIANT_RELEASE_NOTES.md)
- [VALIDATION.md](VALIDATION.md)
