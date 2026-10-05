'use strict';

const express = require('express');
const store = require('./todosStore');

const router = express.Router();

router.get('/todos', (req, res) => {
  res.json(store.list());
});

router.post('/todos', (req, res) => {
  const { title } = req.body || {};
  if (!title || typeof title !== 'string') {
    req.log.warn({ body: req.body }, 'ERROR validation_failed creating todo');
    return res.status(400).json({ error: 'title is required' });
  }
  const todo = store.create(title);
  return res.status(201).json(todo);
});

router.get('/todos/:id', (req, res) => {
  const todo = store.get(req.params.id);
  if (!todo) {
    req.log.info({ id: req.params.id }, 'todo not found');
    return res.status(404).json({ error: 'not found' });
  }
  return res.json(todo);
});

router.put('/todos/:id', (req, res) => {
  const todo = store.update(req.params.id, req.body || {});
  if (!todo) return res.status(404).json({ error: 'not found' });
  return res.json(todo);
});

router.delete('/todos/:id', (req, res) => {
  const removed = store.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  return res.status(204).end();
});

// Demonstrates reading a Secret-backed env var: a trivial admin endpoint
// gated by a shared token instead of hardcoding credentials in the image.
router.get('/admin/stats', (req, res) => {
  const expected = process.env.ADMIN_TOKEN;
  const provided = req.get('x-admin-token');
  if (!expected || provided !== expected) {
    req.log.warn('ERROR unauthorized admin access attempt');
    return res.status(401).json({ error: 'unauthorized' });
  }
  return res.json({ totalTodos: store.list().length });
});

// Endpoint used to demo error logs for the automation script / log dashboards.
router.get('/boom', (req, res) => {
  req.log.error({ route: '/boom' }, 'ERROR simulated failure for demo purposes');
  res.status(500).json({ error: 'simulated internal error' });
});

module.exports = router;
