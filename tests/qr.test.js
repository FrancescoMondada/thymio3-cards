// The QR code of a configuration is read back by the scanner: the encoder and the decoder of the page agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrPath, readQr } from '../src/qr.js';
import { encodeConfig, decodeConfig, MAX_PAYLOAD } from '../src/share.js';
import { COLOR_CODES } from '../src/spec.js';

// What a camera sees: the code on white, a quiet zone of four modules around it, each module `scale` pixels
function picture({ size, dark }, scale = 4, quiet = 4, shade = 0) {
  const side = (size + 2 * quiet) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const r = Math.floor(y / scale) - quiet, c = Math.floor(x / scale) - quiet;
    if (r >= 0 && c >= 0 && r < size && c < size && dark(r, c)) { const i = (y * side + x) * 4; data[i] = data[i + 1] = data[i + 2] = shade; }
  }
  return { data, width: side, height: side };
}

test('a short text: a code that is read back', async () => {
  const m = qrMatrix('T3C1;l=fr;p=FF');
  assert.ok(m.size >= 21 && m.size <= 33, `${m.size} modules`);
  assert.equal(await readQr(picture(m)), 'T3C1;l=fr;p=FF');
});

test('a configuration: the code is small, and what is read from it is what was put in', async () => {
  const cfg = { lang: 'it', sound: true, speed: 4, mode: 'custom', picked: ['F', 'L', 'open', 'close', 'repeat', 'if'], showPath: false,
    program: 'FF(FR)3F', target: { x: 1, y: 3 }, floor: { '0,1': 'r', '0,2': 'g' }, mapKind: 'builtin', map: { cols: 4, rows: 4, sx: 2, sy: 3 } };
  const text = encodeConfig(cfg);
  const m = qrMatrix(text);
  assert.ok(m.size <= 45, `${m.size} modules: easy to scan across a classroom`);
  const read = await readQr(picture(m, 6));
  assert.equal(read, text);
  assert.equal(decodeConfig(read).program, 'FF(FR)3F');
});

test('the biggest configuration that fits is read back too', async () => {
  const floor = {};
  for (let x = -9; x <= 10; x++) for (let y = -9; y <= 10; y++) floor[`${x},${y}`] = COLOR_CODES[(x * 3 + y * 5 + 99) % 8];
  const text = encodeConfig({ lang: 'fr', program: 'F'.repeat(50), floor, picked: [], mapKind: 'none', map: { cols: 4, rows: 4, sx: 2, sy: 2 } });
  assert.ok(text.length <= MAX_PAYLOAD);
  const m = qrMatrix(text);
  assert.ok(m, 'it fits');
  assert.equal(await readQr(picture(m, 4)), text);
});

test('a text that is too long for a code is said so, not cut', () => {
  assert.equal(qrMatrix('x'.repeat(3000)), null);
  assert.ok(qrMatrix('x'.repeat(MAX_PAYLOAD)), 'the limit of the format fits');
});

test('a code that is lit unevenly, or grey, is still read; a picture with no code gives nothing', async () => {
  const m = qrMatrix('T3C1;l=en;p=FRFR');
  assert.equal(await readQr(picture(m, 5, 4, 60)), 'T3C1;l=en;p=FRFR', 'dark grey modules');
  assert.equal(await readQr({ data: new Uint8ClampedArray(100 * 100 * 4).fill(255), width: 100, height: 100 }), null);
});

test('the path draws every dark module and only those', () => {
  const m = qrMatrix('T3C1;l=fr');
  const d = qrPath(m);
  const area = [...d.matchAll(/M\d+ \d+h(\d+)v1/g)].reduce((sum, r) => sum + Number(r[1]), 0);
  let dark = 0;
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) dark++;
  assert.equal(area, dark);
  assert.ok(d.length < m.size * m.size * 4, 'runs, not one rectangle per module');
});

// ---- scanning must not need the network once the page is open ------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the reader of QR codes is not fetched at the first scan: it is in the application, no dynamic import of it', () => {
  for (const file of ['src/qr.js', 'src/components/QrScan.jsx', 'src/components/QrShow.jsx', 'src/App.jsx']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!/import\(\s*['"]jsqr/.test(source), `${file}: no dynamic import of jsqr`);
  }
  assert.match(fs.readFileSync(path.join(root, 'src/qr.js'), 'utf8'), /^import jsQR from 'jsqr';$/m, 'a static import');
});

test('the built application is one script (a chunk that is loaded later would need the network at the first scan)', async () => {
  const result = await build({ root, logLevel: 'silent', build: { write: false } });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
  const scripts = outputs.filter((o) => o.type === 'chunk');
  assert.equal(scripts.length, 1, `scripts: ${scripts.map((s) => s.fileName).join(', ')}`);
  assert.ok(/jsQR|findQR|decodeQR/i.test(scripts[0].code) || scripts[0].code.includes('inversionAttempts'), 'the reader is in it');
  assert.ok(!scripts.some((s) => s.dynamicImports.length), 'nothing is imported later');
});

// ---- the link to the application, for the tablets of a class -------------------------------------------------------------
import { APP_URL } from '../src/share.js';

test('the address of the demo: a small code that is read back, and the one the README gives', async () => {
  assert.match(APP_URL, /^https:\/\/[a-z0-9-]+\.github\.io\/thymio3-cards\/$/, 'the GitHub page, no query that would change what the tablets start with');
  const m = qrMatrix(APP_URL);
  assert.ok(m.size <= 33, `${m.size} modules: big squares, read from the back of the class`);
  assert.equal(await readQr(picture(m, 4)), APP_URL);
  assert.ok(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes(`<${APP_URL}>`), 'the README links the same page');
});
