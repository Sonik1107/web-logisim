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
// Bounds of the drawn symbol, matching the selection rectangle in the renderer.
export const NODE_BOX = { left: -8, top: -22, width: 96, height: 94 };
export function boxOf(start, end) {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
}
export function nodeBox(node) {
  return {
    left: node.x + NODE_BOX.left,
    top: node.y + NODE_BOX.top,
    right: node.x + NODE_BOX.left + NODE_BOX.width,
    bottom: node.y + NODE_BOX.top + NODE_BOX.height,
  };
}
export const boxContains = (box, x, y) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
// Selection captures components whole; a wire is taken when a corner of its route lands inside.
export function selectInBox(model, box) {
  const nodes = model.nodes.filter(node => {
    const own = nodeBox(node);
    return own.left >= box.left && own.right <= box.right && own.top >= box.top && own.bottom <= box.bottom;
  }).map(node => node.id);
  const wires = model.wires.filter(wire => {
    if (!model.nodes.some(node => node.id === wire.from.node)) {
      return false;
    }
    return route(pinPoint(model.nodes, wire.from, true), pinPoint(model.nodes, wire.to), wire.points)
      .some(point => boxContains(box, point.x, point.y));
  }).map(wire => wire.id);
  return { nodes, wires };
}
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
