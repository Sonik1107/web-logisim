import { validate } from '../circuit.js';
const STORAGE_KEY = 'web-logisim-v1';
const MAX_FILE_BYTES = 2000000;
// Storage is passed in so persistence can be tested without a browser.
export function loadDocument(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw === null ? null : validate(JSON.parse(raw));
}
export function saveDocument(storage, data) {
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}
export async function readDocument(file) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Файл больше 2 МБ');
  }
  return validate(JSON.parse(await file.text()));
}
export function downloadDocument(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = (data.name.replace(/[^\p{L}\p{N}_-]/gu, '_') || 'circuit') + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
