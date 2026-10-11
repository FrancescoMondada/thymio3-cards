// The link to a real robot, without Bluetooth: RobotBackendCore talks to a fake thymio3-ts-api, and
// that fake "robot" runs the real MicroPython (the whole mode, or the module and its two-line launcher)
// on the virtual robot of tests/fake_robot.py. What the script prints goes back through the stdout
// notifications, cut in small pieces like BLE does.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { RobotBackendCore, SELF_TEST_SCRIPT } from '../src/robot/robot-backend-core.js';
import { RobotSync } from '../src/robot/sync.js';
import { buildScriptFrom, buildModuleFrom, launcherFor, moduleNameFor } from '../src/script-core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(here, '..', 'src', 'py', 'sequence_mode.py'), 'utf8');
const MODULE_TEXT = buildModuleFrom(SOURCE);
const MODULE = { name: moduleNameFor(MODULE_TEXT), text: MODULE_TEXT };
const EV = { connected: 'c', manualReconnect: 'm', stdout: 'out', pyStatus: 'py', pyLoad: 'ld' };
const tick = () => new Promise((r) => setImmediate(r));
const until = async (cond, ms = 5000) => {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await tick(); }
};

// What the robot prints when it runs `script`, with the files it holds as importable modules.
function pythonStdout(script, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-live-'));
  try {
    const file = path.join(dir, 'script.py');
    fs.writeFileSync(file, script);
    const args = ['-I', path.join(here, 'test_sequence_mode.py'), '--stdout', file, '60000'];
    const imported = new Set([...script.matchAll(/^import (\w+)/gm)].map((m) => `${m[1]}.py`));   // only what it imports
    for (const [name, text] of files) {
      if (!imported.has(name)) continue;
      const p = path.join(dir, name);
      fs.writeFileSync(p, text);
      args.push('--module', `${name.replace(/\.py$/, '')}=${p}`);
    }
    const run = spawnSync('python3', args, { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const lines = run.stdout.split('\n').filter(Boolean).map((l) => l.slice(l.indexOf('\t') + 1));
    // the harness ends the script (after 60 virtual seconds) and its cleanup says "bye": the real robot
    // only does when it is stopped
    while (lines.length && /^@@bye/.test(lines.at(-1))) lines.pop();
    return lines;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function setup({ silent = false, failUpload = false, extraLines = [], helloTimeoutMs = 2000, moduleHelloTimeoutMs = 2000, firmware = 'now', firmwareTimeoutMs = 6000, files = [], withModule = false, brokenImport = false, running = false, noFiles = false, stopFails = 0, hangUpload = false, launchLinkError = false, noStopStatus = false, uploadDelay = 0 } = {}) {
  const doc = new EventTarget();
  const win = new EventTarget();
  const fire = (type, detail) => doc.dispatchEvent(new CustomEvent(type, { detail }));
  const calls = [];
  const stored = new Map(files);
  let ram = '';
  let robotRuns = running;                  // the robot still runs a script of a previous page
  let stopsToFail = stopFails;
  const fake = {
    script: '', files: stored, calls,
    isConnected: () => true,
    disconnect: async () => { calls.push('disconnect'); },
    requestAndConnect: async () => { fire(EV.connected, true); },
    getFirmwareInfo: () => (firmware === 'never' ? new Promise(() => {}) : Promise.resolve({ esp32_ver: '1.10.2' })),
    getDeviceName: () => 'Thymio-test',
    async listFiles() {
      calls.push('list');
      if (noFiles) return new Promise(() => {});
      return [...stored].map(([name, text]) => ({ name, size: Buffer.byteLength(text) }));
    },
    async uploadFile(file) { calls.push(`uploadFile ${file.name}`); ram = await file.text(); },
    async saveFile(name) { calls.push(`saveFile ${name}`); stored.set(name, ram); },
    async deleteFile(name) { calls.push(`deleteFile ${name}`); stored.delete(name); },
    async freeMemory() { calls.push('freeMemory'); },
    async stopSensorStreaming() { calls.push('streamOff'); },
    async sendPythonScript(script) {
      calls.push('send');
      if (hangUpload) return new Promise(() => {});
      if (uploadDelay) await new Promise((r) => setTimeout(r, uploadDelay));
      if (failUpload) throw new Error('[Python upload]: Script too big');
      fake.script = script;
      fire(EV.pyStatus, true);
    },
    async executeLoadedScript() {
      calls.push('exec');
      if (launchLinkError && /^import cards_/.test(fake.script)) throw Object.assign(new Error('GATT operation failed for unknown reason.'), { name: 'NotSupportedError' });
      if (silent) return;
      let lines;
      if (brokenImport && /^import cards_/.test(fake.script)) {
        lines = ['Traceback (most recent call last):', '  File "mp_script", line 1, in <module>', "ImportError: no module named 'cards_x'"];
      } else {
        lines = [...pythonStdout(fake.script, stored), ...extraLines];
      }
      const text = lines.map((l) => (l.includes('\x1e') ? l : `${l}\r\n`)).join('');      // the mode's own lines end by themselves
      robotRuns = true;
      (async () => {
        for (let i = 0; i < text.length; i += 11) { fire(EV.stdout, text.slice(i, i + 11)); await tick(); }
        if (text.includes('@@test done') || brokenImport && /^import cards_/.test(fake.script)) { robotRuns = false; fire(EV.pyStatus, false); }
      })();
    },
    async stopScriptExecution() {
      calls.push('stop');
      if (stopsToFail > 0) { stopsToFail--; throw Object.assign(new Error('GATT operation failed for unknown reason.'), { name: 'NotSupportedError' }); }
      if (robotRuns) {
        robotRuns = false;
        setTimeout(() => {
          fire(EV.stdout, `@@bye${' '.repeat(95)}\x1e`);
          fire(EV.stdout, 'Traceback (most recent call last):\r\n  File "mp_script", line 567, in <module>\r\n  File "mp_script", line 564, in run\r\nKeyboardInterrupt: \r\n');
          if (!noStopStatus) fire(EV.pyStatus, false);          // (the API's notification does not always come)
        }, 5);
      }
    },
  };
  const events = [];
  const log = [];
  const backend = new RobotBackendCore((e) => events.push(e), {
    thymio: fake, events: EV, doc, win, helloTimeoutMs, moduleHelloTimeoutMs, haltTimeoutMs: 500, firmwareTimeoutMs, unknownHaltMs: 40, uploadTimeoutMs: hangUpload ? 60 : 30000,
    buildScript: (p, o) => buildScriptFrom(SOURCE, p, o),
    launcher: (name, p, o) => launcherFor(name, p, o),
    module: withModule ? MODULE : null,
    onLog: (kind, text) => { log.push({ kind, text }); if (process.env.DBG) console.error(`[${Date.now() % 100000}] ${kind} ${text.slice(0, 120)}`); },
  });
  backend.attach();
  return { backend, fake, events, calls, fire, log, files: stored };
}

// ---- starting the whole mode (no module on the robot) ----------------------------------------------
test('a run uploads the program inside the script and reports the robot\'s steps', async () => {
  const { backend, fake, events, calls } = setup();
  await backend.play('FRF');
  assert.deepEqual(calls, ['send', 'exec']);
  assert.match(fake.script, /^PROGRAM = "FRF"$/m);
  assert.match(fake.script, /^AUTOPLAY = 1$/m);
  assert.ok(fake.script.trimEnd().endsWith('run()'));
  await until(() => events.some((e) => e.type === 'end'));
  const types = events.map((e) => e.type);
  assert.equal(types[0], 'hello');
  assert.deepEqual(events.filter((e) => e.type === 'step').map((e) => [e.index, e.code]), [[0, 'F'], [1, 'R'], [2, 'F']]);
  assert.deepEqual(events.filter((e) => e.type === 'moved').map((e) => e.index), [0, 1, 2]);
  assert.deepEqual(events.find((e) => e.type === 'prog'), { type: 'prog', program: 'FRF' });
  assert.equal(events.find((e) => e.type === 'cal').fw, 9000000);
  assert.equal(events.find((e) => e.type === 'battery').volts, 4.012);
  assert.equal(types.at(-1), 'end');
  assert.equal(backend.scriptRunning, true, 'the mode stays resident after the replay, like the firmware');
});

test('a second run stops the resident script first, and its KeyboardInterrupt is not an error', async () => {
  const { backend, calls, events } = setup();
  await backend.play('F');
  await until(() => events.some((e) => e.type === 'end'));
  await backend.play('FF');
  assert.deepEqual(calls, ['send', 'exec', 'stop', 'send', 'exec']);
  assert.equal(events.filter((e) => e.type === 'script-ended').length, 1);
  await until(() => events.filter((e) => e.type === 'end').length === 2);
  assert.equal(events.filter((e) => e.type === 'error').length, 0, 'stopping a script is not a failure');
});

test('stop() halts the script and waits for the robot to say so', async () => {
  const { backend, calls, events } = setup();
  await backend.play('F');
  await backend.stop();
  assert.equal(calls.at(-1), 'stop');
  assert.equal(backend.scriptRunning, false);
  assert.ok(events.some((e) => e.type === 'script-ended'));
});

test('a robot that never answers is reported as such', async () => {
  const { backend } = setup({ silent: true, helloTimeoutMs: 60 });
  await assert.rejects(backend.play('F'), /no-answer/);
});

test('a failed upload is reported and leaves nothing running', async () => {
  const { backend } = setup({ failUpload: true });
  await assert.rejects(backend.play('F'), /Script too big/);
  assert.equal(backend.scriptRunning, false);
});

test('a Traceback is read as one error, with where it happened', async () => {
  const { backend, events, log } = setup({ extraLines: ['Traceback (most recent call last):', '  File "mp_script", line 12, in <module>', "AttributeError: 'IMU' object has no attribute 'rotate_deg_absolute'"] });
  await backend.play('F');
  await until(() => events.some((e) => e.type === 'error'));
  const errors = events.filter((e) => e.type === 'error');
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /^AttributeError: 'IMU' object has no attribute 'rotate_deg_absolute' \(File "mp_script", line 12, in <module>\)$/);
  assert.ok(log.some((l) => l.kind === 'err' && /script error: AttributeError/.test(l.text)));
});

test('a bare exception line is an error too', async () => {
  const { backend, events } = setup({ extraLines: ['ValueError: Target angle must be between -360 and 360'] });
  await backend.play('F');
  await until(() => events.some((e) => e.type === 'error'));
  assert.match(events.find((e) => e.type === 'error').message, /^ValueError/);
});

test('idle(): the mode starts and waits, nothing is played', async () => {
  const { backend, fake, events, calls } = setup();
  await backend.idle('FRF');
  assert.deepEqual(calls, ['send', 'exec']);
  assert.match(fake.script, /^AUTOPLAY = 0$/m);
  await until(() => events.some((e) => e.type === 'state' && e.state === 'record'));
  assert.deepEqual(events.find((e) => e.type === 'prog'), { type: 'prog', program: 'FRF' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(events.filter((e) => e.type === 'step').length, 0);
});

test('the journal tells what was sent, what came back and how long it took', async () => {
  const { backend, log } = setup();
  await backend.play('FL');
  const text = log.map((l) => `${l.kind} ${l.text}`).join('\n');
  assert.match(text, /out upload mode "FL" \(play\): \d+ bytes/);
  assert.match(text, /info upload done in \d+ ms/);
  assert.match(text, /out execute/);
  assert.match(text, /in stdout /);
  assert.match(text, /info hello after \d+ ms/);
});

test('a stop is confirmed by the script\'s own last words when the API\'s notification never comes', async () => {
  const { backend, calls, log } = setup({ noStopStatus: true });
  backend.opt.haltTimeoutMs = 3000;
  await backend.play('F');
  await until(() => backend.scriptRunning);
  const t0 = Date.now();
  await backend.play('FF');                              // stops the first one, then starts
  assert.ok(Date.now() - t0 < 1500, `not the 3 s of the timeout (${Date.now() - t0} ms)`);
  assert.equal(log.filter((l) => /did not confirm it stopped/.test(l.text)).length, 0);
  assert.deepEqual(calls.filter((c) => /^(stop|send)$/.test(c)), ['send', 'stop', 'send']);
});

test('the wait for hello does not start before the script has been sent: a slow upload is not a missing robot', async () => {
  const { backend, events } = setup({ uploadDelay: 300, helloTimeoutMs: 120 });
  await backend.play('F');                               // the upload alone takes longer than the wait for hello
  await until(() => events.some((e) => e.type === 'step'));
});

// ---- the module on the robot ---------------------------------------------------------------------------
test('at connection: stop what may run, put the module on the robot once, then start with two lines', async () => {
  const { backend, fake, events, calls, files, log } = setup({ withModule: true, running: true });
  await backend.connect();
  await backend.idle('FRF');
  assert.deepEqual(calls.slice(0, 8), ['streamOff', 'stop', 'list', `uploadFile ${MODULE.name}.py`, `saveFile ${MODULE.name}.py`, 'freeMemory', 'list', 'send'], calls.join(', '));
  assert.ok(files.has(`${MODULE.name}.py`));
  assert.equal(fake.script, `import ${MODULE.name}\n${MODULE.name}.run("FRF", 0)\n`, 'two lines, not the whole mode');
  assert.ok(log.some((l) => /a script was running and has stopped/.test(l.text)));
  await until(() => events.some((e) => e.type === 'prog'));
  assert.deepEqual(events.find((e) => e.type === 'prog'), { type: 'prog', program: 'FRF' });
  assert.equal(events.filter((e) => e.type === 'error').length, 0);
});

test('a module that is already on the robot is not sent again, and an old one is not kept', async () => {
  const { backend, calls, files } = setup({ withModule: true, files: [[`${MODULE.name}.py`, MODULE.text], ['cards_00000000.py', 'old'], ['mine.py', 'x']] });
  await backend.connect();
  await backend.play('FL');
  assert.ok(!calls.some((c) => c.startsWith('uploadFile')), calls.join(', '));
  assert.deepEqual(calls.filter((c) => /^(send|exec)$/.test(c)), ['send', 'exec']);

  // another version of the module: the old one goes after the new one is saved
  const second = setup({ withModule: true, files: [['cards_00000000.py', 'old'], ['mine.py', 'x']] });
  await second.backend.connect();
  await second.backend.idle('F');
  assert.ok(second.calls.includes('deleteFile cards_00000000.py'));
  assert.ok(second.files.has('mine.py'), 'files that are not ours are left alone');
  assert.ok(!second.files.has('cards_00000000.py'));
  void files;
});

test('a run through the module plays the program like the whole mode does', async () => {
  const { backend, fake, events } = setup({ withModule: true });
  await backend.connect();
  await backend.play('FRF');
  assert.match(fake.script, /^import cards_/);
  await until(() => events.some((e) => e.type === 'end'));
  assert.deepEqual(events.filter((e) => e.type === 'step').map((e) => e.code), ['F', 'R', 'F']);
});

test('if the module cannot be imported, the whole mode is sent instead, without alarming anyone', async () => {
  const { backend, fake, events, log } = setup({ withModule: true, brokenImport: true });
  await backend.connect();
  await backend.play('FL');
  assert.match(fake.script, /^PROGRAM = "FL"$/m, 'fell back to the whole mode');
  assert.equal(backend.moduleName, null);
  assert.equal(events.filter((e) => e.type === 'error').length, 0);
  assert.ok(log.some((l) => /the module does not start .*sending the whole mode/.test(l.text)));
  await until(() => events.some((e) => e.type === 'end'));
});

test('if the files of the robot do not answer, the whole mode is used at every start', async () => {
  const { backend, fake, log } = setup({ withModule: true, noFiles: true });
  backend.opt.fileTimeoutMs = 40;
  await backend.connect();
  await backend.idle('F');
  assert.match(fake.script, /^PROGRAM = "F"$/m);
  assert.ok(log.some((l) => l.kind === 'err' && /module: list files: no answer/.test(l.text)));
});

test('operations are done one after the other, in the order they were asked', async () => {
  const { backend, calls } = setup({ withModule: true });
  await backend.connect();
  const a = backend.idle('F');
  const b = backend.idle('FF');
  const c = backend.play('FFF');
  await Promise.all([a, b, c]);
  const sends = calls.filter((x) => x === 'send').length;
  assert.equal(sends, 3);
  const order = calls.filter((x) => /^(send|exec|stop)$/.test(x)).join(' ');
  assert.match(order, /^(stop )?send exec stop send exec stop send exec$/, order);
});

test('the sensor streams a previous client left on are switched off before anything else', async () => {
  const { backend, calls, log } = setup({ withModule: true });
  await backend.connect();
  await backend.idle('F');
  assert.equal(calls[0], 'streamOff', calls.join(', '));
  assert.ok(log.some((l) => /sensor streaming off/.test(l.text)));
});

test('if switching the streams off fails, the start goes on', async () => {
  const { backend, fake, events } = setup({ withModule: true });
  fake.stopSensorStreaming = async () => { fake.calls.push('streamOff'); throw Object.assign(new Error('GATT operation failed for unknown reason.'), { name: 'NotSupportedError' }); };
  await backend.connect();
  await backend.idle('F');
  await until(() => events.some((e) => e.type === 'prog'));
});

// ---- a link that misbehaves ----------------------------------------------------------------------------
test('a write that fails for a moment is tried once more', async () => {
  const { backend, calls, log, events } = setup({ withModule: true, stopFails: 1, running: true });
  await backend.connect();
  await backend.idle('F');
  assert.equal(calls.filter((c) => c === 'stop').length >= 2, true, 'the stop was retried');
  assert.ok(log.some((l) => /stop: GATT operation failed.*trying once more/.test(l.text)));
  await until(() => events.some((e) => e.type === 'prog'));
});

test('an upload that never answers does not hold the interface for ever', async () => {
  const { backend, log } = setup({ hangUpload: true });
  const t0 = Date.now();
  await assert.rejects(backend.play('F'), /upload: no answer/);
  assert.ok(Date.now() - t0 < 1500);
  assert.ok(log.some((l) => l.kind === 'err' && /upload failed after/.test(l.text)));
  assert.equal(backend.scriptRunning, false);
});

test('when the link itself fails, the whole mode is not sent as a fallback', async () => {
  const { backend, calls } = setup({ withModule: true, launchLinkError: true });
  await backend.connect();
  await assert.rejects(backend.play('FL'), /GATT/);
  const sends = calls.filter((c) => c === 'send').length;
  assert.ok(sends <= 2, `the launcher only (maybe twice with its retry): ${calls.join(', ')}`);
  assert.equal(backend.moduleName !== null, true, 'and the module is still believed to be there');
});

test('the firmware version is not waited for: a silent robot does not delay the start', async () => {
  const { backend, events } = setup({ withModule: true, firmware: 'never' });
  const t0 = Date.now();
  await backend.connect();
  await backend.idle('FL');
  assert.ok(Date.now() - t0 < 3000, `started in ${Date.now() - t0} ms`);
  await until(() => events.some((e) => e.type === 'prog'));
});

// ---- connection ------------------------------------------------------------------------------------------
test('connected is shown at once, even if the robot never tells its firmware', async () => {
  const { backend, events, fire, log } = setup({ firmware: 'never', firmwareTimeoutMs: 40 });
  await backend.connect();
  assert.equal(events.find((e) => e.status === 'connected').device, 'Thymio-test', 'no waiting for the firmware');
  assert.equal(events.find((e) => e.status === 'connected').firmware, null);
  fire(EV.connected, true);                                         // the API says it twice
  assert.equal(events.filter((e) => e.status === 'connected').length, 1);
  await until(() => log.some((l) => l.kind === 'err' && /firmware: .*no answer/.test(l.text)));      // asked after the start
  fire(EV.connected, false);
  assert.equal(events.at(-1).status, 'disconnected');
});

test('the firmware shows up when the robot answers', async () => {
  const { backend, events } = setup();
  await backend.connect();
  await until(() => events.some((e) => e.status === 'connected' && e.firmware));
  assert.deepEqual(events.find((e) => e.firmware).firmware, { esp32_ver: '1.10.2' });
});

test('a failed connection tells why, although the API only logs it and says "disconnected"', async () => {
  const { backend, fake, events, log, fire } = setup();
  const original = console.error;
  const shown = [];
  fake.requestAndConnect = async () => {
    console.error('Could not connect to the Thymio device', Object.assign(new Error('GATT operation failed for unknown reason.'), { name: 'NotSupportedError' }));
    fire(EV.connected, false);
  };
  console.error = (...a) => shown.push(a);            // what the page's console would get
  try {
    await backend.connect();
  } finally { console.error = original; }
  const failed = events.filter((e) => e.status === 'disconnected').at(-1);
  assert.equal(failed.errorName, 'NotSupportedError');
  assert.match(failed.error, /GATT operation failed/);
  assert.ok(log.some((l) => l.kind === 'err' && /NotSupportedError: GATT operation failed/.test(l.text)), 'in the journal');
  assert.equal(shown.length, 1, 'the console still gets the message');
  assert.equal(console.error, original, 'and console.error is back');
});

test('cancelling the device chooser is reported as such, not as a failure to hide', async () => {
  const { backend, fake, events, fire } = setup();
  fake.requestAndConnect = async () => {
    console.error('Could not connect', Object.assign(new Error('User cancelled the requestDevice() chooser.'), { name: 'NotFoundError' }));
    fire(EV.connected, false);
  };
  const original = console.error;
  console.error = () => {};                          // keep the test output clean
  try { await backend.connect(); } finally { console.error = original; }
  assert.equal(events.at(-1).errorName, 'NotFoundError');
});

// ---- the self test ----------------------------------------------------------------------------------------
test('the self test uploads a tiny script, sees both of its lines and reports the timings', async () => {
  const { backend, fake, events } = setup();
  const report = await backend.selfTest();
  assert.equal(fake.script, SELF_TEST_SCRIPT);
  assert.ok(SELF_TEST_SCRIPT.length < 500);
  assert.ok(report.started != null && report.done != null && report.upload != null, JSON.stringify(report));
  assert.equal(report.error, '');
  await until(() => events.some((e) => e.type === 'script-ended'));
});

test('the self test says what failed', async () => {
  const { backend } = setup({ failUpload: true });
  const report = await backend.selfTest();
  assert.equal(report.done, null);
  assert.match(report.error, /Script too big/);
});

// ---- the sync and the backend together (what the interface does) ------------------------------------
// The interface tells the sync about its cards and the connection; the sync starts the mode on the
// robot through the backend.
function withSync(opts) {
  const ctx = setup({ withModule: true, files: [[`${MODULE.name}.py`, MODULE.text]], ...opts });
  const adopted = [];
  const states = [];
  const sync = new RobotSync({
    backend: ctx.backend, delayMs: 60,
    onState: (s) => states.push(s), onAdopt: (p) => adopted.push(p), onError: (e) => { ctx.syncErrors = [...(ctx.syncErrors || []), e]; },
  });
  ctx.backend.emit = ((emit) => (e) => { emit(e); sync.onEvent(e); })(ctx.backend.emit);   // events reach both, like in the interface
  return { ...ctx, sync, adopted, states };
}

test('a robot that has just been connected is given the cards at once (the interface\'s program, not an empty one)', async () => {
  const { backend, sync, fake, calls, events } = withSync();
  sync.update({ program: 'FFLF', live: false, busy: false });          // the cards, remembered from last time
  await backend.connect();                                              // the connection is announced by the API
  sync.update({ program: 'FFLF', live: true, busy: false });            // the interface now sees a connected robot
  await until(() => events.some((e) => e.type === 'prog'), 3000);
  assert.equal(fake.script, `import ${MODULE.name}\n${MODULE.name}.run("FFLF", 0)\n`, 'the cards\' program, started on the robot');
  assert.deepEqual(events.find((e) => e.type === 'prog'), { type: 'prog', program: 'FFLF' });
  assert.ok(calls.indexOf('send') > calls.indexOf('list'), 'after the preparation');
});

test('the first start does not wait for the robot to be quiet or for anything the child does', async () => {
  const { backend, sync, calls } = withSync();
  sync.update({ program: 'FL', live: true, busy: false });
  await backend.connect();
  await until(() => calls.includes('exec'), 3000);
  assert.deepEqual(calls.filter((c) => /^(streamOff|stop|list|send|exec)$/.test(c)), ['streamOff', 'stop', 'list', 'send', 'exec']);
});

test('cards added after the connection: one start each, no reset in between', async () => {
  const { backend, sync, calls, events } = withSync();
  sync.update({ program: 'F', live: true, busy: false });
  await backend.connect();
  await until(() => events.filter((e) => e.type === 'prog').length === 1, 3000);
  for (const program of ['FL', 'FLF']) {
    sync.update({ program, live: true, busy: false });
    await until(() => events.some((e) => e.type === 'prog' && e.program === program), 3000);
    await new Promise((r) => setTimeout(r, 150));                       // long enough for a (wrong) second start
  }
  assert.equal(calls.filter((c) => c === 'send').length, 3, `one launcher per program: ${calls.join(', ')}`);
});
