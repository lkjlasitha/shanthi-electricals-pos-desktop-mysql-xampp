# Migrating an existing MySQL POS database to MongoDB

1. In the old MySQL-based release, open Settings and download a complete Excel backup.
2. Keep a normal MySQL server backup as an additional rollback point.
3. Install this MongoDB release and connect it to an empty MongoDB database.
4. Sign in, open Settings, and restore the Excel workbook.
5. Verify users, products, stock by warehouse, customers, suppliers, purchases, sales, returns, quotations, expenses and reports.
6. Create a new Excel backup from MongoDB and retain it with the migration records.

The restore accepts legacy backup format v1, preserves existing numeric IDs and foreign-key values, converts JSON cells to MongoDB objects, and realigns the ID counters. Restore runs as a MongoDB transaction, so the target must support transactions.

Do not point the new application at a production database until the verification run succeeds on a disposable database.
