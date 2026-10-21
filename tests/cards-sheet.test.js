// The cards to print (docs/cartes-thymio.pdf, npm run docs:cards): every card of the language is on a sheet, a
// sheet is a page of A4 with a grid of 45 mm cards, and a card has no word on it (as in the interface).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { SHEETS, SHOWCASE, SHOW_MM, CARD_MM, COLUMNS, ROWS, buildSheet } from '../scripts/cards-sheet.mjs';
import { TOKEN_ALPHABET } from '../src/spec.js';
import { cardKind } from '../src/modes.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let server, html, fr;
before(async () => {
  server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const { ArrowIcon, FlagIcon } = await server.ssrLoadModule('/src/icons.jsx');
  ({ I18N: { fr } } = await server.ssrLoadModule('/src/i18n.js'));
  html = buildSheet((code) => renderToStaticMarkup(React.createElement(ArrowIcon, { code })), () => renderToStaticMarkup(React.createElement(FlagIcon)), fr);
});
after(async () => { await server.close(); });

const count = (sheet) => sheet.cards.reduce((n, [, k]) => n + k, 0);

test('a page of 45 mm cards holds 24, and every sheet fits one', () => {
  assert.equal(CARD_MM * COLUMNS, 180);
  assert.equal(CARD_MM * ROWS, 270);
  assert.ok(CARD_MM * COLUMNS <= 210 - 20 && CARD_MM * ROWS <= 297 - 20, 'with a margin a printer can keep');
  assert.deepEqual(SHEETS.map(count), [24, 24, 16]);
  for (const s of SHEETS) assert.ok(count(s) <= COLUMNS * ROWS, s.title);
});

test('every card of the language is on a sheet, with the start and the finish', () => {
  const on = new Set(SHEETS.flatMap((s) => s.cards.map(([c]) => c)));
  for (const c of TOKEN_ALPHABET) assert.ok(on.has(c), `the card ${c}`);
  assert.ok(on.has('start') && on.has('finish'));
  const copies = (code) => SHEETS.flatMap((s) => s.cards).filter(([c]) => c === code).reduce((n, [, k]) => n + k, 0);
  assert.ok(copies('F') >= 6 && copies('L') >= 4 && copies('R') >= 4 && copies('B') >= 2, 'enough steps for a program');
  assert.ok(copies('(') === copies(')'), 'as many groups opened as closed');
});

test('the document: an instruction page, a page for each sheet, and the cards in large, in A4', () => {
  assert.equal((html.match(/<section class="page">/g) || []).length, SHEETS.length + 2);
  assert.match(html, /@page \{ size: A4; margin: 0; \}/);
  assert.ok(html.includes(`${CARD_MM}mm`));
  assert.equal((html.match(/<div class="cell">/g) || []).length, SHEETS.reduce((n, s) => n + count(s), 0), 'a cell for each card');
  assert.ok(!/undefined|NaN|\[object/.test(html));
});

test('no word on a card: the pictograms of the interface only', () => {
  const grids = [...html.matchAll(/<div class="grid">(.*?)<\/div><div class="foot">/gs)].map((m) => m[1]);
  assert.equal(grids.length, SHEETS.length);
  for (const g of grids) assert.equal(g.replace(/<[^>]*>/g, '').trim(), '', 'a card is all drawing');
});

test('the last page: one card of each sort, large, to show to the class', () => {
  const kinds = SHOWCASE.map((c) => (c === 'start' || c === 'finish' ? c : cardKind(c)));
  assert.deepEqual([...new Set(kinds)].sort(), ['F', 'B', 'L', 'R', 'close', 'finish', 'if', 'open', 'repeat', 'start', 'while'].sort(), 'one of each: the steps, the groups, a repeat, a repeat on a colour, an if, the start and the finish');
  assert.equal(new Set(kinds).size, SHOWCASE.length, 'no kind twice');
  const page = html.slice(html.indexOf('<div class="show">'));
  assert.equal((page.slice(0, page.indexOf('<div class="foot">')).match(/<div class="card/g) || []).length, SHOWCASE.length);
  assert.equal(page.slice(0, page.indexOf('<div class="foot">')).replace(/<[^>]*>/g, '').trim(), '', 'no word on the cards');
  assert.ok(3 * SHOW_MM + 2 * 4 <= 210 - 10 && 4 * SHOW_MM + 3 * 4 <= 297 - 20, 'three by four fit the page with a margin a printer can keep');
  assert.ok(SHOW_MM > CARD_MM, 'larger than the cards to cut');
  assert.ok(html.includes('Page 5.'), 'the instruction page lists it');
});

test('the instruction page says how to print, how to use them, and what each card does, in the words of the interface', () => {
  const intro = html.slice(0, html.indexOf('</section>'));
  for (const w of [fr.card.F, fr.card.B, fr.card.L, fr.card.R, fr.card.open, fr.card.close]) assert.ok(intro.includes(w), w);
  for (const w of ['A4', '100 %', 'Départ', 'Arrivée', '15 cm', 'thymio3-cards']) assert.ok(intro.includes(w), w);
  for (const name of Object.values(fr.colors)) assert.ok(intro.includes(name), name);
});

test('the PDF is in the repository, A4: the instructions, a page for each sheet, the large cards', () => {
  const pdf = fs.readFileSync(path.join(root, 'docs', 'cartes-thymio.pdf'));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const boxes = [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Math.round(+m[1]), Math.round(+m[2])]);
  assert.equal(boxes.length, SHEETS.length + 2, 'the pages');
  for (const b of boxes) assert.deepEqual(b, [595, 842], 'A4');
  assert.ok(pdf.length < 1_000_000, `${pdf.length} bytes: a light file`);
});
