# MongoDB installation and desktop setup

## Recommended: MongoDB Atlas

1. Create an Atlas cluster.
2. Create a database user with `readWrite` access to the `electro_pos` database.
3. Add the POS computer's public IP to the Atlas network access list.
4. Copy the Node.js connection URI, including `mongodb+srv://`.
5. Launch the POS, paste the URI, enter `electro_pos`, test the connection, and create the first POS administrator.

The desktop application encrypts the URI and JWT secret with the operating system credential store.

## Local MongoDB on Windows

The POS requires a replica set for transactions. After installing MongoDB Community Server:

1. Add `replication.replSetName: rs0` to `mongod.cfg`.
2. Restart the MongoDB Windows service.
3. Run `mongosh --eval "rs.initiate()"` once.
4. Wait for the member to become PRIMARY.
5. Use `mongodb://127.0.0.1:27017/electro_pos?replicaSet=rs0`.

For a LAN server, enable authentication, TLS where possible, least-privilege database users, and restrictive firewall rules. Do not expose port 27017 directly to the public internet.

## Troubleshooting

- “Server selection timed out”: check that MongoDB is running, the hostname resolves, the firewall allows traffic, and the Atlas IP list includes this computer.
- “Authentication failed”: check URI credentials and `authSource`; URL-encode reserved characters.
- “Transaction support required”: use Atlas or initialize a replica set. A standalone server is not supported.
- DNS errors with `mongodb+srv://`: verify internet/DNS access or use Atlas's standard connection string.

Settings → Desktop application → Change Database deletes only the encrypted connection configuration and restarts setup. It does not delete MongoDB data.
