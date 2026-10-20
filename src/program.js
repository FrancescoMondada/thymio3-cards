import { trace } from './lang.js';

// Ideal path of a program on the floor mat, in cells (x to the right, y up), starting at (0, 0)
// facing up. `h` is the heading in quarter turns, counter-clockwise like the gyroscope.
// poses[k] is the pose reached after the k-th step the robot takes, steps[k] = { index, code } says
// which card that step is (with repeats the same card is done several times, and an "if" that is
// not true leaves its card out), start is the pose before the first. For the four steps alone this is
// the program itself: poses[i] after card i. `colourAt(x, y)` is the colour of the floor cell where the
// robot stands, which the "if" cards ask for; at most `limit` steps are drawn.
export function layout(program, colourAt = () => undefined, limit = 400) {
  const start = { x: 0, y: 0, h: 0 };
  const steps = trace(program, colourAt, limit);
  return { start, poses: steps.map(({ x, y, h }) => ({ x, y, h })), steps: steps.map(({ index, code }) => ({ index, code })) };
}

// Bounding box (in cells, cell centres) of everything the robot visits.
export function bounds(program, colourAt) {
  const { start, poses } = layout(program, colourAt);
  const all = [start, ...poses];
  return {
    minX: Math.min(...all.map((p) => p.x)), maxX: Math.max(...all.map((p) => p.x)),
    minY: Math.min(...all.map((p) => p.y)), maxY: Math.max(...all.map((p) => p.y)),
  };
}

// Programs a child can start from. They are all closed or simple shapes on the mat.
export const EXAMPLES = [
  { id: 'line', program: 'FFF' },
  { id: 'back', program: 'FFBB' },
  { id: 'square', program: 'FRFRFRFR' },
  { id: 'l', program: 'FFFRFF' },
  { id: 'stairs', program: 'FRFLFRFLF' },
  { id: 'u', program: 'FFLFLFF' },
  // advanced mode: groups, repeats, and ifs on a painted floor ([cell x, cell y, colour], see spec.js)
  { id: 'loopSquare', program: '4(FR)', advanced: true },
  { id: 'zigzag', program: '3(FRFL)', advanced: true },
  { id: 'turnOnRed', program: '5(FrL)', advanced: true, floor: [[0, 2, 'r']] },
  { id: 'backOnGreen', program: '2(Fg(BB))', advanced: true, floor: [[0, 1, 'g']] },
  { id: 'alongRed', program: 'E(F)', advanced: true, floor: [[0, 0, 'r'], [0, 1, 'r'], [0, 2, 'r']] },
];
