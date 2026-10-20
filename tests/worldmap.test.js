// The picture under the mat: where it is in the robot's frame, and what follows the robot when its start is moved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CELLS, DEFAULT_MAP, fitWithin, clampSize, centerCell, clampStart, suggestRows, mapRect, cellUnder, viewForMap, shiftCells, shiftPoint, cleanMap } from '../src/worldmap.js';

test('sizes are whole numbers of squares, from 1 to the largest', () => {
  assert.equal(clampSize(4), 4);
  assert.equal(clampSize('3.6'), 4);
  assert.equal(clampSize(0), 1);
  assert.equal(clampSize(-5), 1);
  assert.equal(clampSize('abc'), 1);
  assert.equal(clampSize(1000), MAX_CELLS);
});

test('the start square: the middle one, and always on the picture', () => {
  assert.deepEqual(centerCell(5, 3), { sx: 2, sy: 1 });
  assert.deepEqual(centerCell(4, 4), { sx: 2, sy: 2 }, 'an even size: the square right of and above the middle');
  assert.deepEqual(centerCell(1, 1), { sx: 0, sy: 0 });
  assert.deepEqual(clampStart({ sx: -3, sy: 9 }, 4, 4), { sx: 0, sy: 3 });
  assert.deepEqual(clampStart({ sx: 1.6, sy: 0.2 }, 4, 4), { sx: 2, sy: 0 });
});

test('a picture over 4 x 4 squares, the robot on the square (2, 1): where the picture is in the robot\'s frame', () => {
  const map = { cols: 4, rows: 4, sx: 2, sy: 1 };
  assert.deepEqual(mapRect(map), { x0: -2.5, y0: -1.5, x1: 1.5, y1: 2.5 });
  // the robot's square is the one of the picture at (2, 1): the centre of the robot's frame is inside it
  const r = mapRect(map);
  assert.ok(r.x0 < -0.5 && r.x1 > 0.5 && r.y0 < -0.5 && r.y1 > 0.5);
  assert.equal(r.x1 - r.x0, 4);
  assert.equal(r.y1 - r.y0, 4);
});

test('a touch on the picture gives the square under it, kept on the picture', () => {
  const map = { cols: 4, rows: 3, sx: 2, sy: 1 };
  assert.deepEqual(cellUnder({ x: 0, y: 0 }, map), { sx: 2, sy: 1 }, 'under the robot: the same square');
  assert.deepEqual(cellUnder({ x: -2, y: 1 }, map), { sx: 0, sy: 2 });
  assert.deepEqual(cellUnder({ x: -7, y: 9 }, map), { sx: 0, sy: 2 }, 'outside: the nearest square');
  assert.deepEqual(cellUnder({ x: 0.4, y: -0.4 }, map), { sx: 2, sy: 1 }, 'a touch is on the square it is in');
});

test('while the robot is placed the stage shows the whole picture with a margin, whatever the start', () => {
  for (const [sx, sy] of [[0, 0], [2, 1], [3, 3]]) {
    const v = viewForMap({ cols: 4, rows: 4, sx, sy }, 0.5);
    assert.equal(v.w, 5);
    assert.equal(v.h, 5);
    // the robot (the origin) is on the square (sx, sy) of a picture whose lower left corner is at -sx - .5, whatever the start
    const left = v.x + 0.5;                                       // the left edge of the picture
    assert.equal(0 - left, sx + 0.5, `the robot is ${sx + 0.5} squares from the left edge`);
  }
});

test('what is painted or planted keeps its place on the picture when the robot\'s start moves', () => {
  const floor = { '0,2': 'r', '-1,0': 'g' };
  // the start moves one square to the right and one up (+1, +1): the same squares of the picture are now (-1, -1) from the robot
  assert.deepEqual(shiftCells(floor, -1, -1), { '-1,1': 'r', '-2,-1': 'g' });
  assert.deepEqual(shiftCells(shiftCells(floor, -1, -1), 1, 1), floor, 'and back');
  assert.deepEqual(shiftCells(null, 1, 1), {});
  assert.deepEqual(shiftPoint({ x: 3, y: 4 }, -1, -1), { x: 2, y: 3 });
  assert.equal(shiftPoint(null, 1, 1), null);
});

test('a picture of 800 x 400 over 4 columns needs 2 rows, a square one 4', () => {
  assert.equal(suggestRows(4, 800, 400), 2);
  assert.equal(suggestRows(4, 500, 500), 4);
  assert.equal(suggestRows(6, 300, 900), 18);
  assert.equal(suggestRows(4, 0, 0), 4, 'a picture of no known size: square');
});

test('a map that was kept is read back valid, or not at all', () => {
  assert.equal(cleanMap(null), null);
  assert.equal(cleanMap('x'), null);
  assert.deepEqual(cleanMap({ cols: 4, rows: 3, sx: 1, sy: 2 }), { cols: 4, rows: 3, sx: 1, sy: 2 });
  assert.deepEqual(cleanMap({ cols: 4, rows: 3 }), { cols: 4, rows: 3, sx: 2, sy: 1 }, 'no start: the middle');
  assert.deepEqual(cleanMap({ cols: 3, rows: 3, sx: 9, sy: -2 }), { cols: 3, rows: 3, sx: 2, sy: 0 });
  assert.deepEqual(cleanMap({ cols: 999, rows: 0 }), { cols: MAX_CELLS, rows: 1, sx: Math.floor(MAX_CELLS / 2), sy: 0 });
});

test('a big picture is kept smaller, a small one as it is', () => {
  assert.deepEqual(fitWithin(4000, 3000, 2048), { width: 2048, height: 1536, scaled: true });
  assert.deepEqual(fitWithin(1000, 3000, 1500), { width: 500, height: 1500, scaled: true });
  assert.deepEqual(fitWithin(800, 600, 2048), { width: 800, height: 600, scaled: false });
  assert.deepEqual(fitWithin(0, 0, 2048), { width: 1, height: 1, scaled: false });
});

test('the picture under the mat by default: 4 x 4 squares, the robot on the one in the middle', () => {
  assert.deepEqual(DEFAULT_MAP, { cols: 4, rows: 4, sx: 2, sy: 2 });
  assert.deepEqual(cleanMap(DEFAULT_MAP), DEFAULT_MAP, 'valid as it is');
  assert.deepEqual(mapRect(DEFAULT_MAP), { x0: -2.5, y0: -2.5, x1: 1.5, y1: 1.5 });
});
