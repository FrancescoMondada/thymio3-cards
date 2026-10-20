// Pure helpers around the robot script: no Vite-only imports, so Node can test them.
import { cleanProgram, isAdvancedProgram, MAX_STEPS, TOKEN_ALPHABET } from './spec.js';

// The script is uploaded over Bluetooth on every run: drop what the interpreter ignores.
// Lines that contain a quote keep their trailing comment (a '#' might be inside a string).
// Indentation goes from 4 spaces to 1 per level; the continuation lines of a bracket may have
// any indentation, so only whole groups of 4 leading spaces are touched.
export function minify(src) {
  const out = [];
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const body = /["']/.test(line) ? line : line.replace(/\s+#.*$/, '');
    out.push(body.replace(/^( {4})+/, (m) => ' '.repeat(m.length / 4)));
  }
  return out.join('\n') + '\n';
}

// A script that holds everything: the program is written in its header and run() is called at the
// end. Used when the module is not on the robot, and for the download of the settings page.
export function buildScriptFrom(source, program, { autoplay = true, minified = true } = {}) {
  const prog = cleanProgram(program);
  const src = source
    .replace(/^PROGRAM = ".*"$/m, `PROGRAM = "${prog}"`)
    .replace(/^AUTOPLAY = \d$/m, `AUTOPLAY = ${autoplay ? 1 : 0}`) + '\nrun()\n';
  return minified ? minify(src) : src;
}

// The mode as a module for the robot's file system: the same source, no call at the end. Uploading
// it takes ~5 s, so it is done once (the name carries a hash of the content, see moduleNameFor).
export function buildModuleFrom(source) {
  return minify(source);
}

// 32-bit FNV-1a, in hex.
export function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// "cards_1a2b3c4d": a file name of the robot is at most 30 bytes with its ".py".
export const MODULE_PREFIX = 'cards_';
export const moduleNameFor = (moduleText) => `${MODULE_PREFIX}${hash32(moduleText)}`;

// The lights of the mode's first tick (src/py/lights.py) for a program and a phase of the pulse.
export function lightsFor(lightsText, program, phase = 0) {
  const steps = Math.min(cleanProgram(program).length, 50);
  return minify(lightsText.replace(/^P = \d+$/m, `P = ${Math.floor(phase)}`).replace(/^N = \d+$/m, `N = ${steps}`));
}

// What is sent at every start once the module is on the robot: the two lines that import the mode and
// run it. A start that only waits for the cards (not a run) begins with the lights of the mode's first
// tick: importing the mode takes the robot a good while (it is compiled), during which the lights would
// stay out, since the firmware puts them out when the previous script ends.
export function launcherFor(name, program, { autoplay = true, phase = 0, lights = '' } = {}) {
  // (a full buffer of 50 steps shows the overflow animation instead: no lights for that one)
  const lit = !autoplay && lights && cleanProgram(program).length < 50 ? lightsFor(lights, program, phase) : '';
  return `${lit}import ${name}\n${name}.run("${cleanProgram(program)}", ${autoplay ? 1 : 0}${phase ? `, ${phase}` : ''})\n`;
}

// Where the pulse of the lights should be, so that a restart does not begin it again: a tick count of a
// clock shared by all starts (20 ms ticks, 384 = a whole number of turns of both the pulse and the
// circle). `lead` is what the robot takes to start, to be added.
export const pulsePhase = (nowMs, lead = 450) => Math.floor((nowMs + lead) / 20) % 384;

// ---- live update: the cards of a running mode, without restarting it (experimental) ------------------
// The firmware stores the LEDs it is given by the Bluetooth command and the mode reads them back (see
// rx_poll in sequence_mode.py, which is the other end of this). A frame is twelve 4-bit values, one
// per colour channel of the four body LEDs: 0 message number, 1 always 15 (the mode never writes 15 on
// that channel), 2 last-frame flag (8) + frame number, 3..10 eight nibbles of the message, 11 checksum.
// The message: two nibbles (a flag for advanced cards, then the number of cards), then the cards: for the
// four steps alone two bits each (F B L R), two to a nibble; with advanced cards five bits each (their number
// in TOKEN_ALPHABET, from 1), packed one after the other. At most eight frames: 49 advanced cards.
export const LIVE_MARK = 15;
const LIVE_CODE = { F: 0, B: 1, L: 2, R: 3 };
const LIVE_STEPS = 'FBLR';
const LIVE_ALPHABET = TOKEN_ALPHABET;
const MAX_FRAMES = 8;
const liveSum = (n) => { let t = 5; for (let i = 0; i < 11; i++) t += (i + 1) * n[i]; return t & 15; };

// The frames that carry a program (1 to 8 of them), or null when it does not fit in eight.
export function liveFrames(program, msg = 1) {
  const cards = cleanProgram(program);
  const ext = isAdvancedProgram(cards) ? 1 : 0;
  const stream = [(ext << 3) | (cards.length >> 4), cards.length & 15];
  if (!ext) {
    for (let k = 0; k < cards.length; k += 2) stream.push((LIVE_CODE[cards[k]] << 2) | (k + 1 < cards.length ? LIVE_CODE[cards[k + 1]] : 0));
  } else {
    let bits = 0, n = 0;
    for (const c of cards) {
      bits = (bits << 5) | (LIVE_ALPHABET.indexOf(c) + 1);
      n += 5;
      while (n >= 4) { stream.push((bits >> (n - 4)) & 15); n -= 4; bits &= (1 << n) - 1; }
    }
    if (n > 0) stream.push((bits << (4 - n)) & 15);
  }
  const count = Math.max(1, Math.ceil(stream.length / 8));
  if (count > MAX_FRAMES) return null;
  const frames = [];
  for (let i = 0; i < count; i++) {
    const data = stream.slice(i * 8, i * 8 + 8);
    while (data.length < 8) data.push(0);
    const frame = [msg & 15, LIVE_MARK, (i === count - 1 ? 8 : 0) | i, ...data, 0];
    frame[11] = liveSum(frame);
    frames.push(frame);
  }
  return frames;
}

// What the mode does with the frames it reads: the same as rx_poll. Returns the program when a message
// is complete, null otherwise (an incomplete message, a frame that is not one).
export class LiveReceiver {
  constructor() { this.msg = -1; this.got = new Map(); this.last = -1; }

  push(n) {
    if (n.length !== 12 || n[1] !== LIVE_MARK || liveSum(n) !== n[11]) return null;
    if (n[0] !== this.msg) { this.msg = n[0]; this.got = new Map(); this.last = -1; }
    this.got.set(n[2] & 7, n.slice(3, 11));
    if (n[2] & 8) this.last = n[2] & 7;
    if (this.last < 0) return null;
    let stream = [];
    for (let i = 0; i <= this.last; i++) {
      if (!this.got.has(i)) return null;
      stream = stream.concat(this.got.get(i));
    }
    this.got = new Map();
    this.last = -1;
    const ext = stream[0] >> 3;
    const count = (stream[0] & 7) * 16 + stream[1];
    if (count > MAX_STEPS) return null;
    let program = '';
    if (!ext) {
      if (stream.length < 2 + Math.ceil(count / 2)) return null;
      for (let k = 0; k < count; k++) {
        const v = stream[2 + (k >> 1)];
        program += LIVE_STEPS[k % 2 === 0 ? (v >> 2) & 3 : v & 3];
      }
      return program;
    }
    if (stream.length < 2 + Math.ceil((5 * count) / 4)) return null;
    let bits = 0, have = 0, pos = 2;
    for (let k = 0; k < count; k++) {
      while (have < 5) { bits = (bits << 4) | stream[pos]; pos += 1; have += 4; }
      have -= 5;
      const code = (bits >> have) & 31;
      bits &= (1 << have) - 1;
      if (code < 1 || code > LIVE_ALPHABET.length) return null;
      program += LIVE_ALPHABET[code - 1];
    }
    return program;
  }
}

// A frame as the Bluetooth command of the API wants it (thymio.setActuatorState), and back. What the
// command also carries (the ring and the Lego LEDs, the motors, a sound, the other LEDs) is set to what
// the mode shows anyway, or to nothing: the mode puts its own lights back at its next tick (20 ms).
const nib = (v) => Math.max(0, Math.min(15, Math.round(v)));
export const liveActuator = (frame, { circle = new Array(8).fill(0), lego = 0 } = {}) => ({
  circleLEDs: circle.map(nib),
  frontLegoLEDs: Array.from({ length: 8 }, (_, i) => (i >= 8 - Math.min(lego, 8) ? 15 : 0)),
  rearLegoLEDs: Array.from({ length: 8 }, (_, i) => (i >= 16 - Math.min(lego, 16) ? 15 : 0)),
  flRGB: { r: frame[0], g: frame[1], b: frame[2] },
  frRGB: { r: frame[3], g: frame[4], b: frame[5] },
  blRGB: { r: frame[6], g: frame[7], b: frame[8] },
  brRGB: { r: frame[9], g: frame[10], b: frame[11] },
  motorLeft: 0, motorRight: 0, sound: 0,
  smallBottomRGB: { r: 0, g: 0, b: 0 }, smallBackRGB: { r: 0, g: 0, b: 0 },
  buttonLEDs: [0, 0, 0, 0], receiverLED: 0, microphoneLED: false,
});
export const liveNibbles = (a) => [a.flRGB, a.frRGB, a.blRGB, a.brRGB].flatMap((c) => [c.r, c.g, c.b]);

// The ring of the mode while it waits for cards, at a tick of the clock shared with the launcher (see
// pulsePhase): the same as record_animation, 0..16 (a Bluetooth command cannot say 16: it is cut to 15).
export function ringAt(phaseTicks) {
  const state = (2 * Math.floor(phaseTicks)) & 255;
  const fixed = Math.floor(state / 16), lo = state & 15;
  const ring = new Array(8).fill(0);
  ring[fixed & 7] = 16;
  ring[(fixed - 2) & 7] = 16 - lo;
  ring[(fixed + 2) & 7] = lo;
  ring[(fixed + 4) & 7] = lo;
  return ring;
}

// stdout arrives in BLE notifications cut anywhere: rebuild complete lines.
// A line ends with a newline, or with \x1e (record separator): the script pads and ends its events
// that way so that the firmware sends them at once (see say() in sequence_mode.py).
export class LineAssembler {
  constructor() { this.rest = ''; }
  push(text) {
    const parts = (this.rest + text).split(/[\r\n\x1e]+/);
    this.rest = parts.pop();
    return parts.filter((l) => l.trim());           // blank lines go; the others keep their indentation (a Traceback has some)
  }
}

// One line of stdout -> an event, or null for anything else (print() of other scripts, noise).
export function parseRobotLine(line) {
  const l = line.trim();
  // (a Traceback is several lines: the robot backend reads it as a whole)
  if (/^\w*(Error|Exception)\b/.test(l)) return { type: 'error', message: l };
  const m = /^@@(\w+)\s*(.*)$/.exec(l);
  if (!m) return null;
  const [, word, rest] = m;
  const a = rest.split(/\s+/).filter(Boolean);
  switch (word) {
    case 'hello': return { type: 'hello', version: Number(a[0]) || 1 };
    case 'cal': return { type: 'cal', fw: Number(a[0]), bw: Number(a[1]), rot90: Number(a[2]) };
    case 'bat': { const v = Number(a[0]); return { type: 'battery', volts: v > 100 ? v / 1000 : v }; }
    case 'prog': return { type: 'prog', program: a[0] === '-' ? '' : cleanProgram(a[0]) };
    case 'state': return { type: 'state', state: a[0] };
    case 'step': return { type: 'step', index: Number(a[0]), code: a[1] };
    case 'moved': return { type: 'moved', index: Number(a[0]) };
    case 'sense': return { type: 'sense', index: Number(a[0]) };
    case 'if': return { type: 'if', index: Number(a[0]), taken: a[1] === '1', seen: a[2] || '?', hsv: a.length >= 6 ? [Number(a[3]), Number(a[4]), Number(a[5])] : null };
    case 'end': return { type: 'end' };
    case 'exit': return { type: 'exit' };
    case 'bye': return { type: 'bye' };
    default: return null;
  }
}
