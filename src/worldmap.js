// A picture laid under the grid of the mat, for the virtual robot (settings). It covers `cols` x `rows`
// squares of 15 cm, and the robot starts on one of them, the square (sx, sy) counted from the bottom left
// (y up, like the rest). The robot's own frame stays the frame of the program: its start square is
// (0, 0), so the picture is what moves: its rectangle, in that frame, is mapRect().
//
// Everything painted or planted on the mat (floor colours, the flag) is in the robot's frame too. To stay on
// the same square of the picture when the robot's start is moved, it is shifted the other way (shiftCells).
export const MAX_CELLS = 40;
export const MAX_SIDE_PX = 2048;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const clampSize = (n) => clamp(Math.round(Number(n)) || 1, 1, MAX_CELLS);

// the square in the middle (for an even size, the one right of / above the middle)
export const centerCell = (cols, rows) => ({ sx: Math.floor(cols / 2), sy: Math.floor(rows / 2) });
export const clampStart = ({ sx, sy }, cols, rows) => ({ sx: clamp(Math.round(sx), 0, cols - 1), sy: clamp(Math.round(sy), 0, rows - 1) });

// How many rows a picture of this size needs to keep its proportions over `cols` columns.
export const suggestRows = (cols, width, height) => (width > 0 && height > 0 ? clampSize((cols * height) / width) : cols);

// The picture's rectangle in the robot's frame, in squares (centres of squares are whole numbers).
export function mapRect({ cols, rows, sx, sy }) {
  return { x0: -sx - 0.5, y0: -sy - 0.5, x1: cols - sx - 0.5, y1: rows - sy - 0.5 };
}

// The square of the picture under a point of the robot's frame (a touch), kept on the picture.
export function cellUnder(w, map) {
  return clampStart({ sx: map.sx + w.x, sy: map.sy + w.y }, map.cols, map.rows);
}

// The picture that is under the mat until another one is chosen: the map of the Thymio town, 4 x 4 squares
// (src/assets/Tapis_Thymio.jpg, made from docs/Tapis_Thymio.png), the robot on the square in the middle.
export const DEFAULT_MAP = { cols: 4, rows: 4, ...centerCell(4, 4) };

// What the stage shows while the robot is being placed: the whole picture, a little margin around it
// (SVG units: y down).
export function viewForMap(map, pad = 0.35) {
  const r = mapRect(map);
  return { x: r.x0 - pad, y: -r.y1 - pad, w: map.cols + 2 * pad, h: map.rows + 2 * pad };
}

// "x,y" -> value, moved by (dx, dy) squares
export function shiftCells(cells, dx, dy) {
  const out = {};
  for (const [key, v] of Object.entries(cells || {})) {
    const [x, y] = key.split(',').map(Number);
    out[`${x + dx},${y + dy}`] = v;
  }
  return out;
}

export const shiftPoint = (p, dx, dy) => (p ? { x: p.x + dx, y: p.y + dy } : p);

// A map as it is kept: sizes and start made valid.
export function cleanMap(m) {
  if (!m || typeof m !== 'object') return null;
  const cols = clampSize(m.cols), rows = clampSize(m.rows);
  const start = clampStart({ sx: Number.isFinite(m.sx) ? m.sx : centerCell(cols, rows).sx, sy: Number.isFinite(m.sy) ? m.sy : centerCell(cols, rows).sy }, cols, rows);
  return { cols, rows, ...start };
}

// The size a picture is kept at: no side longer than `max` pixels (a photo from a tablet would fill the browser's storage).
export function fitWithin(w, h, max) {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)), scaled: k < 1 };
}
