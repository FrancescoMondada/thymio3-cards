// The detection of an object in the way of a forward step (the real robot only, see sequence_mode.py): off unless the adult asks for it, and
// then the reading of the sensor in the middle at the front above which an object is in the way. The sensors read from 0 (nothing) to about
// 4500 (touching): the higher the limit, the closer the object has to be.
export const OBSTACLE_DEFAULT = 3000;
export const OBSTACLE_MIN = 100;
export const OBSTACLE_MAX = 4500;

// A limit as it is kept: a whole number between the two, or the default
export function cleanObstacleLimit(value) {
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isInteger(n) && n >= OBSTACLE_MIN && n <= OBSTACLE_MAX ? n : OBSTACLE_DEFAULT;
}
