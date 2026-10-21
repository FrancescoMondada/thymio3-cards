// The A0 grid of 15 cm cells (docs/grille-a0.svg to edit, docs/grille-a0.pdf to print; npm run docs:grid).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE, CELL, DOT, gridLayout, buildGridSvg } from '../scripts/grid-a0.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = buildGridSvg();
const all = (re) => [...svg.matchAll(re)];
const num = (tag, attr) => Number(new RegExp(`${attr}="([-\\d.]+)"`).exec(tag)[1]);

test('A0 portrait: five columns and seven rows of 15 cm, centred, with room round them for the lettering', () => {
  assert.deepEqual(PAGE, { width: 841, height: 1189 });
  const g = gridLayout();
  assert.deepEqual([g.cols, g.rows, g.cell], [5, 7, 150]);
  assert.ok(g.left >= 40 && g.top >= 40, 'a margin for the border');
  assert.equal(g.left * 2 + g.cols * CELL, PAGE.width);
  assert.equal(g.top * 2 + g.rows * CELL, PAGE.height);
  assert.ok(g.rows >= 6 && g.cols >= 3, 'cells like A4 and C6 exist');
  assert.match(svg, /width="841mm" height="1189mm" viewBox="0 0 841 1189"/, 'one unit is one millimetre');
});

test('a square of 150 mm for each cell, named like the cell (A1 to E7)', () => {
  const cells = all(/<rect id="cell-([A-E][1-7])"[^>]*>/g);
  assert.equal(cells.length, 35);
  assert.deepEqual(cells.map((m) => m[1]).sort(), ['A', 'B', 'C', 'D', 'E'].flatMap((l) => [1, 2, 3, 4, 5, 6, 7].map((n) => `${l}${n}`)).sort());
  for (const [tag] of cells) assert.deepEqual([num(tag, 'width'), num(tag, 'height')], [150, 150]);
  const a1 = cells.find((m) => m[1] === 'A1')[0], c4 = cells.find((m) => m[1] === 'C4')[0], e7 = cells.find((m) => m[1] === 'E7')[0];
  const g = gridLayout();
  assert.deepEqual([num(a1, 'x'), num(a1, 'y')], [g.left, g.top], 'A1 is at the top left');
  assert.deepEqual([num(c4, 'x'), num(c4, 'y')], [g.left + 2 * 150, g.top + 3 * 150], 'C4: third column, fourth row');
  assert.deepEqual([num(e7, 'x') + 150, num(e7, 'y') + 150], [g.left + 750, g.top + 1050], 'E7 is at the bottom right');
  assert.ok(cells.every(([tag]) => /fill="#ffffff"/.test(tag)), 'white: nothing to print, and something to click on');
});

test('a dot of 5 mm in the middle of every cell', () => {
  const dots = all(/<circle id="dot-([A-E][1-7])"[^>]*>/g);
  assert.equal(dots.length, 35);
  const g = gridLayout();
  for (const [tag, name] of dots) {
    const c = 'ABCDE'.indexOf(name[0]), r = Number(name[1]) - 1;
    assert.equal(num(tag, 'r') * 2, DOT, 'five millimetres across');
    assert.deepEqual([num(tag, 'cx'), num(tag, 'cy')], [g.left + (c + 0.5) * 150, g.top + (r + 0.5) * 150], name);
  }
  assert.equal(DOT, 5);
});

test('the grid: six lines down and eight across, round every cell', () => {
  const lines = all(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"\/>/g).map((m) => m.slice(1).map(Number));
  const vertical = lines.filter(([x1, , x2]) => x1 === x2), horizontal = lines.filter(([, y1, , y2]) => y1 === y2);
  assert.deepEqual([vertical.length, horizontal.length], [6, 8]);
  const g = gridLayout();
  assert.deepEqual(vertical.map(([x]) => x), [0, 1, 2, 3, 4, 5].map((c) => g.left + c * 150));
  assert.deepEqual(horizontal.map(([, y]) => y), [0, 1, 2, 3, 4, 5, 6, 7].map((r) => g.top + r * 150));
});

test('the lettering is on the border, on the four sides: A to E above and below, 1 to 7 left and right', () => {
  const texts = all(/<text id="([^"]+)" x="([\d.]+)" y="([\d.]+)">([^<]+)<\/text>/g).map((m) => ({ id: m[1], x: +m[2], y: +m[3], s: m[4] }));
  assert.equal(texts.length, 5 * 2 + 7 * 2);
  const g = gridLayout();
  for (const [i, l] of ['A', 'B', 'C', 'D', 'E'].entries()) {
    const top = texts.find((t) => t.id === `col-${l}-haut`), bottom = texts.find((t) => t.id === `col-${l}-bas`);
    assert.equal(top.s, l); assert.equal(bottom.s, l);
    assert.equal(top.x, g.left + (i + 0.5) * 150, 'centred over its column');
    assert.ok(top.y < g.top && bottom.y > g.top + 1050, 'outside the grid');
  }
  for (let n = 1; n <= 7; n++) {
    const left = texts.find((t) => t.id === `ligne-${n}-gauche`), right = texts.find((t) => t.id === `ligne-${n}-droite`);
    assert.equal(left.s, String(n)); assert.equal(right.s, String(n));
    assert.ok(left.x < g.left && right.x > g.left + 750, 'outside the grid');
    assert.ok(Math.abs(left.y - (g.top + (n - 0.5) * 150)) < 20, 'level with its row');
  }
});

test('layers an editor shows, from the bottom: colours, places, grid, dots, lettering, palette', () => {
  const layers = all(/<g id="([a-z]+)" inkscape:groupmode="layer" inkscape:label="([^"]+)"/g).map((m) => [m[1], m[2]]);
  assert.deepEqual(layers.map(([id]) => id), ['couleurs', 'lieux', 'grille', 'points', 'reperes', 'palette']);
  assert.ok(layers.every(([, label], i) => label.startsWith(`${i + 1} ·`)), 'numbered');
  assert.match(svg, /<g id="lieux"[^>]*><\/g>/, 'the layer of the places is empty, for the details to draw in a corner');
  assert.ok(svg.indexOf('id="lieux"') > svg.indexOf('id="cell-E7"') && svg.indexOf('id="lieux"') < svg.indexOf('<line'), 'the places are above the colours and below the grid and the dots');
});

test('a palette of the eight colours of the sensor is off the page, where it is not printed', () => {
  const swatches = all(/<rect id="palette-([a-zé]+)" x="([\d.]+)"[^>]*fill="(#[0-9a-f]{6})"/g);
  assert.deepEqual(swatches.map((m) => m[1]), ['rouge', 'jaune', 'vert', 'cyan', 'bleu', 'violet', 'blanc', 'noir']);
  assert.ok(swatches.every((m) => Number(m[2]) >= PAGE.width), 'beyond the right edge of the page');
});

test('the SVG is well formed: every tag closed, no stray character', () => {
  assert.ok(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(!/undefined|NaN/.test(svg));
  const body = svg.replace(/<\?xml[^>]*\?>/, '').replace(/<[^>]*\/>/g, '');
  const opens = (body.match(/<[a-z]+[ >]/g) || []).length, closes = (body.match(/<\/[a-z]+>/g) || []).length;
  assert.equal(opens, closes);
});

// An editor may save the drawing in points (Illustrator: 2383.94 x 3370.39) and drop the layers that are empty: A0 either way
const a0 = (file) => { const [w, h] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(file).slice(1).map(Number); return (Math.abs(w - 841) < 0.5 && Math.abs(h - 1189) < 0.5) || (Math.abs(w - 2383.94) < 0.5 && Math.abs(h - 3370.39) < 0.5); };
const onePageA0 = (name) => {
  const pdf = fs.readFileSync(path.join(root, 'docs', name)).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-'), name);
  const boxes = [...pdf.matchAll(/\/MediaBox\s*\[\s*0(?:\.0+)?\s+0(?:\.0+)?\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Math.round(+m[1]), Math.round(+m[2])]);
  assert.deepEqual(boxes, [[2384, 3370]], `${name}: one page of 841 x 1189 mm`);
};

test('the blank grid of the repository: an SVG to edit (its structure only is checked: it may be edited), and a PDF of one A0 page', () => {
  const file = fs.readFileSync(path.join(root, 'docs', 'grille-a0.svg'), 'utf8');
  assert.ok(a0(file), 'A0');
  for (const layer of ['couleurs', 'grille', 'points']) assert.ok(file.includes(`<g id="${layer}" inkscape:groupmode="layer"`), `the layer ${layer}`);
  assert.equal((file.match(/<rect id="cell-[A-E][1-7]"/g) || []).length, 35, 'the 35 cells');
  assert.equal((file.match(/<circle id="dot-[A-E][1-7]"/g) || []).length, 35, 'the 35 dots');
  onePageA0('grille-a0.pdf');
});

test('the example "ville": the same grid with colours and places drawn in the corners of the cells, as an SVG to edit and a PDF to print', () => {
  const file = fs.readFileSync(path.join(root, 'docs', 'grille-a0-ville.svg'), 'utf8');
  assert.ok(a0(file), 'A0');
  assert.equal((file.match(/<rect id="cell-[A-E][1-7]"/g) || []).length, 35, 'the 35 cells');
  assert.equal((file.match(/<circle id="dot-[A-E][1-7]"/g) || []).length, 35, 'the 35 dots');
  assert.ok(file.length > 500_000, 'with the drawings of the places');
  onePageA0('grille-a0-ville.pdf');
});
