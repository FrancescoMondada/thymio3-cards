// What colour the virtual robot reads from a picture: the eight colours as a person names them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rgbToHsv, colourOfPixel, scanSquares, groundAt } from '../src/picturecolor.js';
import { layout } from '../src/program.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} is not ${b}`);

test('RGB to hue, saturation, value', () => {
  for (const [rgb, want] of [[[255, 0, 0], [0, 100, 100]], [[255, 255, 0], [60, 100, 100]], [[0, 255, 0], [120, 100, 100]], [[0, 255, 255], [180, 100, 100]],
    [[0, 0, 255], [240, 100, 100]], [[255, 0, 255], [300, 100, 100]], [[255, 255, 255], [0, 0, 100]], [[0, 0, 0], [0, 0, 0]], [[255, 0, 127.5], [330, 100, 100]]]) {
    const got = rgbToHsv(...rgb);
    want.forEach((w, i) => near(got[i], w));
  }
});

test('the colours a person sees are the ones the robot reads', () => {
  const cases = [
    [[255, 0, 0], 'r'], [[220, 40, 40], 'r'], [[255, 140, 0], 'y'], [[250, 204, 21], 'y'], [[255, 255, 0], 'y'],     // (an orange is nearer the yellow)
    [[34, 197, 94], 'g'], [[0, 255, 0], 'g'], [[0, 200, 200], 'c'], [[6, 182, 212], 'c'], [[59, 130, 246], 'b'], [[0, 0, 255], 'b'],
    [[168, 85, 247], 'p'], [[255, 0, 255], 'p'], [[255, 255, 255], 'w'], [[240, 240, 235], 'w'], [[0, 0, 0], 'k'], [[30, 30, 40], 'k'],
    [[128, 128, 128], undefined], [[110, 115, 110], undefined],
  ];
  for (const [rgb, want] of cases) assert.equal(colourOfPixel(...rgb), want, `rgb(${rgb})`);
  assert.equal(colourOfPixel(255, 0, 0, 0), undefined, 'a transparent pixel is no colour');
  assert.equal(colourOfPixel(255, 0, 0, 127), undefined);
  assert.equal(colourOfPixel(255, 0, 0, 128), 'r');
});

test('the sectors meet where they should: red wraps around, every hue is one of the six', () => {
  const at = (h) => { const c = 255, x = Math.round(c * (1 - Math.abs(((h / 60) % 2) - 1))); const k = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]; return colourOfPixel(...k); };
  assert.equal(at(0), 'r'); assert.equal(at(25), 'r'); assert.equal(at(35), 'y'); assert.equal(at(85), 'y'); assert.equal(at(95), 'g');
  assert.equal(at(145), 'g'); assert.equal(at(155), 'c'); assert.equal(at(205), 'c'); assert.equal(at(215), 'b'); assert.equal(at(258), 'b');
  assert.equal(at(268), 'p'); assert.equal(at(325), 'p'); assert.equal(at(335), 'r'); assert.equal(at(359), 'r');
  for (let h = 0; h < 360; h += 3) assert.ok('rygcbp'.includes(at(h)), `hue ${h}`);
});

// An image of w x h pixels from rows of colours (arrays of rgb, or undefined for transparent)
const picture = (w, h, pixel) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b, a = 255] = pixel(x, y); data.set([r, g, b, a], (y * w + x) * 4); }
  return { data, width: w, height: h };
};
const RGB = { r: [255, 0, 0], g: [0, 200, 0], b: [0, 0, 255], y: [255, 220, 0], w: [255, 255, 255], k: [0, 0, 0], grey: [128, 128, 128] };

test('each square of a picture has the colour of its middle, counted from the bottom left', () => {
  // 3 x 2 squares of 4 x 4 pixels: the top row (py = 1) is red, green, blue; the bottom row (py = 0) is yellow, white, grey
  const top = ['r', 'g', 'b'], bottom = ['y', 'w', 'grey'];
  const img = picture(12, 8, (x, y) => RGB[(y < 4 ? top : bottom)[Math.floor(x / 4)]]);
  assert.deepEqual(scanSquares(img, 3, 2), { '0,1': 'r', '1,1': 'g', '2,1': 'b', '0,0': 'y', '1,0': 'w' }, 'the grey square has no colour');
});

test('a line or a label on a square does not change it, the larger colour wins, a tie goes to the first colour', () => {
  // one square of 8 x 8 pixels, green with a red line across the middle row
  const img = picture(8, 8, (x, y) => (y === 4 ? RGB.r : RGB.g));
  assert.deepEqual(scanSquares(img, 1, 1), { '0,0': 'g' });
  // the border of the square does not count: only its middle half
  assert.deepEqual(scanSquares(picture(8, 8, (x, y) => (x < 2 || x >= 6 || y < 2 || y >= 6 ? RGB.k : RGB.b)), 1, 1), { '0,0': 'b' });
  // half red, half blue in the middle: red is before blue in rygcbpwk
  assert.deepEqual(scanSquares(picture(8, 8, (x) => (x < 4 ? RGB.b : RGB.r)), 1, 1), { '0,0': 'r' });
  // transparent: nothing
  assert.deepEqual(scanSquares(picture(4, 4, () => [255, 0, 0, 0]), 1, 1), {});
});

test('a picture smaller than its squares still gives every square a pixel', () => {
  const img = picture(2, 2, (x, y) => (y === 0 ? RGB.r : RGB.b));        // 2 x 2 pixels over 4 x 4 squares
  const cells = scanSquares(img, 4, 4);
  assert.equal(Object.keys(cells).length, 16);
  assert.equal(cells['0,3'], 'r'); assert.equal(cells['3,0'], 'b');
});

// ---- the picture as the ground of the robot ----------------------------------------------------------
test('the ground at a cell: the brush first, else the picture\'s square, in the robot\'s frame', () => {
  const cells = { '2,1': 'r', '2,2': 'r', '2,3': 'r', '0,0': 'b' };
  const at = groundAt({ '0,1': 'g' }, cells, 2, 1);                 // the robot starts on the square (2, 1) of the picture
  assert.equal(at(0, 0), 'r', 'under the robot at the start');
  assert.equal(at(0, 1), 'g', 'the brush covers the picture');
  assert.equal(at(0, 2), 'r');
  assert.equal(at(-2, -1), 'b', 'the square (0, 0) of the picture');
  assert.equal(at(1, 0), undefined, 'a square of no colour');
  assert.equal(at(-5, 0), undefined, 'off the picture');
  assert.equal(groundAt({ '1,0': 'y' }, null)(1, 0), 'y', 'no picture: the brush alone');
  assert.equal(groundAt({}, null)(0, 0), undefined);
});

test('a program follows the colours of the picture: "while red, forward" goes along the red squares', () => {
  const cells = { '2,1': 'r', '2,2': 'r', '2,3': 'r' };             // a red strip, the robot at its foot
  const last = (colourAt) => { const { poses } = layout('E(F)', colourAt); return poses.length ? poses[poses.length - 1] : { x: 0, y: 0 }; };
  assert.equal(last(groundAt({}, cells, 2, 1)).y, 3, 'three squares of red: three steps, and stops on the first that is not');
  assert.equal(last(groundAt({}, cells, 3, 1)).y, 0, 'the robot starts beside the strip: no red under it, no step');
  assert.equal(last(groundAt({ '0,1': 'g' }, cells, 2, 1)).y, 1, 'a green square painted on the strip stops it');
  assert.equal(last(groundAt({}, null)).y, 0, 'no picture, no brush');
});
