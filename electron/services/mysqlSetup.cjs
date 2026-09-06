const crypto = require('node:crypto');

function mysqlClient() {
  return require('mysql2/promise');
}

const DATABASE_NAME_PATTERN = /^[A-Za-z0-9_$-]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_$.-]+$/;

function normalizePort(value) {
  const port = Number(value || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MySQL port must be a number between 1 and 65535.');
  }
  return port;
}

function validateDatabaseName(value) {
  const database = String(value || '').trim();
  if (!database || !DATABASE_NAME_PATTERN.test(database)) {
    throw new Error(
      'Database name may contain only letters, numbers, underscores, dollar signs, and hyphens.'
    );
  }
  return database;
}

function validateUsername(value, label = 'MySQL username') {
  const username = String(value || '').trim();
  if (!username || username.length > 32 || !USERNAME_PATTERN.test(username)) {
    throw new Error(
      `${label} must be 1-32 characters and may contain letters, numbers, _, $, ., and -.`
    );
  }
  return username;
}

function normalizeServerConfig(input = {}, { requireDatabase = false } = {}) {
  const config = {
    host: String(input.host || '127.0.0.1').trim(),
    port: normalizePort(input.port),
    username: validateUsername(input.username || input.adminUsername),
    password: String(input.password ?? input.adminPassword ?? ''),
  };

  if (!config.host || config.host.length > 255) {
    throw new Error('A valid MySQL host name or IP address is required.');
  }

  if (requireDatabase) config.database = validateDatabaseName(input.database);
  return config;
}

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function isLocalHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  return ['127.0.0.1', 'localhost', '::1'].includes(normalized);
}

function createMysqlOptions(config, includeDatabase = false) {
  const options = {
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    connectTimeout: 10000,
    charset: 'utf8mb4',
    multipleStatements: false,
  };
  if (includeDatabase && config.database) options.database = config.database;
  return options;
}

function formatMysqlError(error, config = {}) {
  const code = error?.code || error?.original?.code || error?.parent?.code;
  const host = config.host || 'the configured server';
  const port = config.port || 3306;

  if (code === 'ECONNREFUSED') {
    return `MySQL/MariaDB is not running or cannot be reached at ${host}:${port}. Start MySQL in XAMPP or start the MySQL service, then try again.`;
  }
  if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return `The MySQL server at ${host}:${port} did not respond. Check the server address, network, firewall, and MySQL bind settings.`;
  }
  if (code === 'ER_ACCESS_DENIED_ERROR') {
    return 'MySQL rejected the supplied username or password. Check the account credentials and host permissions.';
  }
  if (code === 'ER_BAD_DB_ERROR') {
    return `The database "${config.database || ''}" does not exist or the account cannot access it.`;
  }
  if (code === 'ER_DBACCESS_DENIED_ERROR' || code === 'ER_TABLEACCESS_DENIED_ERROR') {
    return 'The MySQL account does not have enough permissions for this POS database.';
  }
  if (code === 'ER_SPECIFIC_ACCESS_DENIED_ERROR' || code === 'ER_CANNOT_USER') {
    return 'The supplied MySQL account cannot create or grant a dedicated POS user. Use a MySQL administrator account, or choose “Use the supplied MySQL account”.';
  }
  if (code === 'ER_NOT_SUPPORTED_AUTH_MODE') {
    return 'This MySQL account uses an authentication method that the installed client cannot use. Change the account authentication plugin or create another MySQL user.';
  }
  return error?.message || String(error);
}

async function queryServerInfo(connection) {
  const [rows] = await connection.query(
    'SELECT VERSION() AS version, @@version_comment AS versionComment, @@port AS port'
  );
  const row = rows[0] || {};
  const versionText = `${row.version || ''} ${row.versionComment || ''}`;
  return {
    version: row.version || 'Unknown',
    versionComment: row.versionComment || '',
    port: Number(row.port || 0) || null,
    engine: /mariadb/i.test(versionText) ? 'MariaDB' : 'MySQL',
  };
}

async function testServerConnection(input) {
  const config = normalizeServerConfig(input);
  let connection;
  try {
    connection = await mysqlClient().createConnection(createMysqlOptions(config));
    return { success: true, ...(await queryServerInfo(connection)) };
  } catch (error) {
    const wrapped = new Error(formatMysqlError(error, config));
    wrapped.code = error?.code;
    throw wrapped;
  } finally {
    if (connection) await connection.end();
  }
}

async function testDatabaseConnection(input) {
  const config = normalizeServerConfig(input, { requireDatabase: true });
  let connection;
  try {
    connection = await mysqlClient().createConnection(createMysqlOptions(config, true));
    await connection.query('SELECT 1 AS ok');
    return { success: true, ...(await queryServerInfo(connection)) };
  } catch (error) {
    const wrapped = new Error(formatMysqlError(error, config));
    wrapped.code = error?.code;
    throw wrapped;
  } finally {
    if (connection) await connection.end();
  }
}

function generateApplicationUsername() {
  return `shanthi_pos_${crypto.randomBytes(3).toString('hex')}`;
}

function generateSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

async function createDedicatedUser(connection, { database, serverHost }) {
  const username = generateApplicationUsername();
  const password = generateSecret(24);
  const accountHosts = isLocalHost(serverHost) ? ['localhost', '127.0.0.1'] : ['%'];
  const createdAccounts = [];

  try {
    for (const accountHost of accountHosts) {
      const userValue = connection.escape(username);
      const hostValue = connection.escape(accountHost);
      const passwordValue = connection.escape(password);
      await connection.query(
        `CREATE USER ${userValue}@${hostValue} IDENTIFIED BY ${passwordValue}`
      );
      createdAccounts.push(accountHost);
      await connection.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ` +
          `ON ${quoteIdentifier(database)}.* TO ${userValue}@${hostValue}`
      );
    }
  } catch (error) {
    for (const accountHost of createdAccounts.reverse()) {
      try {
        await connection.query(
          `DROP USER IF EXISTS ${connection.escape(username)}@${connection.escape(accountHost)}`
        );
      } catch {
        // Best-effort cleanup only.
      }
    }
    throw error;
  }

  return { username, password, accountHosts };
}

async function provisionDatabase(input = {}) {
  const admin = normalizeServerConfig(
    {
      host: input.host,
      port: input.port,
      username: input.adminUsername ?? input.username,
      password: input.adminPassword ?? input.password,
    },
    { requireDatabase: false }
  );
  const database = validateDatabaseName(input.database);
  const createDatabase = input.createDatabase !== false;
  const credentialMode = input.credentialMode === 'provided' ? 'provided' : 'dedicated';

  let connection;
  try {
    connection = await mysqlClient().createConnection(createMysqlOptions(admin));
    const serverInfo = await queryServerInfo(connection);

    if (createDatabase) {
      await connection.query(
        `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(database)} ` +
          'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
      );
    } else {
      const [rows] = await connection.query(
        'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
        [database]
      );
      if (!rows.length) {
        const error = new Error(`The database "${database}" does not exist.`);
        error.code = 'ER_BAD_DB_ERROR';
        throw error;
      }
    }

    let applicationCredentials;
    if (credentialMode === 'provided') {
      applicationCredentials = {
        username: admin.username,
        password: admin.password,
        accountHosts: [],
      };
    } else {
      applicationCredentials = await createDedicatedUser(connection, {
        database,
        serverHost: admin.host,
      });
    }

    const appConfig = {
      schemaVersion: 1,
      mode: input.mode === 'xampp' ? 'xampp' : 'mysql',
      host: admin.host,
      port: admin.port,
      database,
      username: applicationCredentials.username,
      password: applicationCredentials.password,
      jwtSecret: generateSecret(48),
    };

    await testDatabaseConnection(appConfig);

    return {
      success: true,
      server: serverInfo,
      appConfig,
      dedicatedUserCreated: credentialMode === 'dedicated',
      accountHosts: applicationCredentials.accountHosts,
    };
  } catch (error) {
    const wrapped = new Error(formatMysqlError(error, { ...admin, database }));
    wrapped.code = error?.code;
    throw wrapped;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  DATABASE_NAME_PATTERN,
  USERNAME_PATTERN,
  normalizePort,
  validateDatabaseName,
  validateUsername,
  normalizeServerConfig,
  quoteIdentifier,
  isLocalHost,
  formatMysqlError,
  testServerConnection,
  testDatabaseConnection,
  provisionDatabase,
  generateSecret,
};
