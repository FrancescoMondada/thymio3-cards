// A demonstration robot with the interface of thymio3-ts-api (used with `?fakerobot` in the address).
//
// It stands in for Web Bluetooth and the robot, so that the whole interface (connection, module on
// the robot, mode started again at every change, replay, stop...) runs in a browser with no
// hardware: the same DOM events, the delays of the real link (an upload of 15 KB takes ~5 s), the
// firmware's habits (stdout sent in batches, a Traceback when a script is stopped, the module kept
// in the robot's files). The mode itself is the JavaScript port of the Python one (sim/mode.js).
//
// window.fakeRobot lets a test play the robot's side: press('F'), exit(), drop('status'), ...
import { VirtualThymio } from '../sim/physics.js';
import { SimSequence } from '../sim/mode.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fire = (type, detail) => document.dispatchEvent(new CustomEvent(type, { detail }));
const bytes = (text) => new TextEncoder().encode(text).length;
const BYTE_MS = 0.33;                       // 15 KB in ~5 s, as measured on a robot

const KEY = 'fakerobot.files';
const files = new Map();
try { for (const [k, v] of JSON.parse(localStorage.getItem(KEY) || '[]')) files.set(k, v); } catch { /* none */ }
if (!files.size) files.set('boot.py', '# boot\n'.padEnd(139, ' '));
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify([...files])); } catch { /* private mode */ } };

let connected = false;
let ram = '';
let loaded = '';
let run = null;                             // the script that runs: { timer, mode, robot, kind }
const flags = { dropStatus: false, slow: 1 };

// ---- what the robot prints ---------------------------------------------------------------------
// The firmware sends stdout at 100 bytes or after 1 s of silence; the mode pads its lines to 100 bytes
// and ends them with \x1e so that they go at once. Lines that are not padded wait for the second.
let pending = '';
let flushTimer = 0;
const flush = () => {
  clearTimeout(flushTimer);
  flushTimer = 0;
  while (pending.length) { fire('thymio-std-out-values', pending.slice(0, 240)); pending = pending.slice(240); }
};
const print = (text, padded) => {
  pending += text;
  if (padded || pending.length >= 100) flush();
  else if (!flushTimer) flushTimer = setTimeout(flush, 1000);
};
const say = (...parts) => {
  const s = `@@${parts.join(' ')}`;
  print(`${s}${' '.repeat(Math.max(0, 99 - s.length))}\x1e`, true);
};

const lineOf = (e) => {
  switch (e.type) {
    case 'hello': return say('hello', 1);
    case 'cal': return say('cal', e.fw, e.bw, e.rot90);
    case 'prog': return say('prog', e.program || '-');
    case 'state': return say('state', e.state);
    case 'step': return say('step', e.index, e.code);
    case 'moved': return say('moved', e.index);
    case 'end': return say('end');
    case 'bye': return say('bye');
    default: return undefined;
  }
};

// ---- the mode running on the "robot" ----------------------------------------------------------------
function stopRun(withTraceback) {
  if (!run) return;
  const r = run;
  run = null;
  clearInterval(r.timer);
  if (r.kind === 'test') { print('@@test done\r\n', true); setTimeout(() => fire('thymio-python-execution-status', false), 40); return; }
  say('bye');
  if (withTraceback) {
    setTimeout(() => print('Traceback (most recent call last):\r\n  File "mp_script", line 2, in <module>\r\n  File "cards_fake.py", line 569, in run\r\nKeyboardInterrupt: \r\n', false), 300);
    setTimeout(() => flush(), 1300);                // not padded: it leaves with the next batch, a second later
  }
  if (!flags.dropStatus) setTimeout(() => fire('thymio-python-execution-status', false), 120);
}

function startMode(program, autoplay, phase = 0) {
  const robot = new VirtualThymio();
  const mode = new SimSequence(robot, program, (e) => lineOf(e));
  const r = { robot, mode, kind: 'mode', n: 0, timer: 0 };
  run = r;
  setTimeout(() => {                                // the interpreter compiles the module and starts
    if (run !== r) return;
    mode.start({ autoplay, phase });
    say('bat', 3900);
    r.timer = setInterval(() => {
      for (let i = 0; i < 10; i++) {
        if (i === 0) mode.tick();
        robot.step();
      }
    }, 20 / flags.slow);
  }, 350);
}

function execute(script) {
  const launcher = /^import (cards_\w+)\s+\1\.run\("([FBLR]*)", (\d)(?:, (\d+))?\)/.exec(script);
  const whole = /^PROGRAM = "([FBLR]*)"/m.exec(script);
  if (launcher) {
    if (![...files.keys()].includes(`${launcher[1]}.py`)) {
      print(`Traceback (most recent call last):\r\n  File "mp_script", line 1, in <module>\r\nImportError: no module named '${launcher[1]}'\r\n`, true);
      setTimeout(() => fire('thymio-python-execution-status', false), 100);
      return;
    }
    startMode(launcher[2], launcher[3] === '1', Number(launcher[4] || 0));
  } else if (whole && /\nrun\(\)\s*$/.test(script)) {
    startMode(whole[1], /^AUTOPLAY = 1$/m.test(script));
  } else if (script.includes('@@test start')) {
    run = { kind: 'test', timer: 0 };
    print('@@test start\r\n', true);
    setTimeout(() => stopRun(false), 1500);
  } else {
    setTimeout(() => fire('thymio-python-execution-status', false), 50);
  }
}

// ---- the API ----------------------------------------------------------------------------------------------
export async function requestAndConnect() {
  await sleep(600);
  connected = true;
  fire('thymio-connected', true);
  fire('thymio-connected', true);                   // the real API says it twice
}
export const isConnected = () => connected;
export async function disconnect() {
  stopRun(false);
  connected = false;
  fire('thymio-connected', false);
}
export const getDeviceName = () => 'THYMIO3-FAKE';
export async function getFirmwareInfo() { await sleep(150); return { esp32_ver: '1.10.2', stm32_ver: 0 }; }
export async function stopSensorStreaming() { await sleep(40); }
export async function listFiles() { await sleep(80); return [...files].map(([name, text]) => ({ name, size: bytes(text) })); }
export async function uploadFile(file) { const text = await file.text(); await sleep(bytes(text) * BYTE_MS); ram = text; }
export async function saveFile(name) { await sleep(150); files.set(name, ram); persist(); }
export async function deleteFile(name) { files.delete(name); persist(); }
export async function freeMemory() { ram = ''; }
export async function sendPythonScript(text) {
  await sleep(40 + bytes(text) * BYTE_MS);
  loaded = text;
  fire('thymio-python-load-result', { success: true, code: 0, message: 'Script loaded successfully' });
  fire('thymio-python-execution-status', true);
}
export async function executeLoadedScript() {
  await sleep(100);
  if (run) return;                                  // "Another script was already running"
  execute(loaded);
}
export async function stopScriptExecution() {
  await sleep(60);
  if (run) stopRun(true);
}

// ---- the robot's own side, for tests ---------------------------------------------------------------------
if (typeof window !== 'undefined') {
  window.fakeRobot = {
    flags,
    get files() { return [...files.keys()]; },
    get running() { return Boolean(run); },
    // a step recorded with the robot's own buttons
    press(code) {
      if (!run?.mode) return;
      const m = run.mode;
      m.seq = m.seq.slice(0, m.wr);
      m.seq.push(code);
      m.wr += 1;
      lineOf({ type: 'prog', program: m.seq.slice(0, m.wr).join('') });
    },
    exit() { if (run?.mode) { say('exit'); stopRun(false); } },
    reset() { files.clear(); persist(); },
  };
}
