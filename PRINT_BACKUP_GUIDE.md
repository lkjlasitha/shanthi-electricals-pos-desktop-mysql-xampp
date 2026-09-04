# Printing, backup and restore

## Printing

Invoices, receipts, quotations, purchases, returns, transfers and adjustments use the desktop print bridge when running in Electron and browser printing during development. Print previews contain business settings and the document's historical line-item values.

## Excel backup

Settings can download one `.xlsx` workbook containing:

- one worksheet per MongoDB application collection;
- numeric IDs and relationship fields;
- timestamps, settings, stock, users and password hashes;
- JSON objects encoded in a reversible form; and
- a metadata worksheet describing the backup version and collection map.

Treat the workbook as sensitive. It contains complete business data and authentication hashes.

## Restore

Restore validates the application identifier, version, collection map and required collection coverage before changing data. It then:

1. creates a server-side pre-restore safety workbook;
2. starts a MongoDB transaction;
3. clears application collections;
4. inserts every validated worksheet;
5. commits all changes together; and
6. realigns numeric ID counters and document defaults.

Legacy MySQL backup format v1 is accepted for migration. Current MongoDB backups use format v2.

MongoDB Atlas, a replica set or a sharded deployment is required because restore and business workflows rely on multi-document transactions. Keep scheduled MongoDB snapshots as well as Excel backups.
