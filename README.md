# Shanthi Electricals POS — Electron + React + Express + MongoDB

A point-of-sale, inventory, purchasing, quotation, returns, customer-credit and reporting system for Shanthi Electricals. It runs in a browser during development and as a Windows Electron desktop application.

## Architecture

```text
frontend/       React and Vite user interface
backend/        Express API and MongoDB document model layer
electron/       Windows desktop shell and encrypted MongoDB setup
scripts/        Development launcher
```

The frontend API and its numeric record IDs remain compatible with earlier releases. Data is now stored in MongoDB collections. SQL, Sequelize, MySQL, MariaDB and XAMPP are not runtime dependencies.

## MongoDB requirement

Inventory, sales, payments, purchases, transfers, returns and restores use multi-document transactions. Connect to one of:

- MongoDB Atlas;
- a MongoDB replica set; or
- a sharded MongoDB cluster through `mongos`.

A standalone `mongod` is intentionally rejected because it cannot provide the transaction guarantees required by the POS.

## Browser development

1. Copy `backend/.env.example` to `backend/.env`.
2. Set `MONGODB_URI`, `MONGODB_DB` and a strong `JWT_SECRET`.
3. Install and start:

```bash
npm install
npm run db:setup
npm run dev
```

Frontend: `http://localhost:5173`  
API: `http://localhost:4000`

Useful commands:

```bash
npm run db:check       # connect and ping MongoDB
npm run db:migrate     # create collections, indexes and defaults
npm run db:doctor      # inspect collections and indexes
npm run seed           # create default shop data and first admin
npm test               # backend and desktop setup tests
npm run build          # production frontend build
npm run verify         # tests plus frontend build
```

## Desktop setup

On first launch, enter a MongoDB URI and database name, then create the first POS administrator. The URI and generated JWT secret are encrypted with Electron `safeStorage`; credentials are never exposed to the React renderer. See `MONGODB_INSTALLATION.md`.

Build the Windows installer on Windows:

```powershell
npm install
npm run desktop:make:win
```

## Migrating existing MySQL data

Use the earlier POS release to download a full Excel backup, then restore that workbook in this MongoDB release. Backup format v1 is accepted and converted to MongoDB documents while preserving numeric IDs and relationships. Follow `MONGODB_MIGRATION.md` and keep the automatically generated pre-restore safety backup.

## Backup and restore

Settings can export all application collections to one `.xlsx` workbook. Restore is transactional and accepts current MongoDB backups plus legacy MySQL-format v1 workbooks. Backups contain business data and password hashes; store them securely.

## Environment variables

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/electro_pos?replicaSet=rs0
MONGODB_DB=electro_pos
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=12h
```

Atlas URIs beginning with `mongodb+srv://` are supported. Put credentials in the URI and URL-encode reserved characters in usernames or passwords.

## Security and operations

- Grant the MongoDB application user `readWrite` only on the POS database.
- Restrict Atlas network access or firewall rules to trusted POS computers.
- Use TLS for remote MongoDB connections.
- Keep regular MongoDB snapshots in addition to application Excel backups.
- The “Change Database” action removes only the encrypted local connection file; it never deletes database data.
