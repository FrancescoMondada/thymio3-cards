// What the firmware "Sequence" mode is made of (main/sequence.c): four steps, at most 50,
// one step = 15 cm straight or a 90 degree turn. Shared by the interface and the simulator.
export const FORWARD = 'F';
export const BACKWARD = 'B';
export const LEFT = 'L';
export const RIGHT = 'R';
export const STEP_CODES = [FORWARD, BACKWARD, LEFT, RIGHT];
export const MAX_STEPS = 50;          // SEQUENCE_BUFFER_SIZE

export const CELL_MM = 150;           // one straight step = one 15 cm cell of the floor mat
export const TICK_MS = 20;            // the behaviors of the robot run at 50 Hz

// Factory value of the "15 cm" timer, in hardware timer ticks (5 ticks per microsecond).
export const FACTORY_15CM_TICKS = 9000000;
export const TICKS_PER_MS = 5000;

export const isStep = (c) => STEP_CODES.includes(c);

// "FxL?" -> "FL": keep the valid steps, at most MAX_STEPS.
export function cleanProgram(value) {
  const src = Array.isArray(value) ? value.join('') : String(value || '');
  let out = '';
  for (const c of src) if (isStep(c) && out.length < MAX_STEPS) out += c;
  return out;
}
