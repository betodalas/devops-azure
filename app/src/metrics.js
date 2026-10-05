'use strict';

const client = require('prom-client');

// Collect Node.js default metrics (CPU, memory, event loop lag, etc.) so we
// have at least one metric visible in Grafana/Prometheus out of the box.
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});
register.registerMetric(httpRequestDuration);

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});
register.registerMetric(httpRequestsTotal);

function metricsMiddleware(req, res, next) {
  const start = process.hrtime();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    const [seconds, nanoseconds] = process.hrtime(start);
    httpRequestDuration.observe(labels, seconds + nanoseconds / 1e9);
    httpRequestsTotal.inc(labels);
  });
  next();
}

module.exports = { register, metricsMiddleware };
