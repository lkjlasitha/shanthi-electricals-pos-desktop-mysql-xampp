async function startDesktopServer({ frontendDirectory, bootstrapAdmin } = {}) {
  if (!frontendDirectory) throw new Error('The frontend build directory is required.');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured before the desktop backend starts.');

  // These modules must be loaded only after Electron applies the saved database
  // configuration to process.env. MongoDB models share the configured client.
  const sequelize = require('./config/db');
  require('./models/associations');
  const { migrateSchema } = require('./config/schemaMigrator');
  const { bootstrapShopData } = require('./services/bootstrapService');
  const { createApp } = require('./app');

  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: false });
    await migrateSchema({ verbose: true });
    await bootstrapShopData({ admin: bootstrapAdmin, requireAdmin: true });
  } catch (error) {
    try {
      await sequelize.close();
    } catch {
      // Preserve the original startup error.
    }
    throw error;
  }

  const expressApp = createApp({
    frontendDirectory,
    enableCors: false,
    logFormat: process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
  });

  return new Promise((resolve, reject) => {
    const server = expressApp.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        port: address.port,
        async close() {
          await new Promise((done) => server.close(done));
          await sequelize.close();
        },
      });
    });

    server.once('error', async (error) => {
      try {
        await sequelize.close();
      } catch {
        // Preserve the listener error.
      }
      reject(error);
    });
  });
}

module.exports = { startDesktopServer };
