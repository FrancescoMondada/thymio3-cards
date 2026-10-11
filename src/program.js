import { FORWARD, BACKWARD, LEFT, RIGHT, cleanProgram } from './spec.js';

// Ideal path of a program on the floor mat, in cells (x to the right, y up), starting at (0, 0)
// facing up. `h` is the heading in quarter turns, counter-clockwise like the gyroscope.
// poses[i] is the pose reached after step i; poses[-1] is the start.
export function layout(program) {
  const steps = cleanProgram(program);
  const start = { x: 0, y: 0, h: 0 };
  const poses = [];
  let p = start;
  for (const s of steps) {
    let { x, y, h } = p;
    if (s === LEFT) h += 1;
    else if (s === RIGHT) h -= 1;
    else {
      const dir = s === FORWARD ? 1 : -1;
      const q = ((h % 4) + 4) % 4;
      const dx = [0, -1, 0, 1][q];
      const dy = [1, 0, -1, 0][q];
      x += dir * dx;
      y += dir * dy;
    }
    p = { x, y, h };
    poses.push(p);
  }
  return { start, poses };
}

// Bounding box (in cells, cell centres) of everything the robot visits.
export function bounds(program) {
  const { start, poses } = layout(program);
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
];
