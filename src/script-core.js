// Pure helpers around the robot script: no Vite-only imports, so Node can test them.
import { cleanProgram } from './spec.js';

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

// What is sent at every start once the module is on the robot: two lines.
export function launcherFor(name, program, { autoplay = true, phase = 0 } = {}) {
  return `import ${name}\n${name}.run("${cleanProgram(program)}", ${autoplay ? 1 : 0}${phase ? `, ${phase}` : ''})\n`;
}

// Where the pulse of the lights should be, so that a restart does not begin it again: a tick count of a
// clock shared by all starts (20 ms ticks, 384 = a whole number of turns of both the pulse and the
// circle). `lead` is what the robot takes to start, to be added.
export const pulsePhase = (nowMs, lead = 450) => Math.floor((nowMs + lead) / 20) % 384;

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
    case 'end': return { type: 'end' };
    case 'exit': return { type: 'exit' };
    case 'bye': return { type: 'bye' };
    default: return null;
  }
}
