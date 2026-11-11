// The configuration of the page as the text of a QR code, and back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PREFIX, MAX_PAYLOAD, MAX_CELLS, encodeConfig, decodeConfig, mapPlan } from '../src/share.js';
import { TOKEN_ALPHABET, COLOR_CODES } from '../src/spec.js';
import { CARD_KINDS, cleanCustom } from '../src/modes.js';

const sample = {
  lang: 'de', sound: false, speed: 2, mode: 'custom', picked: ['F', 'B', 'open', 'close', 'repeat', 'if'], showPath: true, showName: true, obstacle: true, obstacleLimit: 2500,
  program: 'FF(FR)3F2(rL)', target: { x: 2, y: -1 }, floor: { '0,2': 'r', '1,1': 'r', '3,3': 'g', '-2,0': 'k' }, mapKind: 'builtin', map: { cols: 4, rows: 4, sx: 2, sy: 2 },
};
const expectFrom = (c) => ({
  lang: c.lang, sound: c.sound, speed: c.speed, mode: c.mode, picked: cleanCustom(c.picked), showPath: c.showPath, showName: c.showName, obstacle: c.obstacle, obstacleLimit: c.obstacleLimit, program: c.program,
  target: c.target || null, floor: c.floor, map: { kind: c.mapKind, ...c.map },
});

test('a configuration is text that starts with the name of the format, and nothing in it but printable characters', () => {
  const text = encodeConfig(sample);
  assert.ok(text.startsWith(`${PREFIX};`));
  assert.match(text, /^[\x20-\x7e]+$/);
  assert.equal(text, 'T3C1;l=de;s=0;v=2;m=c;k=FB()2r;d=1;n=1;o=1,2500;p=FF(FR)3F2(rL);t=2,-1;f=r:1,1/0,2|g:3,3|k:-2,0;w=b,4,4,2,2');
  assert.ok(text.length < 120, `${text.length} characters: a small code, easy to scan`);
});

test('what is encoded is decoded, field by field', () => {
  assert.deepEqual(decodeConfig(encodeConfig(sample)), expectFrom(sample));
});

test('a page with nothing in it: no flag, no colours, the plain mat', () => {
  const c = { lang: 'fr', sound: true, speed: 1, mode: 'normal', picked: ['F', 'B', 'L', 'R'], showPath: false, showName: false, obstacle: false, obstacleLimit: 3000, program: '', target: null, floor: {}, mapKind: 'none', map: { cols: 4, rows: 4, sx: 2, sy: 2 } };
  const text = encodeConfig(c);
  assert.equal(text, 'T3C1;l=fr;s=1;v=1;m=n;k=FBLR;d=0;n=0;o=0,3000;p=;t=-;f=;w=n,4,4,2,2');
  assert.deepEqual(decodeConfig(text), { ...expectFrom(c), map: { kind: 'none', cols: 4, rows: 4, sx: 2, sy: 2 } });
  assert.equal(decodeConfig(text).target, null, 'no flag is said, it is not left out');
  assert.deepEqual(decodeConfig(text).floor, {});
});

test('random configurations come back as they went', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const pick = (a) => a[rnd(a.length)];
  for (let i = 0; i < 300; i++) {
    const floor = {};
    for (let k = rnd(30); k > 0; k--) floor[`${rnd(41) - 20},${rnd(41) - 20}`] = pick(COLOR_CODES);
    const c = {
      lang: pick(['fr', 'en', 'de', 'it']), sound: rnd(2) === 1, speed: pick([1, 2, 4]), mode: pick(['normal', 'advanced', 'custom']),
      picked: CARD_KINDS.filter(() => rnd(2) === 1), showPath: rnd(2) === 1, showName: rnd(2) === 1, obstacle: rnd(2) === 1, obstacleLimit: 100 + rnd(4401),
      program: Array.from({ length: rnd(51) }, () => pick(TOKEN_ALPHABET)).join(''),
      target: rnd(3) ? { x: rnd(41) - 20, y: rnd(41) - 20 } : null, floor, mapKind: pick(['none', 'builtin', 'custom']),
      map: { cols: 1 + rnd(40), rows: 1 + rnd(40), sx: 0, sy: 0 },
    };
    c.map.sx = rnd(c.map.cols); c.map.sy = rnd(c.map.rows);
    const text = encodeConfig(c);
    assert.ok(text.length <= MAX_PAYLOAD, `${text.length}`);
    assert.deepEqual(decodeConfig(text), expectFrom(c), text);
  }
});

test('the most a page holds: 50 cards and many painted squares still fit a QR code, a floor painted everywhere does not', () => {
  const floor = {};
  for (let x = -9; x <= 10; x++) for (let y = -9; y <= 10; y++) floor[`${x},${y}`] = COLOR_CODES[(x * 3 + y * 5 + 99) % 8];     // 400 squares
  const full = { ...sample, program: 'F'.repeat(50), floor };
  const text = encodeConfig(full);
  assert.ok(text.length <= MAX_PAYLOAD, `${text.length} characters for 400 painted squares`);
  const huge = {};
  for (let x = -50; x <= 50; x++) for (let y = -20; y <= 20; y++) huge[`${x},${y}`] = COLOR_CODES[(x + y + 200) % 8];     // 4000 squares
  assert.ok(encodeConfig({ ...sample, floor: huge }).length > MAX_PAYLOAD, 'too much for a code: the caller says so');
});

test('the flag that shows the name travels, the name does not', () => {
  const on = encodeConfig({ ...sample, showName: true }), off = encodeConfig({ ...sample, showName: false });
  assert.equal(decodeConfig(on).showName, true);
  assert.equal(decodeConfig(off).showName, false, 'off is said, it is not left out');
  assert.equal(encodeConfig({ ...sample, showName: undefined }), off, 'a page that does not know the flag says off, like the app does at the start');
  assert.ok(!on.includes('name') && !on.includes('Léa'), 'no name in the code');
  assert.equal(on.length, off.length, 'one character, whatever its value');
  // a code from before the flag leaves the setting of the page that scans it as it is; a value that is not 0 or 1 is dropped
  const before = on.replace(';n=1', '');
  assert.ok(!before.includes('n=') && !('showName' in decodeConfig(before)), 'no field, no change');
  for (const bad of ['n=', 'n=2', 'n=yes', 'n=01', 'n=true']) assert.ok(!('showName' in decodeConfig(on.replace('n=1', bad))), bad);
});

test('the detection of an object in the way travels: the switch and the limit, each in its own right', () => {
  const on = decodeConfig(encodeConfig({ ...sample, obstacle: true, obstacleLimit: 2500 }));
  assert.deepEqual([on.obstacle, on.obstacleLimit], [true, 2500]);
  const off = decodeConfig(encodeConfig({ ...sample, obstacle: false, obstacleLimit: 1800 }));
  assert.deepEqual([off.obstacle, off.obstacleLimit], [false, 1800], 'the limit goes also when the switch is off: it is a setting of its own');
  // what a page that does not say anything about it sends: not looked for, 3000
  const none = encodeConfig({ ...sample, obstacle: undefined, obstacleLimit: undefined });
  assert.ok(none.includes(';o=0,3000;'));
  for (const bad of [0, 99, 4501, -2500, 12.5, 'x', NaN, null]) assert.ok(encodeConfig({ ...sample, obstacleLimit: bad }).includes(';o=1,3000;'), `a limit that is not between 100 and 4500 is the default (${bad})`);
  assert.ok(encodeConfig({ ...sample, obstacleLimit: 100 }).includes(';o=1,100;') && encodeConfig({ ...sample, obstacleLimit: 4500 }).includes(';o=1,4500;'), 'the two ends are valid');
  // a code from before the field leaves both settings of the page that scans it as they are
  const before = encodeConfig(sample).replace(';o=1,2500', '');
  assert.ok(!before.includes(';o=') && !('obstacle' in decodeConfig(before)) && !('obstacleLimit' in decodeConfig(before)), 'no field, no change');
  // each value is kept if it is valid, the other is dropped; a field with more than two values is dropped whole
  const read = (value) => decodeConfig(encodeConfig(sample).replace('o=1,2500', `o=${value}`));
  assert.deepEqual([read('1,x').obstacle, 'obstacleLimit' in read('1,x')], [true, false]);
  assert.deepEqual([read('1,99').obstacle, 'obstacleLimit' in read('1,99')], [true, false], 'below 100');
  assert.deepEqual([read('1,4501').obstacle, 'obstacleLimit' in read('1,4501')], [true, false], 'above 4500');
  assert.deepEqual([read('2,2000').obstacleLimit, 'obstacle' in read('2,2000')], [2000, false], 'a switch that is not 0 or 1');
  assert.deepEqual([read('1').obstacle, 'obstacleLimit' in read('1')], [true, false], 'a switch alone');
  for (const bad of ['', ',', '1,2000,5', 'yes,low', 'on,3000x']) assert.ok(!('obstacle' in read(bad)) && !('obstacleLimit' in read(bad)), `nothing from "${bad}"`);
  assert.equal(encodeConfig(sample).length < 120, true, 'the text stays short');
});

test('what is not ours is not read', () => {
  for (const bad of ['', 'hello', 'https://example.com', 'T3C2;l=fr', 'T3C1', 't3c1;l=fr', ';l=fr', null, undefined, 42, {}, 'T3C1;', 'T3C1;nonsense', 'T3C1;=;;;x=y']) {
    assert.equal(decodeConfig(bad), null, String(bad));
  }
});

test('a field that is not valid is dropped, the others are kept', () => {
  const got = decodeConfig('T3C1;l=xx;s=2;v=3;m=z;k=;d=yes;p=FF(R;t=a,b;f=q:1,1|r:1,1/x,y/1,1,1/9999,0;w=q,1,1,1,1;l=en;x=1');
  assert.deepEqual(got, { lang: 'en', picked: ['F', 'B', 'L', 'R'], program: 'FF(R', floor: { '1,1': 'r' } }, 'bad language, sound, speed, mode, flag, map: left out; the cards given are never none');
  assert.deepEqual(decodeConfig('T3C1;p=F'), { program: 'F' }, 'a field that is missing leaves that part of the page as it is');
});

test('a program is cleaned: only cards, at most fifty', () => {
  const cleaned = decodeConfig('T3C1;p=F<script>alert(1)</script>B').program;
  assert.match(cleaned, /^[FBLR()2-9rygcbpwkEYGCUPWK]*$/, 'whatever letters are left are cards');
  assert.ok(!/[<>/]/.test(cleaned));
  assert.equal(decodeConfig(`T3C1;p=${'F'.repeat(80)}`).program.length, 50);
  assert.equal(decodeConfig('T3C1;p=F\nB').program, 'FB');
  assert.equal(decodeConfig('T3C1;p=x').program, '');
});

test('numbers are read strictly: whole numbers of squares, near the start', () => {
  assert.deepEqual(decodeConfig('T3C1;t=99,-99').target, { x: 99, y: -99 });
  for (const t of ['100,0', '0,100', '1e2,0', '1.5,0', '0x10,0', '1,2,3', '1', ',', '- 1,0', '+1,0']) assert.equal(decodeConfig(`T3C1;p=F;t=${t}`).target, undefined, t);
  assert.deepEqual(decodeConfig('T3C1;f=r:100,0/5,5/-100,0'), { floor: { '5,5': 'r' } });
  assert.equal(MAX_CELLS, 99);
});

test('a floor of an absurd size is cut', () => {
  const cells = Array.from({ length: 6000 }, (_, i) => `${(i % 99) - 49},${Math.floor(i / 99) - 30}`).join('/');
  assert.equal(Object.keys(decodeConfig(`T3C1;f=r:${cells}`).floor).length, 2000);
});

test('the map: a kind, and where the robot starts when it is given', () => {
  assert.deepEqual(decodeConfig('T3C1;w=b,4,4,2,2').map, { kind: 'builtin', cols: 4, rows: 4, sx: 2, sy: 2 });
  assert.deepEqual(decodeConfig('T3C1;w=n').map, { kind: 'none' });
  assert.deepEqual(decodeConfig('T3C1;w=c,6,3,9,9').map, { kind: 'custom', cols: 6, rows: 3, sx: 5, sy: 2 }, 'a start square outside is brought back inside');
  assert.deepEqual(decodeConfig('T3C1;w=b,0,40,1,1').map, { kind: 'builtin', cols: 1, rows: 40, sx: 0, sy: 1 }, 'sizes from 1 to 40');
  assert.deepEqual(decodeConfig('T3C1;w=b,4,200,1,1').map, { kind: 'builtin' }, 'a size that is not a number of squares: the kind alone');
  assert.deepEqual(decodeConfig('T3C1;w=b,4,4').map, { kind: 'builtin' }, 'no geometry: the kind alone');
  assert.equal(decodeConfig('T3C1;w=z,4,4,2,2'), null, 'nothing valid: nothing');
});

test('what a page does with the picture of the code: the Thymio map and no picture are the same everywhere, a chosen picture only where it is', () => {
  const geometry = { cols: 4, rows: 4, sx: 1, sy: 3 };
  assert.deepEqual(mapPlan({ kind: 'none' }, 'custom'), { kind: 'none' });
  assert.deepEqual(mapPlan({ kind: 'builtin', ...geometry }, 'none'), { kind: 'builtin', geometry });
  assert.deepEqual(mapPlan({ kind: 'custom', ...geometry }, 'custom'), { kind: 'custom', geometry }, 'the page has its picture: the squares and the start are applied');
  assert.equal(mapPlan({ kind: 'custom', ...geometry }, 'none'), null, 'the page has no picture: its mat stays');
  assert.equal(mapPlan({ kind: 'custom', ...geometry }, 'builtin'), null);
  assert.equal(mapPlan(undefined, 'none'), null);
  assert.deepEqual(mapPlan({ kind: 'builtin' }, 'none'), { kind: 'builtin', geometry: null });
});
