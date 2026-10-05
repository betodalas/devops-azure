'use strict';

const { randomUUID } = require('crypto');

// In-memory store on purpose: the test explicitly says a real database is
// not required. This keeps the app stateless-ish and trivial to run in
// Docker/Kubernetes without extra dependencies.
const todos = new Map();

function list() {
  return Array.from(todos.values());
}

function create(title) {
  const todo = { id: randomUUID(), title, done: false, createdAt: new Date().toISOString() };
  todos.set(todo.id, todo);
  return todo;
}

function get(id) {
  return todos.get(id);
}

function update(id, patch) {
  const existing = todos.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...patch, id: existing.id };
  todos.set(id, updated);
  return updated;
}

function remove(id) {
  return todos.delete(id);
}

module.exports = { list, create, get, update, remove };
