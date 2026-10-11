// node --test tests/
// Checks the JavaScript side: program model, robot script, stdout parser and above all that the
// simulator of the interface follows the same timeline as the real MicroPython script (run on
// the virtual robot of tests/fake_robot.py, golden values in tests/golden.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { cleanProgram, MAX_STEPS } from '../src/spec.js';
import { layout, bounds } from '../src/program.js';
import { buildScriptFrom, buildModuleFrom, launcherFor, moduleNameFor, hash32, pulsePhase, minify, parseRobotLine, LineAssembler } from '../src/script-core.js';
import { VirtualThymio } from '../src/sim/physics.js';
import { SimSequence } from '../src/sim/mode.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(here, '..', 'src', 'py', 'sequence_mode.py'), 'utf8');
const GOLDEN = JSON.parse(fs.readFileSync(path.join(here, 'golden.json'), 'utf8'));

test('cleanProgram keeps valid steps and at most 50', () => {
  assert.equal(cleanProgram('FxL?R b'), 'FLR');
  assert.equal(cleanProgram(['F', 'B']), 'FB');
  assert.equal(cleanProgram('F'.repeat(80)).length, MAX_STEPS);
  assert.equal(cleanProgram(null), '');
});

test('layout: a square comes back to the start, left is counter-clockwise', () => {
  const { poses } = layout('FRFRFRFR');
  assert.deepEqual(poses.at(-1), { x: 0, y: 0, h: -4 });
  assert.deepEqual(layout('FL').poses.at(-1), { x: 0, y: 1, h: 1 });
  assert.deepEqual(layout('FLF').poses.at(-1), { x: -1, y: 1, h: 1 });   // left of the start
  assert.deepEqual(layout('FRF').poses.at(-1), { x: 1, y: 1, h: -1 });
  assert.deepEqual(layout('BB').poses.at(-1), { x: 0, y: -2, h: 0 });
  assert.deepEqual(bounds('FFRFF'), { minX: 0, maxX: 2, minY: 0, maxY: 2 });
});

test('stdout lines are rebuilt from notification chunks and parsed', () => {
  const asm = new LineAssembler();
  assert.deepEqual(asm.push('@@hel'), []);
  assert.deepEqual(new LineAssembler().push('@@a 1' + ' '.repeat(95) + '\x1e@@b 2' + ' '.repeat(95) + '\x1e'), ['@@a 1' + ' '.repeat(95), '@@b 2' + ' '.repeat(95)], 'padded lines end with a record separator');
  assert.deepEqual(new LineAssembler().push('Traceback (most recent call last):\r\n  File "x", line 3\r\nKeyboardInterrupt: \r\n'), ['Traceback (most recent call last):', '  File "x", line 3', 'KeyboardInterrupt: '], 'indentation is kept');
  assert.deepEqual(asm.push('lo 1\n@@step 0 F\r\n@@pr'), ['@@hello 1', '@@step 0 F']);
  assert.deepEqual(asm.push('og FL\n'), ['@@prog FL']);
  assert.deepEqual(parseRobotLine('@@hello 1'), { type: 'hello', version: 1 });
  assert.deepEqual(parseRobotLine('@@step 3 L'), { type: 'step', index: 3, code: 'L' });
  assert.deepEqual(parseRobotLine('@@prog -'), { type: 'prog', program: '' });
  assert.deepEqual(parseRobotLine('@@prog FLRx'), { type: 'prog', program: 'FLR' });
  assert.deepEqual(parseRobotLine('@@cal 9000000 9000000 16384'), { type: 'cal', fw: 9000000, bw: 9000000, rot90: 16384 });
  assert.deepEqual(parseRobotLine('@@bat 4012'), { type: 'battery', volts: 4.012 });
  assert.deepEqual(parseRobotLine('@@moved 2'), { type: 'moved', index: 2 });
  assert.equal(parseRobotLine('@@end').type, 'end');
  assert.equal(parseRobotLine('hello world'), null);
  assert.equal(parseRobotLine('Traceback (most recent call last):'), null, 'read as a whole by the robot backend');
  assert.equal(parseRobotLine('ValueError: Target angle must be between -360 and 360').type, 'error');
});

test('the robot script carries the program and stays small', () => {
  const full = buildScriptFrom(SOURCE, 'FFLR', { autoplay: true, minified: false });
  assert.match(full, /^PROGRAM = "FFLR"$/m);
  assert.match(full, /^AUTOPLAY = 1$/m);
  const idle = buildScriptFrom(SOURCE, 'zz', { autoplay: false, minified: false });
  assert.match(idle, /^PROGRAM = ""$/m);
  assert.match(idle, /^AUTOPLAY = 0$/m);
  const small = buildScriptFrom(SOURCE, 'FFLR');
  assert.ok(small.length < SOURCE.length * 0.7, `minified ${small.length} of ${SOURCE.length}`);
  assert.ok(small.length < 16000, 'a few seconds of Bluetooth upload');
  assert.ok(!/^\s*#/m.test(small));
  assert.ok(small.trimEnd().endsWith('\nrun()'), 'the whole mode ends by running');
  assert.ok(minify('a = 1  # one\nb = "#"  # two\n\n# c\n').startsWith('a = 1\nb = "#"  # two\n'));
  assert.equal(minify('if x:\n    if y:\n        z = 1\n'), 'if x:\n if y:\n  z = 1\n');
});

test('the minified script is valid Python and plays the same timeline on the virtual robot', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-'));
  try {
    for (const prog of ['FFLBR', 'FRFRFRFR']) {
      const file = path.join(dir, 'script.py');
      fs.writeFileSync(file, buildScriptFrom(SOURCE, prog));
      const run = spawnSync('python3', ['-I', path.join(here, 'test_sequence_mode.py'), '--run-file', file, prog], { encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr);
      const t = JSON.parse(run.stdout);
      assert.deepEqual(t.stepStartMs, GOLDEN[prog].stepStartMs, `minified script, ${prog}`);
      assert.equal(t.endMs, GOLDEN[prog].endMs);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function simTimeline(program) {
  const robot = new VirtualThymio();
  const events = [];
  const t0 = () => robot.nowMs;
  const mode = new SimSequence(robot, program, (e) => events.push({ ...e, t: t0() }));
  mode.start({ autoplay: true });
  for (let i = 0; i < 40000 && !events.some((e) => e.type === 'end'); i++) {
    if (i % 10 === 0) mode.tick();
    robot.step();
  }
  return {
    stepStartMs: events.filter((e) => e.type === 'step').map((e) => e.t),
    movedMs: events.filter((e) => e.type === 'moved').map((e) => e.t),
    endMs: events.find((e) => e.type === 'end')?.t,
    pose: [robot.x, robot.y, robot.headingDeg],
  };
}

for (const [name, g] of Object.entries(GOLDEN)) {
  test(`simulator follows the real script: ${name}`, () => {
    const s = simTimeline(g.program);
    assert.deepEqual(s.stepStartMs, g.stepStartMs, 'step start times');
    assert.deepEqual(s.movedMs, g.movedMs, 'motion end times');
    assert.equal(s.endMs, g.endMs);
    assert.ok(Math.abs(s.pose[0] - g.finalPoseMm[0]) < 1.5, `x ${s.pose[0]} vs ${g.finalPoseMm[0]}`);
    assert.ok(Math.abs(s.pose[1] - g.finalPoseMm[1]) < 1.5, `y ${s.pose[1]} vs ${g.finalPoseMm[1]}`);
    assert.ok(Math.abs(s.pose[2] - g.finalPoseMm[2]) < 0.1, `heading ${s.pose[2]} vs ${g.finalPoseMm[2]}`);
  });
}

test('the simulator mirrors the events of the script', () => {
  const robot = new VirtualThymio();
  const types = [];
  const mode = new SimSequence(robot, 'FL', (e) => types.push(e.type));
  mode.start({ autoplay: true });
  for (let i = 0; i < 40000 && !types.includes('end'); i++) { if (i % 10 === 0) mode.tick(); robot.step(); }
  assert.deepEqual(types, ['hello', 'cal', 'prog', 'state', 'state', 'step', 'moved', 'step', 'moved', 'state', 'end']);
});

test('the module: no call at the end, a name from its content, a two-line launcher', () => {
  const mod = buildModuleFrom(SOURCE);
  assert.ok(!/^run\(\)/m.test(mod), 'importing it runs nothing');
  assert.match(mod, /^def run\(program=None, autoplay=None, phase=0\):$/m);
  const name = moduleNameFor(mod);
  assert.match(name, /^cards_[0-9a-f]{8}$/);
  assert.ok(`${name}.py`.length <= 29, 'a robot file name is at most 30 bytes with its NUL');
  assert.notEqual(name, moduleNameFor(mod + ' '), 'another content, another name');
  assert.equal(hash32('abc'), '1a47e90b', 'FNV-1a');
  const launcher = launcherFor(name, 'FFxLR', { autoplay: true });
  assert.equal(launcher, `import ${name}\n${name}.run("FFLR", 1)\n`);
  assert.equal(launcherFor(name, 'F', { autoplay: false }), `import ${name}\n${name}.run("F", 0)\n`);
  assert.equal(launcherFor(name, 'F', { autoplay: false, phase: 123 }), `import ${name}\n${name}.run("F", 0, 123)\n`, 'with where the lights are');
  assert.ok(launcher.length < 80, 'two lines instead of the whole mode');
  assert.ok(mod.length < 16000);
});

test('the phase of the lights comes from one clock, so that restarts continue them', () => {
  assert.equal(pulsePhase(0, 0), 0);
  assert.equal(pulsePhase(20, 0), 1);
  assert.equal(pulsePhase(384 * 20, 0), 0, 'a whole number of turns of both the pulse (192 ticks) and the circle (128 ticks)');
  assert.equal(pulsePhase(1000, 450), Math.floor(1450 / 20) % 384, 'the start-up time of the robot is added');
  for (const t of [0, 1234, 987654321]) {
    const a = pulsePhase(t, 0), b = pulsePhase(t + 3840, 0), c = pulsePhase(t + 2560, 0);
    assert.equal(b % 192, a % 192, 'the pulse is 3.84 s long');
    assert.equal((2 * c) % 256, (2 * a) % 256, 'the circle is 2.56 s long');
    assert.ok(a >= 0 && a < 384);
  }
});
