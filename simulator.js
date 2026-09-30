import { TYPES, isSignal } from './components.js';
import { pinKey } from './circuit.js';
// Preserve the original public imports for existing consumers.
export { TYPES } from './components.js';
export { validate } from './circuit.js';
const isBit = value => value === 0 || value === 1;
const invert = value => isBit(value) ? 1 - value : 'X';
export function evaluate(type, inputs, value = 0) {
  const [first, second] = inputs;
  switch (type) {
    case 'INPUT': return value;
    case 'OUTPUT': return first;
    case 'AND':
    case 'NAND': {
      const result = first === 0 || second === 0 ? 0 : first === 1 && second === 1 ? 1 : 'X';
      return type === 'NAND' ? invert(result) : result;
    }
    case 'OR':
    case 'NOR': {
      const result = first === 1 || second === 1 ? 1 : first === 0 && second === 0 ? 0 : 'X';
      return type === 'NOR' ? invert(result) : result;
    }
    case 'XOR': return isBit(first) && isBit(second) ? first ^ second : 'X';
    case 'NOT': return invert(first);
    case 'NMOS':
    case 'PMOS': {
      const enabled = type === 'NMOS' ? 1 : 0;
      return first === enabled ? second : isBit(first) ? 'Z' : 'X';
    }
    default: return 'X';
  }
}
function compileInputs(nodes, wires) {
  const indices = new Map(nodes.map((node, index) => [node.id, index]));
  const drivers = new Map(wires.map(wire => [pinKey(wire.to.node, wire.to.pin), indices.get(wire.from.node)]));
  return nodes.map(node => TYPES[node.type].inputs.map(pin => drivers.get(pinKey(node.id, pin))));
}
function changedSignals(states, current) {
  return new Set(current.flatMap((value, index) => states.some(state => state[index] !== value) ? [index] : []));
}
const sameState = (first, second) => first.every((value, index) => value === second[index]);
export function simulate(nodes, wires, previous = {}) {
  // Resolve wiring once per run, rather than searching pins at every step.
  const inputs = compileInputs(nodes, wires);
  let state = nodes.map(node => node.type === 'INPUT' ? node.value :
    Object.hasOwn(previous, node.id) && isSignal(previous[node.id]) ? previous[node.id] : 'X');
  function propagate(current, frozen) {
    return nodes.map((node, index) => frozen?.has(index) ? 'X' :
      evaluate(node.type, inputs[index].map(source => source === undefined ? 'Z' : current[source]), node.value));
  }
  function result(stable, oscillating = new Set()) {
    return {
      values: Object.fromEntries(nodes.map((node, index) => [node.id, state[index]])),
      stable,
      oscillating: [...oscillating].map(index => nodes[index].id),
    };
  }
  function resolveOscillation(oscillating) {
    state = state.map((value, index) => oscillating.has(index) ? 'X' : value);
    for (let step = 0; step <= nodes.length; step++) {
      const next = propagate(state, oscillating);
      if (sameState(next, state)) {
        break;
      }
      state = next;
    }
    return result(false, oscillating);
  }
  const seen = new Map();
  const states = [];
  const maxSteps = Math.max(32, nodes.length * 4 + 8);
  for (let step = 0; step < maxSteps; step++) {
    const key = state.join(',');
    if (seen.has(key)) {
      return resolveOscillation(changedSignals(states.slice(seen.get(key)), state));
    }
    seen.set(key, states.length);
    states.push(state);
    const next = propagate(state);
    if (sameState(next, state)) {
      state = next;
      return result(true);
    }
    state = next;
  }
  return resolveOscillation(changedSignals(states.slice(-Math.max(2, nodes.length)), state));
}
