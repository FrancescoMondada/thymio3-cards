// The colour of the ground the virtual robot reads from the picture under the mat: one of the eight colours of
// the cards (spec.js), or none.
//
// A pixel is named the way a person names it: sectors of hue around the eight colours. The thresholds of
// the robot's sensor (ground_color() in sequence_mode.py) are not used on purpose: they are those of the
// sensor's own hue, where the green of a screen (hue 120) would come out cyan and its yellow (60) green.
// A real robot reads the real ground; this is for a picture the child sees.
import { COLOR_CODES } from './spec.js';

export const ACHROMATIC = 20;     // saturation (%) under which a pixel has no colour
export const DARK = 20;           // value (%) under which a pixel is black
export const LIGHT = 65;          // value (%) over which a colourless pixel is white (between: grey, none of the eight)
const SECTORS = [[30, 'r'], [90, 'y'], [150, 'g'], [210, 'c'], [262, 'b'], [330, 'p']];   // up to this hue; from 330 on, red again

export function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, max === 0 ? 0 : (d / max) * 100, (max / 255) * 100];
}

// 'r' 'y' 'g' 'c' 'b' 'p' 'w' 'k', or undefined (a grey, or a pixel that is not there)
export function colourOfPixel(r, g, b, a = 255) {
  if (a < 128) return undefined;
  const [h, s, v] = rgbToHsv(r, g, b);
  if (v <= DARK) return 'k';
  if (s < ACHROMATIC) return v > LIGHT ? 'w' : undefined;
  for (const [upTo, c] of SECTORS) if (h < upTo) return c;
  return 'r';
}

// The colour of each square of a picture that was drawn into `image` ({ data, width, height }: RGBA, as
// ImageData) over cols x rows squares: the colour most of the middle of the square has (a thin line or a
// label on it does not matter), the first of rygcbpwk when two have as many. Keys are "px,py", the square
// counted from the bottom left like everything else (y up); squares of no colour are left out.
export function scanSquares(image, cols, rows) {
  const { data, width, height } = image;
  const cells = {};
  for (let py = 0; py < rows; py++) {
    for (let px = 0; px < cols; px++) {
      const x0 = Math.floor(((px + 0.25) * width) / cols), x1 = Math.max(x0 + 1, Math.ceil(((px + 0.75) * width) / cols));
      const row = rows - 1 - py;                                          // the picture's first row is its top
      const y0 = Math.floor(((row + 0.25) * height) / rows), y1 = Math.max(y0 + 1, Math.ceil(((row + 0.75) * height) / rows));
      const votes = {};
      for (let y = y0; y < y1 && y < height; y++) {
        for (let x = x0; x < x1 && x < width; x++) {
          const i = (y * width + x) * 4;
          const c = colourOfPixel(data[i], data[i + 1], data[i + 2], data[i + 3]) || '?';
          votes[c] = (votes[c] || 0) + 1;
        }
      }
      let best = '?', most = 0;
      for (const c of [...COLOR_CODES, '?']) if ((votes[c] || 0) > most) { best = c; most = votes[c]; }
      if (best !== '?') cells[`${px},${py}`] = best;
    }
  }
  return cells;
}

// The colour of the ground at a cell (x, y) of the robot's frame: what the brush painted there, else the
// colour of the picture's square under it (the picture's square of the robot's start is (sx, sy)).
export function groundAt(painted, cells, sx = 0, sy = 0) {
  return (x, y) => painted[`${x},${y}`] || (cells ? cells[`${sx + x},${sy + y}`] : undefined);
}
