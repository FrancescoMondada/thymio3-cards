// How the mat is framed. The robot is always at the same place on the screen, facing up; it is the
// mat that turns and slides under it. So forward is always up and backward always down, like the
// arrows of the cards.
//
// Poses and points are in cells, y up, the heading `th` in degrees counter-clockwise (0 = up).
// "Screen" coordinates are those of the SVG: the robot is the origin, x to the right, y down.

export const FOLLOW_CELLS = 4.6;     // cells across the smaller side of the screen when the path is hidden
export const ROBOT_AT = 0.58;        // the robot's height on the screen, from the top: a little more room ahead

const rad = (deg) => (deg * Math.PI) / 180;

// A point of the mat, where it is on the screen.
export function toScreen(point, pose) {
  const dx = point.x - pose.x;
  const dy = -(point.y - pose.y);
  const c = Math.cos(rad(pose.th)), s = Math.sin(rad(pose.th));
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

// The point of the mat that is at a place of the screen (continuous cells).
export function toWorld(sx, sy, pose) {
  const c = Math.cos(rad(pose.th)), s = Math.sin(rad(pose.th));
  return { x: pose.x + (sx * c + sy * s), y: pose.y - (-sx * s + sy * c) };
}

// The same transform as an SVG matrix, for the group that holds the mat: points written as (x, -y)
// in it land where toScreen() says. Equal to `rotate(th) translate(-x, y)`.
export function worldMatrix(pose) {
  const c = Math.cos(rad(pose.th)), s = Math.sin(rad(pose.th));
  return [c, s, -s, c, -pose.x * c - pose.y * s, -pose.x * s + pose.y * c];
}

// The part of the mat on the screen, for a zoom of `cells` across its smaller side.
export function viewBox(cells, aspect) {
  const w = aspect >= 1 ? cells * aspect : cells;
  const h = aspect >= 1 ? cells : cells / aspect;
  return { x: -w / 2, y: -ROBOT_AT * h, w, h };
}

// The zoom: fixed when the path is hidden (it must not say anything about the program); with the
// path shown, wide enough to keep all of it on the screen whatever the robot's heading.
export function zoomFor({ pose, points, aspect, showPath }) {
  if (!showPath) return FOLLOW_CELLS;
  let far = 0;
  for (const p of points) far = Math.max(far, Math.hypot(p.x - pose.x, p.y - pose.y));
  // the largest circle around the robot that fits in the screen, per cell of the smaller side
  const k = aspect >= 1 ? Math.min(aspect / 2, 1 - ROBOT_AT) : Math.min(0.5, (1 - ROBOT_AT) / aspect);
  return Math.max(FOLLOW_CELLS, (far + 1.3) / k);
}

// Where to show a pointer to something that is out of the screen: on its edge, towards it.
export function edgePointer(screen, box, margin = 0.8) {
  const l = box.x + margin, r = box.x + box.w - margin, t = box.y + margin, b = box.y + box.h - margin;
  if (screen.x >= l && screen.x <= r && screen.y >= t && screen.y <= b) return { visible: false };
  let k = Infinity;
  if (screen.x > 0) k = Math.min(k, r / screen.x); else if (screen.x < 0) k = Math.min(k, l / screen.x);
  if (screen.y > 0) k = Math.min(k, b / screen.y); else if (screen.y < 0) k = Math.min(k, t / screen.y);
  return { visible: true, x: screen.x * k, y: screen.y * k, angle: (Math.atan2(screen.y, screen.x) * 180) / Math.PI };
}
