# MongoDB edition QA report — v2.0.4

## Result

The source-level, unit, authenticated API-flow, API-contract, desktop-setup, configuration-diagnostics, and production-build checks pass after the v2.0.4 verification fixes.

## Authentication and resilience fixes in v2.0.4

- New JWTs use the stable MongoDB document `_id` as their subject while retaining numeric-ID compatibility for older tokens.
- Authentication database failures now reach the central database error handler instead of being incorrectly reported as an invalid token.
- The session endpoint reuses the already verified user and includes role and warehouse associations.
- The frontend keeps the fresh token in memory as well as local storage and verifies `/auth/me` before mounting POS screens.
- Startup migration repairs documents missing a public numeric `id`, preventing older converted users from producing unusable tokens and broken references.
- Added a complete login → token → session → protected POS bootstrap API regression test.
- Desktop logs rotate at 5 MB, and a log-write failure no longer causes an unhandled stream error.

## Node DNS override in v2.0.3

- Added optional `MONGODB_DNS_SERVERS` configuration for Windows systems where a local DNS proxy (for example `127.0.0.1`) refuses Node SRV requests.
- The override is applied before Mongoose loads and affects only the POS Node/Electron process, not Windows network settings.
- DNS server values are validated as IPv4/IPv6 addresses and invalid configuration fails with a clear message.
- The active override is shown as a configuration warning during database checks.

## MongoDB connection fixes in v2.0.2

- Removed working-directory-dependent dotenv loading. The backend now resolves `backend/.env` and the project-root `.env` by absolute path on Windows, macOS, and Linux.
- Defined deterministic precedence: OS/Electron environment, then `backend/.env`, then project-root `.env`, then the local default.
- Made `db:check`, `db:migrate`, and `db:doctor` print the selected configuration source and credential-free MongoDB target.
- Preserved the MongoDB driver's underlying DNS, TLS, authentication, refusal, parse, and timeout details instead of replacing every failure with “unreachable.”
- Added credential redaction to all connection diagnostics.
- Added checks for URI placeholders, whitespace, invalid schemes, invalid percent encoding, illegal SRV ports/multiple hosts, conflicting `.env` files, and unquoted `#` characters.
- Explicitly passes the selected database name to Mongoose, including when an Atlas URI omits its database path.
- Applied the same parser and diagnostics to the Electron first-run MongoDB setup.

## Fixes made during full-system verification

- Restored every declared business field to the generated Mongoose schemas and added a completeness assertion across all models.
- Preserved foreign-key fields required by projected association loads.
- Added MongoDB referential-integrity checks for writes.
- Reproduced restrictive and cascading delete behavior through MongoDB transactions.
- Added missing relationships for purchase units, main-product units, and audit-user fields.
- Corrected association-based report ordering.
- Added missing single-record API routes for users, expenses, and expense categories.
- Closed desktop test connections on all success/failure paths.
- Normalized Mongoose and MongoDB driver connection failures into actionable, secret-safe messages.

## Automated checks

- 72 backend tests passed.
- 4 Electron/desktop tests passed (76 total).
- Every frontend API operation has a matching backend route.
- Express health, authentication boundary, and 404 behavior passed.
- Legacy format-v1 Excel backup parsing and JSON decoding passed.
- MongoDB query translation, association projection, aggregate lookup, schema completeness, payload validation, payments, sales, purchases, returns, stock, product variants, and date handling passed.
- Every backend, Electron, script, and test JavaScript file passed `node --check`.
- The React/Vite production build completed successfully (1,083 modules transformed).
- Runtime source contains no Sequelize/MySQL imports, SQL query calls, or legacy database environment variables.
- The lockfile contains Mongoose 8.24.4 and contains neither Sequelize nor mysql2.
- The packaged ZIP passed archive integrity testing.

## Environment-dependent acceptance still required

This QA environment has no MongoDB replica set and no Windows GUI/printer subsystem. Before production cutover, run `npm run db:setup` against a disposable replica-set/Atlas database, restore a copy of the legacy workbook, and execute the operational checks in `MONGODB_MIGRATION_CHECKLIST.md`. Also test Electron installation, encrypted URI persistence, printing, and a full backup/restore cycle on the target Windows computer.

For the guarded database smoke test, set `TEST_MONGODB_URI` to a disposable replica-set/Atlas database whose name ends in `_test`, then run `npm run test:integration`. The test refuses other database names and drops the test database before and after execution.
