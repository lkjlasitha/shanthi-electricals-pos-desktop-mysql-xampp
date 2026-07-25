const mysql = require('mysql2/promise');
require('dotenv').config();

function getDatabaseConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'electro_pos',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  };
}

function formatDatabaseError(error) {
  const config = getDatabaseConfig();
  const code = error?.original?.code || error?.parent?.code || error?.code;

  if (code === 'ECONNREFUSED') {
    return [
      `MySQL/MariaDB is not reachable at ${config.host}:${config.port}.`,
      'Start the MySQL/MariaDB Windows service (or start MySQL in XAMPP/WAMP),',
      'then confirm DB_HOST, DB_PORT, DB_USER, and DB_PASSWORD in backend/.env.',
    ].join(' ');
  }

  if (code === 'ER_ACCESS_DENIED_ERROR') {
    return [
      `MySQL rejected the user "${config.user}".`,
      'Update DB_USER and DB_PASSWORD in backend/.env with valid credentials.',
    ].join(' ');
  }

  if (code === 'ER_BAD_DB_ERROR') {
    return [
      `Database "${config.database}" does not exist and could not be selected.`,
      'Create it manually or use a MySQL account with CREATE DATABASE permission.',
    ].join(' ');
  }

  return error?.message || String(error);
}

function shouldAutoCreateDatabase() {
  if (process.env.AUTO_CREATE_DATABASE !== undefined) {
    return String(process.env.AUTO_CREATE_DATABASE).toLowerCase() === 'true';
  }
  return process.env.NODE_ENV !== 'production';
}

async function ensureDatabaseExists() {
  const config = getDatabaseConfig();

  if (!shouldAutoCreateDatabase()) return;

  if (!/^[A-Za-z0-9_$-]+$/.test(config.database)) {
    throw new Error(
      'DB_NAME may contain only letters, numbers, underscores, dollar signs, and hyphens.'
    );
  }

  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    connectTimeout: 10000,
  });

  try {
    const escapedName = `\`${config.database.replace(/`/g, '``')}\``;
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${escapedName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await connection.end();
  }
}

module.exports = {
  ensureDatabaseExists,
  formatDatabaseError,
  getDatabaseConfig,
  shouldAutoCreateDatabase,
};
