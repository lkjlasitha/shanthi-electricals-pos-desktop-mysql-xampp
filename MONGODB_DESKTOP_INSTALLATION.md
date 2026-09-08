# MongoDB desktop deployment

The Windows desktop package does not embed a database server. Connect it to MongoDB Atlas or to a MongoDB replica set managed on the shop network.

## Recommended: MongoDB Atlas

1. Create a cluster and a database user limited to the `electro_pos` database.
2. Add only the shop's fixed public IP/VPN range to the network access list.
3. Copy the `mongodb+srv://` URI, add the database name `electro_pos`, and keep TLS enabled.
4. Open the POS and paste the URI into first-run setup.
5. Test the connection, create the first POS administrator, and complete setup.

## Local/network deployment

Use a MongoDB replica set—even for one server—because the POS relies on multi-document transactions. Bind only to the required interfaces, enable authentication, restrict the firewall, and use a URI such as:

```text
mongodb://pos_user:PASSWORD@db-host:27017/electro_pos?replicaSet=rs0&authSource=electro_pos
```

The application stores the URI encrypted for the current Windows user. **Settings → Change Database** deletes only that local encrypted configuration; it does not delete MongoDB data.

After setup, run backup/restore acceptance tests and configure both scheduled POS Excel backups and MongoDB snapshots.
