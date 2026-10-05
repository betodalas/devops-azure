'use strict';

const pino = require('pino');

// LOG_LEVEL is configurable via env var so we can tune verbosity per environment
// without rebuilding the image.
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { app: process.env.APP_NAME || 'devops-azure-api' },
});

module.exports = logger;
