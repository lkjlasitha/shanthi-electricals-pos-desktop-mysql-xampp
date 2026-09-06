# Shanthi Electricals Printing, Downloads and Backup Guide

## Document output

The Laravel project's invoice/quotation approach was used as the functional reference: business identity, reference/date/status, customer or supplier information, line items, tax/discount/shipping totals, payment totals, notes and a footer.

The Node implementation provides:

| Workflow | Browser print | PDF download |
|---|---:|---:|
| POS sale | 80 mm receipt | 80 mm receipt and A4 invoice |
| Sales history | 80 mm receipt | 80 mm receipt and A4 invoice |
| Quotation | A4 | A4 |
| Purchase | A4 | A4 |
| Sale return | A4 credit note | A4 |
| Purchase return | A4 | A4 |
| Stock transfer | A4 transfer note | A4 |
| Stock adjustment | A4 adjustment note | A4 |
| Reports | A4/landscape table | PDF and Excel |

Document business information is controlled from **Settings**. No browser-generated PDF library is required: backend PDFs use PDFKit, while browser print views use a dedicated print-only HTML layout.

## Full Excel backup

`GET /api/backup/export` creates an Excel workbook with:

- A `_shanthi_backup` metadata worksheet.
- A table-to-worksheet map.
- One worksheet per MySQL base table.
- Original primary keys, foreign keys, timestamps, settings, stock, transactions, users and password hashes.

Only a user with `settings.manage` permission can export or restore a backup.

## Restore safety

`POST /api/backup/import` accepts one `.xlsx` file up to 50 MB and requires the confirmation value `RESTORE`.

Before replacing data, the backend writes an automatic workbook to `backend/backups/pre-restore-<timestamp>.xlsx`. The restore then:

1. Validates the application marker and backup format version.
2. Validates every mapped worksheet and requires the backup table set to match the current database schema.
3. Starts a database transaction.
4. Temporarily disables foreign-key checks on that transaction's MySQL connection.
5. Clears and repopulates the backed-up tables while preserving IDs.
6. Re-enables foreign-key checks in a `finally` block.
7. Commits only when every table succeeds.

Do not treat Excel backup as the only production disaster-recovery mechanism. Keep scheduled MySQL backups as well.
