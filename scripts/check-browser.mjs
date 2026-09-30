// Run against a separate test Chrome profile with --remote-debugging-port=9222.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = process.env.CDP_URL || 'http://127.0.0.1:9222';
const target = await (await fetch(base + '/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl), requests = new Map(), errors = [];
let seq = 0;
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) {
    const request = requests.get(m.id);
    requests.delete(m.id);
    m.error ? request.reject(Error(m.error.message)) : request.resolve(m.result);
  }
  else if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
  }
};
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    requests.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready() {
  for (let i = 0; i < 100; i++) {
    if (await evaluate('Boolean(document.querySelector(".node"))')) {
      return;
    }
    await sleep(50);
  }
  throw Error('Editor did not load');
}
async function click(selector, modifiers = 0) {
  const p = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing element '+${JSON.stringify(selector)});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await mouse('mousePressed', p, modifiers);
  await mouse('mouseReleased', p, modifiers);
}
async function mouse(type, p, modifiers = 0) {
  await cdp('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1, modifiers });
}
const value = id => evaluate(`document.querySelector('.node[data-id="${id}"] .value')?.textContent`);
const highlighted = () => evaluate(`[...document.querySelectorAll('.node .selection')].map(el => el.closest('.node').dataset.id).sort()`);
const saved = () => evaluate('JSON.parse(localStorage.getItem("web-logisim-v1"))');
async function action(id) {
  await evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
}
// CDP modifier bitmask: Alt 1, Ctrl 2, Meta 4, Shift 8.
// printed simulates a non-Latin layout; code: false drops event.code, as an IME would.
async function press(key, modifiers, printed, code = true) {
  const params = { key: printed ?? key, modifiers };
  if (code) {
    params.code = `Key${key.toUpperCase()}`;
    params.windowsVirtualKeyCode = key.toUpperCase().charCodeAt(0);
  }
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}
async function drag(selector, dx, dy) {
  const p = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await mouse('mousePressed', p);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + dx, y: p.y + dy, button: 'left', buttons: 1 });
  await mouse('mouseReleased', { x: p.x + dx, y: p.y + dy });
}
try {
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: process.env.APP_URL || 'http://localhost:5173' });
  await ready();
  await evaluate('localStorage.removeItem("web-logisim-v1")');
  await cdp('Page.reload');
  await ready();
  await action('poke-tool');
  assert.equal(await value('out-q'), '0');
  await click('.node[data-id="r"] .body');
  assert.equal(await value('out-q'), '0');
  await click('.node[data-id="s"] .body');
  assert.equal(await value('out-q'), '1');
  await click('.node[data-id="s"] .body');
  assert.equal(await value('out-q'), '1');
  await cdp('Page.reload');
  await ready();
  assert.equal(await value('out-q'), '1');
  console.log('PASS: NOR latch set/hold and page reload preserve Q=1');
  await action('select-tool');
  const before = (await saved()).nodes.find(n => n.id === 'q');
  await evaluate(`window.untouchedNode = document.querySelector('.node[data-id="s"]'); window.untouchedWire = document.querySelector('[data-wire="s-nq"]');`);
  await drag('.node[data-id="q"] .body', 40, 30);
  assert.equal(await evaluate(`window.untouchedNode === document.querySelector('.node[data-id="s"]') && window.untouchedWire === document.querySelector('[data-wire="s-nq"]')`), true);
  const after = (await saved()).nodes.find(n => n.id === 'q');
  assert.notEqual(after.x, before.x);
  assert.equal(await value('out-q'), '1');
  assert.equal(await evaluate('window.getSelection().toString()'), '');
  await action('undo');
  assert.equal((await saved()).nodes.find(n => n.id === 'q').x, before.x);
  assert.equal(await value('out-q'), '1');
  await action('redo');
  assert.equal((await saved()).nodes.find(n => n.id === 'q').x, after.x);
  assert.equal(await value('out-q'), '1');
  console.log('PASS: move, undo/redo preserve state; unaffected SVG nodes retained; no text selection');
  await press('z', 2);
  assert.equal((await saved()).nodes.find(n => n.id === 'q').x, before.x);
  await press('y', 2);
  assert.equal((await saved()).nodes.find(n => n.id === 'q').x, after.x);
  await press('z', 2);
  await press('z', 10);
  assert.equal((await saved()).nodes.find(n => n.id === 'q').x, after.x);
  assert.equal(await evaluate('document.getElementById("redo").disabled'), true);
  assert.equal(await value('out-q'), '1');
  console.log('PASS: Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z undo and redo; redo button reflects history');
  await press('z', 2, 'я');
  assert.equal((await saved()).nodes.find(n => n.id === 'q').x, before.x);
  await press('y', 2, 'н');
  assert.equal((await saved()).nodes.find(n => n.id === 'q').x, after.x);
  console.log('PASS: undo and redo work on a Cyrillic keyboard layout');
  await press('z', 2, 'я', false);
  assert.equal((await saved()).nodes.find(n => n.id === 'q').x, before.x);
  await press('y', 2, 'н', false);
  assert.equal((await saved()).nodes.find(n => n.id === 'q').x, after.x);
  assert.equal(await value('out-q'), '1');
  console.log('PASS: undo and redo work when the layout reports no physical key code');
  const q = await evaluate(`(()=>{const r=document.querySelector('.node[data-id="q"] .body').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await mouse('mousePressed', q);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: q.x + 40, y: q.y + 30, button: 'left', buttons: 1 });
  await press('z', 2);
  await mouse('mouseReleased', { x: q.x + 40, y: q.y + 30 });
  assert.equal((await saved()).nodes.find(n => n.id === 'q').x, after.x);
  assert.equal(await value('out-q'), '1');
  console.log('PASS: Ctrl+Z during a drag restores the position and ends the gesture');
  // Selection box: drag from empty field over a row, then move the captured group.
  const canvas = await evaluate(`(()=>{const r=document.getElementById('canvas').getBoundingClientRect();return {x:r.x,y:r.y}})()`);
  const empty = { x: canvas.x + 8, y: canvas.y + 8 };
  // r and q share a row, so a box from the empty corner past q covers them whole and
  // leaves the row below alone.
  const boxOverTopRow = async () => {
    const afterQ = await evaluate(`(()=>{const r=document.querySelector('.node[data-id="q"]').getBoundingClientRect();return {x:r.right+r.width*0.4,y:r.bottom+r.height*0.4}})()`);
    await mouse('mousePressed', empty);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: afterQ.x, y: afterQ.y, button: 'left', buttons: 1 });
    assert.equal(await evaluate('document.getElementById("marquee").getAttribute("visibility")'), 'visible');
    await mouse('mouseReleased', afterQ);
    assert.equal(await evaluate('document.getElementById("marquee").getAttribute("visibility")'), 'hidden');
  };
  await boxOverTopRow();
  assert.deepEqual(await highlighted(), ['q', 'r']);
  const positions = async () => Object.fromEntries((await saved()).nodes.map(n => [n.id, [n.x, n.y]]));
  const beforeGroup = await positions();
  const grip = await evaluate(`(()=>{const r=document.querySelector('.node[data-id="q"] .body').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await mouse('mousePressed', grip);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: grip.x + 38, y: grip.y + 25, button: 'left', buttons: 1 });
  await mouse('mouseReleased', { x: grip.x + 38, y: grip.y + 25 });
  const afterGroup = await positions();
  const [dx, dy] = [afterGroup.q[0] - beforeGroup.q[0], afterGroup.q[1] - beforeGroup.q[1]];
  assert.ok(dx !== 0 && dy !== 0, 'the picked component moved');
  assert.deepEqual([dx % 10, dy % 10], [0, 0], 'the group landed on the grid');
  assert.deepEqual([afterGroup.r[0] - beforeGroup.r[0], afterGroup.r[1] - beforeGroup.r[1]], [dx, dy]);
  await action('undo');
  assert.deepEqual(await positions(), beforeGroup);
  await action('redo');
  console.log('PASS: selection box captures a group; one drag moves it as a single undo step');
  // Shift adds and removes an object; a click on empty field clears everything.
  const shift = 8;
  await boxOverTopRow();
  assert.deepEqual(await highlighted(), ['q', 'r']);
  await click('.node[data-id="s"] .body', shift);
  assert.deepEqual(await highlighted(), ['q', 'r', 's']);
  await click('.node[data-id="s"] .body', shift);
  assert.deepEqual(await highlighted(), ['q', 'r']);
  await mouse('mousePressed', empty);
  await mouse('mouseReleased', empty);
  assert.deepEqual(await highlighted(), []);
  console.log('PASS: Shift toggles the selection and a click on empty field clears it');
  await action('pause');
  await action('poke-tool');
  await click('.node[data-id="r"] .body');
  assert.equal(await value('out-q'), '1');
  await action('pause');
  assert.equal(await value('out-q'), '0');
  await click('.node[data-id="r"] .body');
  assert.equal(await value('out-q'), '0');
  console.log('PASS: pause/resume and reset/hold');
  await action('new');
  for (const [type, x, y] of [['INPUT', 350, 220], ['NOT', 650, 220], ['OUTPUT', 930, 220], ['OUTPUT', 930, 420]]) {
    await click(`[data-add="${type}"]`);
    await mouse('mousePressed', { x, y });
    await mouse('mouseReleased', { x, y });
  }
  let data = await saved();
  assert.equal(data.nodes.length, 4);
  const [input, not, out, branch] = data.nodes;
  const pinSelector = (id, direction) => `.node[data-id="${id}"] [data-direction="${direction}"] .pin`;
  await click(pinSelector(input.id, 'out'));
  await click(pinSelector(not.id, 'in'));
  const a = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(pinSelector(not.id, 'out'))}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  const b = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(pinSelector(out.id, 'in'))}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await mouse('mousePressed', a);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...b, button: 'left', buttons: 1 });
  await mouse('mouseReleased', b);
  assert.equal((await saved()).wires.length, 2);
  assert.equal(await value(out.id), '1');
  await action('poke-tool');
  await click(`.node[data-id="${input.id}"] .body`);
  assert.equal(await value(out.id), '0');
  console.log('PASS: placement, click-to-connect, drag-to-connect, propagation');
  await action('wire-tool');
  const wireId = (await saved()).wires[1].id;
  // Midpoint of a known horizontal path, with no component under it.
  const wp = await evaluate(`(()=>{const path=document.querySelector('[data-wire="${wireId}"]');const p=path.getPointAtLength(path.getTotalLength()/2);const q=new DOMPoint(p.x,p.y).matrixTransform(path.getScreenCTM());return {x:q.x,y:q.y}})()`);
  await mouse('mousePressed', wp);
  await mouse('mouseReleased', wp);
  await click(pinSelector(branch.id, 'in'));
  assert.equal((await saved()).wires.length, 3);
  assert.equal(await value(branch.id), '0');
  await action('poke-tool');
  await click(`.node[data-id="${input.id}"] .body`);
  assert.equal(await value(out.id), '1');
  assert.equal(await value(branch.id), '1');
  console.log('PASS: wire fan-out propagates to both outputs');
  await action('select-tool');
  await mouse('mousePressed', wp);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: wp.x, y: wp.y + 50, button: 'left', buttons: 1 });
  await mouse('mouseReleased', { x: wp.x, y: wp.y + 50 });
  assert.ok((await saved()).wires.some(w => w.points?.length));
  assert.equal(await value(out.id), '1');
  await action('undo');
  await action('redo');
  assert.equal(await value(out.id), '1');
  console.log('PASS: wire route editing and undo/redo preserve logic');
  await action('rs-example');
  await click('.node[data-id="r"] .body');
  await click('.node[data-id="s"] .body');
  await click('.node[data-id="s"] .body');
  const exported = await saved();
  await action('new');
  await evaluate(`(()=>{const file=new File([${JSON.stringify(JSON.stringify(exported))}], 'latch.json',{type:'application/json'});const dt=new DataTransfer();dt.items.add(file);const input=document.querySelector('#file');input.files=dt.files;input.dispatchEvent(new Event('change'));})()`);
  await ready();
  assert.equal(await value('out-q'), '1');
  console.log('PASS: JSON import restores latch state');
  assert.deepEqual(errors, []);
  await action('poke-tool');
  const screenshot = await cdp('Page.captureScreenshot', { format: 'png' });
  const shot = join(tmpdir(), 'web-logisim-editor.png');
  await writeFile(shot, Buffer.from(screenshot.data, 'base64'));
  console.log(`PASS: no browser exceptions; screenshot ${shot}`);
}
finally {
  await cdp('Page.close').catch(() => {
  });
  ws.close();
}
