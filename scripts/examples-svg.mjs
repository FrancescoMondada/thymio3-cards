// A picture for each example of the README: the cards, drawn with the pictograms of the interface, and
// the path of the robot on its floor, seen from above. No words (as in the interface). `renderIcon(code)`
// gives the markup of a card's pictogram (src/icons.jsx, rendered by the caller).
import { layout } from '../src/program.js';
import { cleanProgram, isStep, kindOf } from '../src/spec.js';
import { GROUND_CSS } from '../src/colors.js';

const CARD = {
  F: ['#2fbf71', '#1f9a57'], B: ['#3d8bfd', '#2a68c9'], L: ['#ff9f1c', '#cf7800'], R: ['#a45ee9', '#7b3fbf'],
  open: ['#7c8aa5', '#566380'], close: ['#7c8aa5', '#566380'], repeat: ['#14b8a6', '#0f857a'], if: ['#3d4663', '#272d45'],
};
const colours = (code) => CARD[isStep(code) ? code : kindOf(code) === 'while' ? 'repeat' : kindOf(code)];

const SIZE = 38, GAP = 6, EDGE = 4, PAD = 6;       // a card, the space between cards, its lower edge, the margin
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f = (v) => +v.toFixed(2);

function cardsRow(cards, renderIcon, y) {
  return cards.map((code, i) => {
    const x = PAD + i * (SIZE + GAP);
    const [c, cd] = colours(code);
    const icon = renderIcon(code).replace('<svg ', `<svg x="${x + 6}" y="${y + 6}" width="${SIZE - 12}" height="${SIZE - 12}" color="#ffffff" `);
    return `<rect x="${x}" y="${y + EDGE}" width="${SIZE}" height="${SIZE}" rx="9" fill="${cd}"/><rect x="${x}" y="${y}" width="${SIZE}" height="${SIZE}" rx="9" fill="${c}"/>${icon}`;
  }).join('');
}

// the mat seen from above: floor colours, the start square (dashed), the path (green forward, blue backward), the robot at the end
function map(program, floorCells, ox, oy, limit) {
  const { start, poses, steps } = layout(program, (x, y) => floorCells.get(`${x},${y}`), limit);
  const pts = [start, ...poses, ...[...floorCells.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; })];
  let minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  let minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  while (maxX - minX < 2) { if ((maxX - minX) % 2 === 0) maxX += 1; else minX -= 1; }
  while (maxY - minY < 2) { if ((maxY - minY) % 2 === 0) maxY += 1; else minY -= 1; }
  const cols = maxX - minX + 1, rows = maxY - minY + 1;
  const m = Math.max(14, Math.min(30, Math.floor(190 / Math.max(cols, rows))));
  const cx = (x) => ox + (x - minX + 0.5) * m, cy = (y) => oy + (maxY - y + 0.5) * m;
  let g = `<rect x="${ox}" y="${oy}" width="${cols * m}" height="${rows * m}" rx="7" fill="#f6ebd5" stroke="#e7d4ae" stroke-width="1.5"/>`;
  for (let i = 1; i < cols; i++) g += `<path d="M${ox + i * m} ${oy} V${oy + rows * m}" stroke="#e7d4ae" stroke-width="1"/>`;
  for (let j = 1; j < rows; j++) g += `<path d="M${ox} ${oy + j * m} H${ox + cols * m}" stroke="#e7d4ae" stroke-width="1"/>`;
  for (const [k, c] of floorCells) {
    const [x, y] = k.split(',').map(Number);
    g += `<rect x="${f(cx(x) - m / 2 + 1.5)}" y="${f(cy(y) - m / 2 + 1.5)}" width="${m - 3}" height="${m - 3}" rx="4" fill="${GROUND_CSS[c]}" stroke="#2a2b44" stroke-opacity=".35" stroke-width="1.2"/>`;
  }
  g += `<rect x="${f(cx(0) - m / 2 + 3)}" y="${f(cy(0) - m / 2 + 3)}" width="${m - 6}" height="${m - 6}" rx="4" fill="none" stroke="#e8a33d" stroke-width="1.8" stroke-dasharray="4 3"/>`;
  let prev = start;
  steps.forEach((s, k) => {
    const to = poses[k];
    if (s.code === 'F' || s.code === 'B') {
      const dx = to.x - prev.x, dy = -(to.y - prev.y);                           // screen: y down
      const off = s.code === 'B' ? 4.5 : 0;
      const x1 = cx(prev.x) - dy * off, y1 = cy(prev.y) + dx * off, x2 = cx(to.x) - dy * off, y2 = cy(to.y) + dx * off;
      const a = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      const col = s.code === 'B' ? '#2a68c9' : '#1f9a57';
      g += `<path d="M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)}" stroke="${col}" stroke-width="3" stroke-linecap="round" opacity=".92"/>`
        + `<path d="M-4.5 -4.5 L3.5 0 L-4.5 4.5 Z" fill="${col}" transform="translate(${f((x1 + x2) / 2)} ${f((y1 + y2) / 2)}) rotate(${f(a)})"/>`;
    }
    prev = to;
  });
  const end = poses.at(-1) || start;
  const r = Math.min(1, m / 26);
  g += `<g transform="translate(${f(cx(end.x))} ${f(cy(end.y))}) rotate(${-end.h * 90}) scale(${f(r)})"><path d="M-8 9 V-1 Q-8 -10 0 -10 Q8 -10 8 -1 V9 Z" fill="#ffffff" stroke="#2a2b44" stroke-width="2.4" stroke-linejoin="round"/><circle cx="-3.6" cy="-2" r="1.7" fill="#e040fb"/><circle cx="3.6" cy="-2" r="1.7" fill="#e040fb"/><circle cx="0" cy="4.2" r="2" fill="#2a2b44"/></g>`;
  return { svg: g, width: cols * m, height: rows * m };
}

// the picture of one example: { svg, name }
export function renderExample(example, renderIcon) {
  const cards = [...cleanProgram(example.program.replace(/ /g, ''))];
  const floorCells = new Map(example.floor.map(([x, y, c]) => [`${x},${y}`, c]));
  const row = cards.length * SIZE + (cards.length - 1) * GAP;
  const top = PAD, mapTop = top + SIZE + EDGE + 12;
  const m = map(cards.join(''), floorCells, PAD, mapTop, example.steps === null ? 24 : 400);
  const w = Math.ceil(Math.max(row, m.width) + 2 * PAD), h = Math.ceil(mapTop + m.height + PAD);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"><title>${esc(example.program)}</title>${cardsRow(cards, renderIcon, top)}${m.svg}</svg>\n`;
  return { name: `${example.id}.svg`, svg };
}
