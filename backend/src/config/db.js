const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'electro_pos',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    dialect: 'mysql',
    logging: false,
    dialectOptions: { connectTimeout: 10000 },
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    define: {
      underscored: true, // snake_case columns, matches the original Laravel schema
      timestamps: true,
    },
    timezone: '+05:30', // Sri Lanka time offset for DATETIME writes
  }
);

module.exports = sequelize;
