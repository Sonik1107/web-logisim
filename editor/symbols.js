export function shape(type) {
  if (type === 'INPUT') {
    return '<rect class="body" x="10" y="10" width="50" height="40"/>';
  }
  if (type === 'OUTPUT') {
    return '<path class="body" d="M10 10 H50 L65 30 L50 50 H10 Z"/>';
  }
  if (type === 'NOT') {
    return '<path class="body" d="M10 5 V55 L60 30 Z"/><circle class="body" cx="65" cy="30" r="5"/>';
  }
  if (type === 'NMOS' || type === 'PMOS') {
    return `<path fill="none" stroke="currentColor" stroke-width="2" d="M0 20 H25 M25 8 V50 M34 8 V50 M34 10 H60 V30 H80 M34 45 H50 V60 H5 V40 H0"/>${type === 'PMOS' ? '<circle class="body" cx="20" cy="20" r="4"/>' : ''}<path fill="currentColor" d="${type === 'NMOS' ? 'M45 40 L37 45 L45 50' : 'M38 40 L46 45 L38 50'}"/>`;
  }
  const or = ['OR', 'NOR', 'XOR'].includes(type);
  return `<path class="body" d="${or ? 'M10 5 Q34 30 10 55 Q50 55 65 30 Q50 5 10 5 Z' : 'M10 5 H35 A25 25 0 0 1 35 55 H10 Z'}"/>${type === 'XOR' ? '<path d="M3 5 Q27 30 3 55" fill="none" stroke="currentColor" stroke-width="1.8"/>' : ''}${['NAND', 'NOR'].includes(type) ? '<circle class="body" cx="70" cy="30" r="5"/>' : ''}`;
}
export const color = v => v === 1 ? '#00b000' : v === 0 ? '#006400' : v === 'Z' ? '#999' : '#155acc';
