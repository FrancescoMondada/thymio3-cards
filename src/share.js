// The whole configuration of the page as a short text, for a QR code, and back. One page shows the code, another
// scans it and ends up the same: the cards of the program, the target flag, the colours of the floor, the mode
// and the cards it gives, the language, the sound, the speed, the path, and the picture under the mat.
//
//   T3C1;l=fr;s=1;v=1;m=c;k=FBLR(2r;d=0;p=FF(FR)3F;t=2,-1;f=r:0,2/1,1|g:3,3;w=b,4,4,2,2
//
// The first word names the format and its version. A field is `letter=value`; the order does not matter, a
// field that is missing leaves that part of the page as it is, and a field that is not valid is dropped: what
// comes from a scan is data, read strictly, never run. What a code holds is a QR code of the highest version
// at most (MAX_PAYLOAD), so the colours of a floor painted all over do not fit.
//
// The picture under the mat is not in the code, only where it is: the Thymio town map is the same on every
// page ("b"); a picture that the adult chose ("c") is only on the page that has it, so its squares and the
// robot's start square are applied there, and a page without a picture keeps its mat (mapPlan).
import { LANGS } from './i18n.js';
import { COLOR_CODES, cleanProgram } from './spec.js';
import { MODES, CARD_KINDS, PALETTE_CODE, cleanCustom } from './modes.js';
import { cleanMap } from './worldmap.js';

export const PREFIX = 'T3C1';
export const APP_URL = 'https://francescomondada.github.io/thymio3-cards/';   // the demo, for the QR code that opens it on the other screens of a class
// What the QR code of the application can hold, by the browser it should open in. `web`: the plain address, opened by the
// camera's own choice of browser. `android`: Chrome's intent syntax, which names the Chrome package (developer.chrome.com/docs/android/intents):
// only a scanner that hands intent links to Android opens it, and only if Chrome is installed. `ios`: the custom scheme of Bluefy, the browser
// with Web Bluetooth for iPhone and iPad, that must be installed too; Bluefy's own documentation does not give the form of its link, so
// `open?url=` with the encoded address is the usual one and the thing to check on an iPad first.
export const APP_LINKS = {
  web: APP_URL,
  android: `intent://${APP_URL.replace(/^https:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`,
  ios: `bluefy://open?url=${encodeURIComponent(APP_URL)}`,
};
export const MAX_PAYLOAD = 2300;           // characters: a QR code of the highest version holds 2331 at the level M
export const MAX_CELLS = 99;               // a painted cell or the flag further than this from the start is not kept
const SPEEDS = [1, 2, 4];
const MODE_CHAR = { normal: 'n', advanced: 'a', custom: 'c' };
const MAP_CHAR = { none: 'n', builtin: 'b', custom: 'c' };
const invert = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
const MODE_OF = invert(MODE_CHAR), MAP_OF = invert(MAP_CHAR), KIND_OF = invert(PALETTE_CODE);

const INT = /^-?\d{1,3}$/;
const int = (s) => (INT.test(s) ? Number(s) : NaN);
const inRange = (n) => Number.isInteger(n) && Math.abs(n) <= MAX_CELLS;
const pair = (s) => { const [x, y, ...rest] = String(s).split(','); const p = { x: int(x), y: int(y) }; return !rest.length && inRange(p.x) && inRange(p.y) ? p : null; };

// What the page holds -> the text. `c`: { lang, sound, speed, mode, picked, showPath, program, target, floor, map }
export function encodeConfig(c) {
  const floor = new Map();
  for (const [key, colour] of Object.entries(c.floor || {})) {
    const p = pair(key);
    if (p && COLOR_CODES.includes(colour)) floor.set(colour, [...(floor.get(colour) || []), p]);
  }
  const floorText = COLOR_CODES.filter((k) => floor.has(k))
    .map((k) => `${k}:${floor.get(k).sort((a, b) => a.y - b.y || a.x - b.x).map((p) => `${p.x},${p.y}`).join('/')}`).join('|');
  const m = c.map ? cleanMap(c.map) : null;
  return [
    PREFIX,
    `l=${LANGS.some((l) => l.id === c.lang) ? c.lang : 'fr'}`,
    `s=${c.sound === false ? 0 : 1}`,
    `v=${SPEEDS.includes(c.speed) ? c.speed : 1}`,
    `m=${MODE_CHAR[MODES.includes(c.mode) ? c.mode : 'normal']}`,
    `k=${cleanCustom(c.picked).map((k) => PALETTE_CODE[k]).join('')}`,
    `d=${c.showPath ? 1 : 0}`,
    `p=${cleanProgram(c.program)}`,
    `t=${c.target && inRange(c.target.x) && inRange(c.target.y) ? `${c.target.x},${c.target.y}` : '-'}`,
    `f=${floorText}`,
    `w=${MAP_CHAR[c.mapKind] || 'n'}${m ? `,${m.cols},${m.rows},${m.sx},${m.sy}` : ''}`,
  ].join(';');
}

// The text of a code -> what it holds, field by field (only the valid ones), or null when it is not one of ours.
export function decodeConfig(text) {
  if (typeof text !== 'string') return null;
  const [head, ...fields] = text.trim().split(';');
  if (head !== PREFIX) return null;
  const out = {};
  for (const field of fields) {
    const i = field.indexOf('=');
    if (i < 1) continue;
    const key = field.slice(0, i), v = field.slice(i + 1);
    switch (key) {
      case 'l': if (LANGS.some((l) => l.id === v)) out.lang = v; break;
      case 's': if (v === '0' || v === '1') out.sound = v === '1'; break;
      case 'v': if (SPEEDS.includes(Number(v)) && /^\d$/.test(v)) out.speed = Number(v); break;
      case 'm': if (MODE_OF[v]) out.mode = MODE_OF[v]; break;
      case 'k': out.picked = cleanCustom([...v].map((ch) => KIND_OF[ch]).filter(Boolean)); break;
      case 'd': if (v === '0' || v === '1') out.showPath = v === '1'; break;
      case 'p': if (/^[^;]*$/.test(v)) out.program = cleanProgram(v); break;
      case 't': if (v === '-') out.target = null; else { const p = pair(v); if (p) out.target = p; } break;
      case 'f': out.floor = readFloor(v); break;
      case 'w': { const w = readMap(v); if (w) out.map = w; break; }
      default: break;                                 // a field of a later version: ignored
    }
  }
  return Object.keys(out).length ? out : null;
}

function readFloor(v) {
  const floor = {};
  let n = 0;
  for (const group of v.split('|')) {
    const [colour, cells] = group.split(':');
    if (!COLOR_CODES.includes(colour) || !cells) continue;
    for (const cell of cells.split('/')) {
      const p = pair(cell);
      if (p && n++ < 2000) floor[`${p.x},${p.y}`] = colour;
    }
  }
  return floor;
}

function readMap(v) {
  const [kind, ...nums] = v.split(',');
  if (!MAP_OF[kind]) return null;
  const out = { kind: MAP_OF[kind] };
  if (nums.length === 4 && nums.every((s) => /^\d{1,2}$/.test(s))) Object.assign(out, cleanMap({ cols: +nums[0], rows: +nums[1], sx: +nums[2], sy: +nums[3] }));
  return out;
}

// What to do with the picture under the mat of the page that scans: { kind, geometry? }, or null to leave it.
export function mapPlan(shared, currentKind) {
  if (!shared) return null;
  const geometry = shared.cols ? { cols: shared.cols, rows: shared.rows, sx: shared.sx, sy: shared.sy } : null;
  if (shared.kind === 'none') return { kind: 'none' };
  if (shared.kind === 'builtin') return { kind: 'builtin', geometry };
  return currentKind === 'custom' ? { kind: 'custom', geometry } : null;
}
