// The language of the advanced cards (src/lang.js): the grammar, the machine, and agreement with the mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { compile, Machine, trace } from '../src/lang.js';
import { cleanProgram, isAdvancedProgram, isToken, kindOf, MAX_STEPS, TOKEN_ALPHABET, WHILE_COLOR, cardClass } from '../src/spec.js';
import { liveFrames, LiveReceiver, parseRobotLine } from '../src/script-core.js';
import { layout } from '../src/program.js';
import { PoseAnimator } from '../src/robot/pose-anim.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// the same table as VECTORS in tests/test_sequence_mode.py, for the Python compiler
const VECTORS = {
  FL: [['S', 0, 'F'], ['S', 1, 'L']],
  '3F': [['L', 0, 3], ['S', 1, 'F'], ['E', 0]],
  '4(FR)': [['L', 0, 4], ['S', 2, 'F'], ['S', 3, 'R'], ['E', 0]],
  '2(F3(L))': [['L', 0, 2], ['S', 2, 'F'], ['L', 3, 3], ['S', 5, 'L'], ['E', 2], ['E', 0]],
  rF: [['I', 0, 'r', 1], ['S', 1, 'F']],
  'r(FF)B': [['I', 0, 'r', 2], ['S', 2, 'F'], ['S', 3, 'F'], ['S', 5, 'B']],
  '(F': [['S', 1, 'F']],
  'F)B': [['S', 0, 'F'], ['S', 2, 'B']],
  3: [],
  F3: [['S', 0, 'F']],
  '(F3)B': [['S', 1, 'F'], ['S', 4, 'B']],
  'r2(FB)': [['I', 0, 'r', 4], ['L', 1, 2], ['S', 3, 'F'], ['S', 4, 'B'], ['E', 1]],
  '(()F)': [['S', 3, 'F']],
  '': [],
  'E(F)': [['W', 0, 'r', 2], ['S', 2, 'F'], ['X', 0]],
  EF: [['W', 0, 'r', 2], ['S', 1, 'F'], ['X', 0]],
  E: [],
  'E)F': [['S', 2, 'F']],
  '2E(F)': [['L', 0, 2], ['W', 1, 'r', 2], ['S', 3, 'F'], ['X', 1], ['E', 0]],
  'rE(F)': [['I', 0, 'r', 3], ['W', 1, 'r', 2], ['S', 3, 'F'], ['X', 1]],
  'E(r(F))': [['W', 0, 'r', 3], ['I', 2, 'r', 1], ['S', 4, 'F'], ['X', 0]],
  UK: [],
  'E()': [],
  '2(2)F': [['S', 4, 'F']],
  'Y(FL)': [['W', 0, 'y', 3], ['S', 2, 'F'], ['S', 3, 'L'], ['X', 0]],
};

test('the cards compile to the operations the robot runs', () => {
  for (const [program, ops] of Object.entries(VECTORS)) assert.deepEqual(compile(program), ops, JSON.stringify(program));
});

test('the alphabet: four steps, two brackets, eight repeats, eight colours for an if and the same eight for a while', () => {
  assert.equal([...'FBLR()23456789rygcbpwkEYGCUPWK'].every(isToken), true);
  assert.equal([...'FBLR()23456789rygcbpwkEYGCUPWK'].length, 30);
  assert.equal(TOKEN_ALPHABET, 'FBLR()23456789rygcbpwkEYGCUPWK', 'the order of the codes of the live update');
  for (const bad of ['0', '1', 'x', ' ', 'f', 'Z', 'A', 'D', 'T', '?']) assert.equal(isToken(bad), false, bad);
  assert.deepEqual([...'F(3r)'].map(kindOf), ['step', 'open', 'repeat', 'if', 'close']);
  assert.deepEqual([...'EYGCUPWK'].map(kindOf), Array(8).fill('while'));
  assert.deepEqual([...'EYGCUPWK'].map((c) => WHILE_COLOR[c]).join(''), 'rygcbpwk', 'the colours in the order of the ifs');
  assert.equal(cleanProgram('F?x L 3 Z'), 'FL3');
  assert.equal(cleanProgram('F'.repeat(60)).length, MAX_STEPS);
  assert.equal(isAdvancedProgram('FFLR'), false);
  assert.equal(isAdvancedProgram('F3F'), true);
  assert.equal(isAdvancedProgram('(F)'), true);
});

const codes = (program, colourAt) => trace(program, colourAt).map((s) => s.code).join('');

test('a repeat does the next card, or group, that many times; they nest', () => {
  assert.equal(codes('3F'), 'FFF');
  assert.equal(codes('4(FR)'), 'FRFRFRFR');
  assert.equal(codes('2(F2(L)B)'), 'FLLBFLLB');
  assert.equal(codes('2(F2(L)B)L'), 'FLLBFLLBL', 'what follows the group is done once');
  const square = trace('4(FR)');
  assert.deepEqual([square.at(-1).x, square.at(-1).y, ((square.at(-1).h % 4) + 4) % 4], [0, 0, 0], 'a square comes back to its start');
  assert.deepEqual(square.map((s) => s.index), [2, 3, 2, 3, 2, 3, 2, 3], 'the cards being done are the ones of the group');
});

test('an if does the next card, or group, only over its colour, wherever the robot stands', () => {
  const red = (x, y) => (x === 0 && y === 2 ? 'r' : undefined);
  assert.equal(codes('5(FrL)', red), 'FFLFFF');
  assert.equal(codes('Fr(BB)F', () => undefined), 'FF', 'not red: the group is skipped');
  assert.equal(codes('Fr(BB)F', (x, y) => (y === 1 ? 'r' : undefined)), 'FBBF');
  assert.equal(codes('2(Fg(L))', (x, y) => (y === 1 ? 'g' : undefined)), 'FLFL', 'it asks again each time round');
  assert.equal(codes('rg(F)'), '', 'two ifs: the second only if the first held, and a cell has one colour');
});

test('anything is a program: what cannot be done is left out', () => {
  assert.equal(codes('3'), '');
  assert.equal(codes('F3'), 'F');
  assert.equal(codes('(F3)B'), 'FB');
  assert.equal(codes('(F'), 'F');
  assert.equal(codes('F)B'), 'FB');
  assert.equal(codes('r'), '');
  assert.equal(codes('rr(F)', () => 'r'), 'F', 'two ifs in a row: the first one has the second as its card');
});

test('the machine: loops stay when a skipped group holds one', () => {
  const m = new Machine(compile('r2(FB)F'));
  let op = m.next();
  assert.equal(op[0], 'I');
  m.decide(false);
  op = m.next();
  assert.deepEqual(op, ['S', 6, 'F']);
  assert.equal(m.next(), null);
  assert.deepEqual(m.loops, [], 'no loop was started');
});

test('a very long program is cut where the caller says', () => {
  const t = trace('9(9(9(F)))', () => undefined, 100);
  assert.equal(t.length, 100);
});

test('the Python compiler of the mode and this one agree, on any program', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const alphabet = [...TOKEN_ALPHABET];
  const programs = Object.keys(VECTORS);
  for (let k = 0; k < 400; k++) {
    const n = Math.floor(rnd() * 56);                                     // up to a bit over the 50 cards
    programs.push(Array.from({ length: n }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join(''));
  }
  const run = spawnSync('python3', ['-I', path.join(here, 'test_sequence_mode.py'), '--compile'], { input: JSON.stringify(programs), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const theirs = JSON.parse(run.stdout);
  assert.equal(theirs.length, programs.length);
  programs.forEach((p, i) => assert.deepEqual(theirs[i], compile(p), JSON.stringify(p)));
});

// ---- the advanced cards in the live-update frames ------------------------------------------------------------
const receive = (program, msg = 3) => {
  const frames = liveFrames(program, msg);
  if (!frames) return null;
  const r = new LiveReceiver();
  let out = null;
  for (const f of frames) out = r.push(f);
  return out;
};

test('live frames: the four steps stay as compact as they were, advanced cards take five bits each', () => {
  assert.equal(liveFrames('F'.repeat(12)).length, 1, '12 steps in one frame');
  assert.equal(liveFrames('F'.repeat(13)).length, 2);
  assert.equal(liveFrames('FLRB'.repeat(12) + 'FL').length, 4, '50 steps in four frames');
  assert.equal(liveFrames('3(F)').length, 1, 'four advanced cards: 20 bits in the six nibbles that follow the count');
  assert.equal(liveFrames('4(FR)').length, 2, 'five');
  assert.equal(liveFrames('F'.repeat(6) + '3').length, 2, 'six steps and a seventh card that is advanced');
  assert.equal(liveFrames('F'.repeat(48) + '(').length, 8, '49 advanced cards: exactly eight frames');
});

test('live frames: any program comes out as it went in', () => {
  let seed = 99;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const steps = [...'FBLR'], all = [...TOKEN_ALPHABET];
  for (let k = 0; k < 600; k++) {
    const alphabet = k % 3 ? all : steps;
    const n = Math.floor(rnd() * (k % 3 ? 50 : 51));
    const program = Array.from({ length: n }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
    if (isAdvancedProgram(program) && program.length === 50) continue;
    assert.equal(receive(program, 1 + (k % 15)), program, JSON.stringify(program));
  }
  for (const p of ['', 'F', '4(FR)', '5(FrL)', '9(9(9(F)))', 'kwpbcgyr', 'EYGCUPWK', '2(E(F)B)', '((((((((((((((((((((((((((((((((((((((((((((((((F']) assert.equal(receive(p), p, p);
});

test('live frames: 50 advanced cards do not fit in eight frames, so there is none', () => {
  assert.equal(liveFrames('F'.repeat(49) + '3'), null);
  assert.equal(liveFrames('3'.repeat(50)), null);
  assert.ok(liveFrames('3'.repeat(49)), 'but 49 do');
  assert.equal(liveFrames('3'.repeat(49)).length, 8);
  assert.ok(liveFrames('F'.repeat(50)), 'fifty plain steps always do');
});

test('live frames: a frame is not read as the other kind of message', () => {
  const plain = liveFrames('FLRB', 2)[0];
  const adv = liveFrames('F(L)B', 2)[0];
  assert.equal(plain[3] >> 3, 0);
  assert.equal(adv[3] >> 3, 1, 'the flag of advanced cards');
  assert.equal(receive('F(L)B'), 'F(L)B');
});

// ---- the path and the pose of the real robot follow what it does, not the order of the cards ------------------
test('layout: the path of a program is what the robot would do on the floor', () => {
  const plain = layout('FFL');
  assert.deepEqual(plain.steps, [{ index: 0, code: 'F' }, { index: 1, code: 'F' }, { index: 2, code: 'L' }], 'four steps alone: card i, step i');
  assert.deepEqual(plain.poses.at(-1), { x: 0, y: 2, h: 1 });
  const square = layout('4(FR)');
  assert.equal(square.poses.length, 8);
  assert.deepEqual(square.steps.map((x) => x.index), [2, 3, 2, 3, 2, 3, 2, 3]);
  assert.deepEqual(square.poses.at(-1), { x: 0, y: 0, h: -4 }, 'back where it began, after four turns to the right');
  const red = layout('5(FrL)', (x, y) => (x === 0 && y === 2 ? 'r' : undefined));
  assert.deepEqual(red.steps.map((x) => x.code).join(''), 'FFLFFF');
  assert.equal(layout('5(FrL)').steps.map((x) => x.code).join(''), 'FFFFF', 'on a floor without red the robot never turns');
  assert.equal(layout('9(9(9(F)))').poses.length, 400, 'cut at 400 steps');
});

test('the pose of a real robot is the sum of the steps it says it takes, whatever their cards', () => {
  const a = new PoseAnimator();
  a.reset('4(FR)', null);
  a.begin(0);
  let now = 0;
  const at = [];
  for (const [index, code] of [[2, 'F'], [3, 'R'], [2, 'F'], [3, 'R'], [2, 'F'], [3, 'R'], [2, 'F'], [3, 'R']]) {
    a.onStep(index, code, now);
    now += 100;
    const mid = a.pose(now);
    at.push(mid);
    a.onMoved(index);
    now += 600;
  }
  const end = a.pose(now);
  assert.ok(Math.abs(end.x) < 1e-9 && Math.abs(end.y) < 1e-9, `back at the start: ${JSON.stringify(end)}`);
  assert.ok(Math.abs(((end.th % 360) + 360) % 360) < 1e-9 || Math.abs(((end.th % 360) + 360) % 360 - 360) < 1e-9, 'facing up again');
  assert.ok(at[0].y > 0 && at[0].y < 1, 'part of the way forward in the middle of the first step');
  // a step whose "moved" was lost: the next step starts from where the one before was going
  const b = new PoseAnimator();
  b.reset('FF', null);
  b.onStep(0, 'F', 0);
  b.onStep(1, 'F', 50);
  assert.equal(b.pose(100000).y <= 2 && b.pose(100000).y > 1, true);
  b.onMoved(1);
  assert.equal(b.pose(100000).y, 2);
});

// ---- a repeat with a colour: while the ground is that colour ---------------------------------------------------
test('a repeat with a colour does the next card again and again while the ground is that colour', () => {
  const redLine = (x, y) => (x === 0 && y >= 0 && y <= 1 ? 'r' : undefined);
  assert.equal(codes('E(F)', redLine), 'FF', 'on the red cells 0 and 1, then out');
  assert.equal(codes('E(F)B', () => undefined), 'B', 'false at once: nothing, and the next card is done');
  assert.equal(codes('2(G(F)L)', (x, y) => (x === 0 && y === 0 ? 'g' : undefined)), 'FLL');
  assert.equal(codes('Y(FL)', (x, y) => ({ '0,0': 'y', '0,1': 'y', '-1,1': 'y' })[`${x},${y}`]), 'FLFLFL', 'it looks again after each round');
  assert.deepEqual(trace('E(F)', redLine).map((s) => s.index), [2, 2]);
  assert.equal(cardClass('E'), 'c-repeat', 'it is a repeat card');
});

test('a repeat, an if or a while with nothing to do does nothing, and never waits', () => {
  for (const p of ['E()', 'UK', '2()', 'r()', '3(2)']) assert.deepEqual(compile(p), [], p);
  assert.equal(codes('E(())F', () => 'r'), 'F');
  // not blocking: an if whose colour is not there leaves its card out and the program goes on
  assert.equal(codes('Fr(BB)F', () => undefined), 'FF');
  assert.equal(codes('rFrLF', () => undefined), 'F', 'two ifs, neither holds: only what is not under an if');
  // a while that would look for ever is cut
  assert.equal(trace('E(F)', () => 'r').length, 400);
  assert.equal(trace('E(F)', () => 'r', 30).length, 30);
});

test('the line of an if carries what the sensor read, and old lines without it still parse', () => {
  assert.deepEqual(parseRobotLine('@@if 3 1 r 3 90 70'), { type: 'if', index: 3, taken: true, seen: 'r', hsv: [3, 90, 70] });
  assert.deepEqual(parseRobotLine('@@if 3 0 ?'), { type: 'if', index: 3, taken: false, seen: '?', hsv: null });
  assert.deepEqual(parseRobotLine('@@sense 7'), { type: 'sense', index: 7 });
});
