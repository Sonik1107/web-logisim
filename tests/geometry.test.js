import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route, junctions, boxOf, nodeBox, selectInBox } from '../geometry.js';
test('routes stay orthogonal through user points and terminate at both pins', () => {
  const a = { x: 10, y: 20 }, b = { x: 300, y: 50 }, points = [{ x: 200, y: 100 }, { x: 100, y: 150 }];
  const path = route(a, b, points);
  assert.deepEqual(path[0], a);
  assert.deepEqual(path.at(-1), b);
  for (let i = 1; i < path.length; i++) {
    assert.ok(path[i].x === path[i - 1].x || path[i].y === path[i - 1].y);
  }
  for (const p of points) {
    assert.ok(path.some(q => q.x === p.x && q.y === p.y));
  }
});
test('a selection box is built from either drag direction', () => {
  assert.deepEqual(boxOf({ x: 40, y: 30 }, { x: 10, y: 90 }), { left: 10, top: 30, right: 40, bottom: 90 });
  assert.deepEqual(boxOf({ x: 10, y: 90 }, { x: 40, y: 30 }), { left: 10, top: 30, right: 40, bottom: 90 });
});
test('a selection box takes whole components and touching wires', () => {
  const model = {
    nodes: [
      { id: 'a', type: 'NOT', x: 0, y: 0 },
      { id: 'b', type: 'NOT', x: 300, y: 300 },
    ],
    wires: [{ id: 'w', from: { node: 'a', pin: 'out' }, to: { node: 'b', pin: 'in' } }],
  };
  const inside = nodeBox(model.nodes[0]);
  assert.deepEqual(selectInBox(model, inside), { nodes: ['a'], wires: ['w'] });
  // Half a component inside the box is not enough, and the box misses the wire route.
  const partial = boxOf({ x: inside.left - 20, y: inside.top }, { x: inside.left + 40, y: inside.bottom });
  assert.deepEqual(selectInBox(model, partial), { nodes: [], wires: [] });
  // A box far away selects nothing.
  assert.deepEqual(selectInBox(model, boxOf({ x: 1000, y: 1000 }, { x: 1100, y: 1100 })), { nodes: [], wires: [] });
});
test('T branch gets a dot; an unrelated crossing does not', () => {
  const from = { node: 'input', pin: 'out' };
  const trunk = { from, route: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  const branch = { from, route: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }] };
  assert.deepEqual(junctions([trunk, branch]), [{ x: 50, y: 0, source: 'input' }]);
  assert.deepEqual(junctions([trunk, { ...branch, from: { node: 'other', pin: 'out' } }]), []);
});
