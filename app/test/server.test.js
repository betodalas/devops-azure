'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.PORT = '0';
const app = require('../src/server');

function request(server, path) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    http
      .get({ host: '127.0.0.1', port, path }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      })
      .on('error', reject);
  });
}

test('GET /health returns 200', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const res = await request(server, '/health');
  assert.strictEqual(res.status, 200);
});

test('GET /api/todos returns an array', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const res = await request(server, '/api/todos');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(JSON.parse(res.body), []);
});
