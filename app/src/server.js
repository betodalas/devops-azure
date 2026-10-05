'use strict';

const express = require('express');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const { register, metricsMiddleware } = require('./metrics');
const routes = require('./routes');

const app = express();

// All runtime behaviour is configurable via env vars, as required for the
// 12-factor style container (see ConfigMap/Secret in k8s/).
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(pinoHttp({ logger }));
app.use(metricsMiddleware);

// Liveness: process is up and able to answer HTTP requests.
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness: separate from liveness so Kubernetes can take the pod out of
// the Service endpoints without restarting it (e.g. during warm-up).
let ready = false;
setTimeout(() => {
  ready = true;
}, 2000);

app.get('/ready', (req, res) => {
  if (!ready) return res.status(503).json({ status: 'starting' });
  return res.status(200).json({ status: 'ready' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  req.log.error({ err }, 'ERROR unhandled exception');
  res.status(500).json({ error: 'internal server error' });
});

// Only bind a port when this file is run directly (node src/server.js /
// Docker CMD). This keeps the app importable/testable without side effects.
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'server started');
  });
}

module.exports = app;
