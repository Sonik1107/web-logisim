const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const markupCache = new WeakMap();
const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHTML = value => String(value).replace(/[&<>"']/g, char => HTML_ENTITIES[char]);
export function createElementCache() {
  const elements = new Map();
  return selector => {
    if (!elements.has(selector)) {
      elements.set(selector, document.querySelector(selector));
    }
    return elements.get(selector);
  };
}
export function setHTML(element, markup) {
  if (markupCache.get(element) === markup) {
    return;
  }
  element.innerHTML = markup;
  markupCache.set(element, markup);
}
// Stable wrappers keep unaffected SVG nodes alive during edits and input changes.
export function keyedLayer(layer) {
  const elements = new Map();
  return (items, keyFor, markupFor) => {
    const active = new Set();
    let cursor = layer.firstChild;
    for (const item of items) {
      const key = keyFor(item);
      active.add(key);
      let element = elements.get(key);
      if (!element) {
        element = document.createElementNS(SVG_NAMESPACE, 'g');
        elements.set(key, element);
      }
      if (element !== cursor) {
        layer.insertBefore(element, cursor);
      }
      cursor = element.nextSibling;
      setHTML(element, markupFor(item));
    }
    for (const [key, element] of elements) {
      if (active.has(key)) {
        continue;
      }
      element.remove();
      elements.delete(key);
    }
  };
}
