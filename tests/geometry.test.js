import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route, junctions } from '../geometry.js';
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
test('T branch gets a dot; an unrelated crossing does not', () => {
  const from = { node: 'input', pin: 'out' };
  const trunk = { from, route: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  const branch = { from, route: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }] };
  assert.deepEqual(junctions([trunk, branch]), [{ x: 50, y: 0, source: 'input' }]);
  assert.deepEqual(junctions([trunk, { ...branch, from: { node: 'other', pin: 'out' } }]), []);
});
