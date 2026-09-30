import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History } from '../editor/history.js';
import { loadDocument, saveDocument, readDocument } from '../editor/storage.js';
import { toDocument, fromDocument, validate } from '../circuit.js';
import { rsLatch } from '../examples.js';
import { simulate } from '../simulator.js';
import { shortcutKey } from '../editor/shortcuts.js';
function setLatch() {
  const model = rsLatch();
  model.nodes.find(node => node.id === 'r').value = 0;
  model.nodes.find(node => node.id === 's').value = 1;
  let values = simulate(model.nodes, model.wires).values;
  model.nodes.find(node => node.id === 's').value = 0;
  values = simulate(model.nodes, model.wires, values).values;
  return { model, values };
}
test('history restores independent circuit and latch-state snapshots', () => {
  const history = new History();
  let current = setLatch();
  assert.equal(current.values.q, 1);
  history.checkpoint(current);
  current.model.nodes.find(node => node.id === 'r').value = 1;
  current.values = simulate(current.model.nodes, current.model.wires, current.values).values;
  assert.equal(current.values.q, 0);
  current = history.undo(current);
  assert.equal(current.values.q, 1);
  assert.equal(current.model.nodes.find(node => node.id === 'r').value, 0);
  current = history.redo(current);
  assert.equal(current.values.q, 0);
  assert.equal(current.model.nodes.find(node => node.id === 'r').value, 1);
});
test('new edits invalidate redo; history respects its limit', () => {
  const history = new History(2);
  history.checkpoint({ value: 0 });
  history.checkpoint({ value: 1 });
  history.checkpoint({ value: 2 });
  let state = history.undo({ value: 3 });
  assert.deepEqual(state, { value: 2 });
  state = history.undo(state);
  assert.deepEqual(state, { value: 1 });
  assert.equal(history.undo(state), null);
  assert.equal(history.canRedo, true);
  history.checkpoint(state);
  assert.equal(history.canRedo, false);
});
test('storage round-trip preserves feedback state and omits deleted signals', () => {
  const memory = new Map();
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  assert.equal(loadDocument(storage), null);
  const current = setLatch();
  current.values.deleted = 1;
  saveDocument(storage, toDocument(current.model, current.values));
  const restored = fromDocument(loadDocument(storage));
  assert.equal(Object.hasOwn(restored.values, 'deleted'), false);
  assert.equal(simulate(restored.model.nodes, restored.model.wires, restored.values).values.q, 1);
});
test('malformed files are rejected before replacing the current circuit', async () => {
  await assert.rejects(readDocument({ size: 2000001 }), /2 МБ/);
  await assert.rejects(readDocument({ size: 2, text: async () => '{}' }), /формат/);
  const legacy = rsLatch();
  assert.deepEqual(fromDocument(legacy).values, {});
  assert.throws(() => validate({ ...legacy, nodes: [null] }), /компонент/);
  assert.throws(() => validate({ ...legacy, wires: [null] }), /соединение/);
});
test('shortcuts follow the physical key, not the active keyboard layout', () => {
  // A Russian layout prints Cyrillic letters; the physical key still decides the shortcut.
  assert.equal(shortcutKey({ code: 'KeyZ', key: 'я' }), 'z');
  assert.equal(shortcutKey({ code: 'KeyY', key: 'н' }), 'y');
  assert.equal(shortcutKey({ code: 'KeyS', key: 'ы' }), 's');
  assert.equal(shortcutKey({ code: 'KeyN', key: 'т' }), 'n');
  assert.equal(shortcutKey({ code: 'KeyZ', key: 'Z' }), 'z');
  assert.equal(shortcutKey({ code: 'Digit3', key: '3' }), '3');
  // Input methods that report no physical code at all still resolve.
  assert.equal(shortcutKey({ key: 'я' }), 'z');
  assert.equal(shortcutKey({ key: 'Я' }), 'z');
  assert.equal(shortcutKey({ key: 'н' }), 'y');
  assert.equal(shortcutKey({ key: 'ы' }), 's');
  assert.equal(shortcutKey({ key: 'т' }), 'n');
  assert.equal(shortcutKey({ key: '/' }), '/');
  assert.equal(shortcutKey({ key: '.' }), '/');
  assert.equal(shortcutKey({ code: 'KeyZ', key: 'z' }), 'z');
});
test('render scheduling batches pointer moves and flushes the final frame', async () => {
  const { createRenderScheduler } = await import('../editor/render-scheduler.js');
  const queued = new Map();
  let nextId = 0, renders = 0;
  const scheduler = createRenderScheduler(() => renders++, callback => {
    queued.set(++nextId, callback);
    return nextId;
  }, id => queued.delete(id));
  scheduler.schedule();
  scheduler.schedule();
  scheduler.schedule();
  assert.equal(queued.size, 1);
  scheduler.flush();
  assert.equal(renders, 1);
  assert.equal(queued.size, 0);
  scheduler.flush();
  assert.equal(renders, 1);
  scheduler.schedule();
  scheduler.cancel();
  assert.equal(queued.size, 0);
  assert.equal(renders, 1);
});
