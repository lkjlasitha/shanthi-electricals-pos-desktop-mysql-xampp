const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

function createApp({ frontendDirectory, enableCors = false, logFormat = 'dev' } = {}) {
  const app = express();

  if (enableCors) app.use(cors());
  app.use(express.json({ limit: '15mb' }));
  app.use(morgan(logFormat));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'shanthi-electricals-backend' });
  });

  app.use('/api', routes);

  if (frontendDirectory) {
    app.use(express.static(frontendDirectory));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/health') return next();
      return res.sendFile(path.join(frontendDirectory, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
