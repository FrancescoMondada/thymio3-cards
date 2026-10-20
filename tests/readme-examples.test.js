// The programs of the README ("Exemples de programmes"): what is written there is what the language does,
// and the pictures of the README are those the generator draws (npm run docs:examples).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { trace } from '../src/lang.js';
import { EXAMPLES } from '../scripts/examples.mjs';
import { renderExample } from '../scripts/examples-svg.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const NAMES = ['haut', 'gauche', 'bas', 'droite'];

let server, renderIcon;
before(async () => {
  server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const { ArrowIcon } = await server.ssrLoadModule('/src/icons.jsx');
  renderIcon = (code) => renderToStaticMarkup(React.createElement(ArrowIcon, { code }));
});
after(async () => { await server.close(); });

test('every program of the README does what the README says', () => {
  for (const { program: written, floor: cells, steps, cell, looks } of EXAMPLES) {
    if (steps === null) continue;                                              // (the one that never ends: below)
    const program = written.replace(/ /g, '');
    const floor = new Map(cells.map(([x, y, c]) => [`${x},${y}`, c]));
    const t = trace(program, (x, y) => floor.get(`${x},${y}`));
    const last = t.at(-1) || { x: 0, y: 0, h: 0 };
    const where = `${written} on ${JSON.stringify(cells)}`;
    assert.equal(t.map((s) => s.code).join(''), steps, `steps of ${where}`);
    assert.deepEqual([last.x, last.y], cell, `final cell of ${where}`);
    assert.equal(NAMES[((last.h % 4) + 4) % 4], looks, `where it looks, ${where}`);
  }
});

test('the README shows the infinite loop and says to press Stop', () => {
  assert.ok(readme.includes('`E(R)`') && /Ne s'arrête jamais/.test(readme));
  const floor = (x, y) => (x === 0 && y === 0 ? 'r' : undefined);
  assert.equal(trace('E(R)', floor, 40).length, 40, 'it would turn for ever: cut at the limit that was asked');
});

test('each example has its picture in the README, and the pictures are the ones the generator draws', () => {
  const ids = new Set();
  for (const ex of EXAMPLES) {
    assert.ok(!ids.has(ex.id), `one picture per id (${ex.id})`);
    ids.add(ex.id);
    assert.ok(readme.includes(`](docs/examples/${ex.id}.svg)`), `${ex.id} is in the README`);
    assert.ok(readme.includes(`\`${ex.program}\``), `${ex.program} is written in the README`);
    const { name, svg } = renderExample(ex, renderIcon);
    const file = path.join(root, 'docs', 'examples', name);
    assert.ok(fs.existsSync(file), `${name} exists: run npm run docs:examples`);
    assert.equal(fs.readFileSync(file, 'utf8'), svg, `${name} is up to date: run npm run docs:examples`);
    assert.ok(!/<text/.test(svg), 'no words in a picture');
  }
  const files = fs.readdirSync(path.join(root, 'docs', 'examples')).filter((f) => f.endsWith('.svg'));
  assert.deepEqual(files.sort(), EXAMPLES.map((e) => `${e.id}.svg`).sort(), 'no picture left over');
});
