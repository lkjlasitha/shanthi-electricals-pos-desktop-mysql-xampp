# Validation — v1.5.0

Completed in the delivery environment:

- Backend and Electron JavaScript syntax checks passed.
- All frontend JavaScript/JSX files parsed successfully with the TypeScript parser.
- All frontend relative imports resolve.
- Package JSON files parse successfully.
- Focused sale-line and schema-migration tests passed, including temporary price, tax-aware profit, server-authoritative cost, manual-item handling, and migration columns.
- The release archive passed ZIP integrity testing.

Not executable in this environment:

- `npm install` and the full Vite/Electron build, because the available npm registry does not contain the project dependencies.
- Live MySQL/XAMPP migration and checkout.
- Windows installer creation and GUI/printer acceptance testing.

Run `npm install`, `npm run verify`, and the acceptance steps in `UPGRADE_TO_V1.5.0.md` on the Windows build machine before production rollout.
