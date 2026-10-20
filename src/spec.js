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

// The advanced cards (see lang.js). One card, one character, so that a program stays a string.
//   ( )        a group: the cards between them count as one
//   2 .. 9     repeat the next card (or group) that many times
//   r y g c b p w k   if the ground under the robot is red, yellow, green, cyan, blue, purple, white
//                     or black (the 8 colours of the colour sensor, color_sensor.h), do the next card
//                     (or group); if not, skip it
//   E Y G C U P W K   the same eight colours, for a repeat card that has a colour instead of a number:
//                     do the next card (or group) again and again while the ground is that colour
//                     (E red, Y yellow, G green, C cyan, U blue, P purple, W white, K black: capital
//                     letters, but not R and B, which are steps)
export const OPEN = '(';
export const CLOSE = ')';
export const REPEAT_CODES = ['2', '3', '4', '5', '6', '7', '8', '9'];
export const COLOR_CODES = ['r', 'y', 'g', 'c', 'b', 'p', 'w', 'k'];
export const COLOR_NAMES = { r: 'red', y: 'yellow', g: 'green', c: 'cyan', b: 'blue', p: 'purple', w: 'white', k: 'black' };
export const WHILE_CODES = ['E', 'Y', 'G', 'C', 'U', 'P', 'W', 'K'];
export const WHILE_COLOR = { E: 'r', Y: 'y', G: 'g', C: 'c', U: 'b', P: 'p', W: 'w', K: 'k' };   // the colour a "while" card asks for
// every card, in the order of the five-bit codes of the live update (1..30, see script-core.js)
export const TOKEN_ALPHABET = 'FBLR()23456789rygcbpwkEYGCUPWK';
export const isOpen = (c) => c === OPEN;
export const isClose = (c) => c === CLOSE;
export const isRepeat = (c) => REPEAT_CODES.includes(c);
export const isColor = (c) => COLOR_CODES.includes(c);
export const isWhile = (c) => WHILE_CODES.includes(c);
export const isToken = (c) => isStep(c) || isOpen(c) || isClose(c) || isRepeat(c) || isColor(c) || isWhile(c);
export const isAdvancedCode = (c) => isToken(c) && !isStep(c);
// the kind of a card: 'step', 'open', 'close', 'repeat' (a number), 'while' (a colour, on the same card) or 'if'
export const kindOf = (c) => (isStep(c) ? 'step' : isOpen(c) ? 'open' : isClose(c) ? 'close' : isRepeat(c) ? 'repeat' : isWhile(c) ? 'while' : isColor(c) ? 'if' : null);

// "FxL?" -> "FL": keep the valid cards, at most MAX_STEPS.
export function cleanProgram(value) {
  const src = Array.isArray(value) ? value.join('') : String(value || '');
  let out = '';
  for (const c of src) if (isToken(c) && out.length < MAX_STEPS) out += c;
  return out;
}

// Does the program use anything but the four steps?
export const isAdvancedProgram = (program) => [...cleanProgram(program)].some(isAdvancedCode);

// The CSS class that colours a card: c-F, c-B, c-L, c-R, c-open, c-close, c-repeat, c-if
export const cardClass = (c) => `c-${isStep(c) ? c : kindOf(c) === 'while' ? 'repeat' : kindOf(c)}`;       // (a repeat card with a colour is a repeat card)
