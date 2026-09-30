// Shortcuts must work on any keyboard layout: a Russian user must still get Ctrl+Z undo.

const CYRILLIC_SHORTCUTS = { 'я': 'z', 'н': 'y', 'ы': 's', 'т': 'n', 'ю': '/', '.': '/' };

// Resolves a keyboard event to the shortcut letter it stands for. The physical key wins, so
// the Latin position of Z is always "z" no matter what the layout prints. The Cyrillic
// letters cover keyboards and input methods that report no layout-independent code.
export function shortcutKey(event) {
  const physical = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3)
    : /^Digit[0-9]$/.test(event.code) ? event.code.slice(5) : '';
  const pressed = (physical || event.key || '').toLowerCase();
  return CYRILLIC_SHORTCUTS[pressed] ?? pressed;
}