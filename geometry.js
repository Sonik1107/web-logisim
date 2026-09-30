import { TYPES } from './components.js';
import { pinKey } from './circuit.js';
export const GRID = 10;
export const snap = value => Math.round(value / GRID) * GRID;
export function localPin(node, pin, output = false) {
  if (output) {
    return { x: 80, y: 30 };
  }
  const inputs = TYPES[node.type].inputs;
  return { x: 0, y: inputs.length === 1 ? 30 : pin === inputs[0] ? 20 : 40 };
}
export function pinPoint(nodes, reference, output = false) {
  const node = nodes instanceof Map ? nodes.get(reference.node) : nodes.find(node => node.id === reference.node);
  const position = localPin(node, reference.pin, output);
  return { x: node.x + position.x, y: node.y + position.y };
}
export function route(source, target, points = []) {
  const vertices = [source];
  let previous = source;
  for (const point of points) {
    vertices.push({ x: point.x, y: previous.y }, { ...point });
    previous = point;
  }
  const middle = snap((previous.x + target.x) / 2);
  vertices.push({ x: middle, y: previous.y }, { x: middle, y: target.y }, target);
  return vertices.filter((point, index) => index === 0 ||
    point.x !== vertices[index - 1].x || point.y !== vertices[index - 1].y);
}
export const pathFor = points => points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ');
export function nearestPoint(points, target) {
  let nearest = { distance: Infinity, index: 0, point: points[0] };
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1], end = points[index];
    const dx = end.x - start.x, dy = end.y - start.y;
    const projection = ((target.x - start.x) * dx + (target.y - start.y) * dy) / (dx * dx + dy * dy || 1);
    const fraction = Math.max(0, Math.min(1, projection));
    const point = { x: start.x + fraction * dx, y: start.y + fraction * dy };
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance < nearest.distance) {
      nearest = { distance, index, point };
    }
  }
  return nearest;
}
function addSegment(index, coordinate, first, second) {
  if (!index.has(coordinate)) {
    index.set(coordinate, []);
  }
  index.get(coordinate).push({ min: Math.min(first, second), max: Math.max(first, second) });
}
function directionsAt(segments = [], position) {
  let directions = 0;
  for (const segment of segments) {
    if (position < segment.min || position > segment.max) {
      continue;
    }
    if (position > segment.min) {
      directions |= 1;
    }
    if (position < segment.max) {
      directions |= 2;
    }
    if (directions === 3) {
      break;
    }
  }
  return directions;
}
function sourceJunctions(wires) {
  const candidates = new Map(), horizontal = new Map(), vertical = new Map();
  for (const wire of wires) {
    for (const point of wire.route) {
      candidates.set(`${point.x},${point.y}`, point);
    }
    for (let index = 1; index < wire.route.length; index++) {
      const start = wire.route[index - 1], end = wire.route[index];
      if (start.y === end.y) {
        addSegment(horizontal, start.y, start.x, end.x);
      }
      if (start.x === end.x) {
        addSegment(vertical, start.x, start.y, end.y);
      }
    }
  }
  const result = [];
  for (const point of candidates.values()) {
    const xDirections = directionsAt(horizontal.get(point.y), point.x);
    const yDirections = directionsAt(vertical.get(point.x), point.y);
    if ((xDirections === 3 && yDirections !== 0) || (yDirections === 3 && xDirections !== 0)) {
      result.push({ ...point, source: wires[0].from.node });
    }
  }
  return result;
}
// Only shared sources can form a junction. Line indices avoid scanning every
// route segment for each candidate vertex on unrelated rows and columns.
export function junctions(wires) {
  const groups = new Map();
  for (const wire of wires) {
    const key = pinKey(wire.from.node, wire.from.pin);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(wire);
  }
  return [...groups.values()].filter(group => group.length > 1).flatMap(sourceJunctions);
}
