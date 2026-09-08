# Printing and MongoDB backup guide

## Printing

Invoices, quotations, purchase documents, returns, transfers, and adjustments can be printed or downloaded from their document actions. Desktop printing is performed in an isolated Electron window; browser printing uses the normal browser dialog.

## Excel backup

Use **Settings → Backup → Export** to generate one `.xlsx` workbook containing metadata and one worksheet per MongoDB application collection. The workbook contains business data and password hashes, so store it securely.

Restore validates the workbook's application marker, format, collection map, and completeness before changing data. It then:

1. Creates a timestamped safety backup.
2. Opens a MongoDB transaction.
3. Clears the application collections.
4. Inserts all workbook rows and restores their numeric IDs.
5. Synchronizes atomic ID counters.
6. Commits everything together or rolls everything back on failure.

The MongoDB edition accepts format-v2 backups and the format-v1 workbooks exported by the former SQL edition. Do not edit workbook values or worksheet names before restore.

Excel backups are intended for portable application-level recovery and migration. Also configure scheduled MongoDB snapshots/provider backups and regularly test restoration against a non-production database.
