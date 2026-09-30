export const TYPES = {
  INPUT: { name: 'Вход', group: 'ВХОДЫ И ВЫХОДЫ', inputs: [], outputs: ['out'] },
  OUTPUT: { name: 'Выход', group: 'ВХОДЫ И ВЫХОДЫ', inputs: ['in'], outputs: [] },
  AND: { name: 'AND', group: 'ЛОГИЧЕСКИЕ ВЕНТИЛИ', inputs: ['a', 'b'], outputs: ['out'] },
  OR: { name: 'OR', group: 'ЛОГИЧЕСКИЕ ВЕНТИЛИ', inputs: ['a', 'b'], outputs: ['out'] },
  XOR: { name: 'XOR', group: 'ЛОГИЧЕСКИЕ ВЕНТИЛИ', inputs: ['a', 'b'], outputs: ['out'] },
  NOT: { name: 'NOT', group: 'ЛОГИЧЕСКИЕ ВЕНТИЛИ', inputs: ['in'], outputs: ['out'] },
  NAND: { name: 'NAND', group: 'ЛОГИЧЕСКИЕ ВЕНТИЛИ', inputs: ['a', 'b'], outputs: ['out'] },
  NOR: { name: 'NOR', group: 'ЛОГИЧЕСКИЕ ВЕНТИЛИ', inputs: ['a', 'b'], outputs: ['out'] },
  NMOS: { name: 'n-MOS', group: 'ТРАНЗИСТОРЫ', inputs: ['gate', 'source'], outputs: ['out'] },
  PMOS: { name: 'p-MOS', group: 'ТРАНЗИСТОРЫ', inputs: ['gate', 'source'], outputs: ['out'] }
};
export const SIGNALS = [0, 1, 'X', 'Z'];
export const isSignal = value => SIGNALS.includes(value);
