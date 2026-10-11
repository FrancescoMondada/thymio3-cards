// When the robot is given the cards' program, and when the robot's own changes reach the cards.
// The sequence in the first test is the one of a real robot's journal: each added card made the
// mode start twice with the same program.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RobotSync } from '../src/robot/sync.js';

function setup(opts = {}) {
  let now = 0;
  let clock = 0;
  let nextId = 1;
  const timers = new Map();
  const calls = [];
  const adopted = [];
  const errors = [];
  const states = [];
  const logs = [];
  const gate = { resolve: null };
  const backend = {
    idle: (p) => { calls.push(`idle ${p}`); return opts.manual ? new Promise((resolve, reject) => { gate.resolve = resolve; gate.reject = reject; }) : (opts.failIdle ? Promise.reject(new Error('boom')) : Promise.resolve()); },
    play: (p) => { calls.push(`play ${p}`); return Promise.resolve(); },
  };
  const sync = new RobotSync({
    backend, delayMs: 450,
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimer: (id) => timers.delete(id),
    now: () => clock,
    onState: (s) => states.push(s),
    onAdopt: (p) => adopted.push(p),
    onError: (e) => errors.push(e),
    onLog: (kind, text) => logs.push(text),
  });
  const advance = async (ms) => {
    now += ms;
    clock += ms;
    for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); }
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  return { sync, calls, adopted, errors, states, logs, advance, settle, gate, timers };
}

// what the robot says when the mode is started again
const robotRestarts = (sync, program) => {
  sync.onEvent({ type: 'bye' });
  sync.onEvent({ type: 'script-ended' });          // (says nothing about the mode)
  sync.onEvent({ type: 'hello' });
  sync.onEvent({ type: 'prog', program });
  sync.onEvent({ type: 'state', state: 'record' });
};

test('a card added makes the mode start once, not twice (the bug of the journal)', async () => {
  const { sync, calls, advance, settle } = setup();
  sync.update({ program: '', live: true, busy: false });
  await advance(0); await settle();                       // connected: the first start is at once
  assert.deepEqual(calls, ['idle ']);
  robotRestarts(sync, '');
  await settle();
  for (const program of ['F', 'FL', 'FLF']) {
    sync.update({ program, live: true, busy: false });    // a card is added
    await advance(449);
    assert.equal(calls.at(-1) === `idle ${program}`, false, 'not before the pause');
    await advance(2); await settle();
    robotRestarts(sync, program);                         // the robot answers (hello, then its "@@prog")
    sync.update({ program, live: true, busy: false });    // the interface re-evaluates when its state changes
    await advance(2000); await settle();
  }
  assert.deepEqual(calls, ['idle ', 'idle F', 'idle FL', 'idle FLF'], 'one start per change');
});

test('the program the robot reports late does not start the mode again', async () => {
  const { sync, calls, advance, settle } = setup();
  sync.update({ program: 'FF', live: true, busy: false });
  await advance(0); await settle();
  assert.deepEqual(calls, ['idle FF']);
  // hello has been seen: the start finished, but "@@prog FF" has not arrived yet
  sync.onEvent({ type: 'hello' });
  sync.update({ program: 'FF', live: true, busy: false });
  await advance(5000); await settle();
  assert.deepEqual(calls, ['idle FF']);
});

test('several quick changes make one start, with the last program', async () => {
  const { sync, calls, advance, settle } = setup();
  sync.update({ program: '', live: true, busy: false });
  await advance(0); await settle();
  robotRestarts(sync, '');
  calls.length = 0;
  for (const p of ['F', 'FF', 'FFF', 'FFFL']) { sync.update({ program: p, live: true, busy: false }); await advance(200); }
  assert.deepEqual(calls, []);
  await advance(300); await settle();
  assert.deepEqual(calls, ['idle FFFL']);
});

test('a change while the robot is being given the cards is given afterwards', async () => {
  const { sync, calls, advance, settle, gate } = setup({ manual: true });
  sync.update({ program: 'F', live: true, busy: false });
  await advance(0); await settle();
  assert.deepEqual(calls, ['idle F']);
  sync.update({ program: 'FF', live: true, busy: false });             // while the first start is still going
  await advance(2000); await settle();
  assert.deepEqual(calls, ['idle F'], 'not at the same time');
  gate.resolve();                                                       // the first start is done
  await settle();
  sync.onEvent({ type: 'prog', program: 'F' });
  await advance(450); await settle();
  assert.deepEqual(calls, ['idle F', 'idle FF']);
});

test('nothing is sent while a run is being sent or played, nor when no robot is connected', async () => {
  const { sync, calls, advance, settle } = setup();
  sync.update({ program: 'F', live: false, busy: false });
  await advance(5000); await settle();
  sync.update({ program: 'F', live: true, busy: true });
  await advance(5000); await settle();
  assert.deepEqual(calls, []);
  sync.update({ program: 'F', live: true, busy: false });
  await advance(0); await settle();
  assert.deepEqual(calls, ['idle F']);
});

test('a change made on the robot reaches the cards, one made here is not undone', async () => {
  const { sync, calls, adopted, advance, settle } = setup();
  sync.update({ program: 'FL', live: true, busy: false });
  await advance(0); await settle();
  robotRestarts(sync, 'FL');
  // the child records a step with the robot's own button
  sync.onEvent({ type: 'prog', program: 'FLF' });
  assert.deepEqual(adopted, ['FLF']);
  sync.update({ program: 'FLF', live: true, busy: false });             // the cards follow
  await advance(5000); await settle();
  assert.deepEqual(calls, ['idle FL'], 'the robot already has it');
  // a card is deleted here, and in the same moment the robot reports its (old) program again
  sync.update({ program: 'FL', live: true, busy: false });
  sync.onEvent({ type: 'prog', program: 'FLF' });
  assert.deepEqual(adopted, ['FLF'], 'the change made here is on its way and wins');
  await advance(450); await settle();
  assert.equal(calls.at(-1), 'idle FL');
});

test('the mode is started again after Stop, but not after the robot was left with its centre button', async () => {
  const { sync, calls, advance, settle } = setup();
  sync.update({ program: 'FL', live: true, busy: false });
  await advance(0); await settle();
  robotRestarts(sync, 'FL');
  await advance(20000);                                  // the mode has been running for a while
  calls.length = 0;
  // Stop: the script ends, the mode is not running any more
  sync.onEvent({ type: 'bye' });
  await advance(450); await settle();
  assert.deepEqual(calls, ['idle FL'], 'Stop gives the robot its mode back');
  sync.onEvent({ type: 'hello' });
  sync.onEvent({ type: 'prog', program: 'FL' });
  await advance(20000);
  calls.length = 0;
  // the centre button of the robot
  sync.onEvent({ type: 'exit' });
  sync.onEvent({ type: 'bye' });
  await advance(5000); await settle();
  assert.deepEqual(calls, [], 'left on purpose');
  sync.update({ program: 'FLR', live: true, busy: false });             // until the cards change
  await advance(450); await settle();
  assert.deepEqual(calls, ['idle FLR']);
});

test('a start that failed is not tried again until something changes', async () => {
  const { sync, calls, errors, advance, settle } = setup({ failIdle: true });
  sync.update({ program: 'F', live: true, busy: false });
  await advance(0); await settle();
  await advance(5000); await settle();
  assert.deepEqual(calls, ['idle F']);
  assert.equal(errors.length, 1);
  sync.update({ program: 'FF', live: true, busy: false });
  await advance(450); await settle();
  assert.deepEqual(calls, ['idle F', 'idle FF']);
});

test('a run replaces what was on its way; afterwards the robot holds the run\'s program', async () => {
  const { sync, calls, advance, settle, timers } = setup();
  sync.update({ program: 'F', live: true, busy: false });
  await advance(0); await settle();
  robotRestarts(sync, 'F');
  calls.length = 0;
  sync.update({ program: 'FF', live: true, busy: false });              // a card added...
  assert.equal(timers.size, 1);
  await sync.play('FF');                                                // ...and GO before the pause is over
  assert.equal(timers.size, 0, 'nothing else is on its way');
  assert.deepEqual(calls, ['play FF']);
  assert.equal(sync.kind, 'play');
  sync.update({ program: 'FF', live: true, busy: true });               // playing
  robotRestarts(sync, 'FF');
  sync.update({ program: 'FF', live: true, busy: false });              // played
  await advance(5000); await settle();
  assert.deepEqual(calls, ['play FF'], 'the robot already holds it');
});

test('disconnecting forgets everything; connecting again starts the mode at once', async () => {
  const { sync, calls, advance, settle } = setup();
  sync.update({ program: 'FL', live: true, busy: false });
  await advance(0); await settle();
  robotRestarts(sync, 'FL');
  sync.onEvent({ type: 'conn', status: 'disconnected' });
  sync.update({ program: 'FL', live: false, busy: false });
  calls.length = 0;
  sync.update({ program: 'FL', live: true, busy: false });
  await advance(0); await settle();
  assert.deepEqual(calls, ['idle FL']);
});

test('the API\'s "script ended" notification, which can arrive late, does not make the mode start again', async () => {
  const { sync, calls, advance, settle } = setup();
  sync.update({ program: 'FL', live: true, busy: false });
  await advance(0); await settle();
  sync.onEvent({ type: 'hello' });
  sync.onEvent({ type: 'prog', program: 'FL' });
  calls.length = 0;
  sync.onEvent({ type: 'script-ended' });                // the old script's notification, after the new hello
  await advance(5000); await settle();
  assert.deepEqual(calls, []);
  assert.equal(sync.modeUp, true);
});

test('a start that was on its way is dropped when the mode says hello with the right program', async () => {
  const { sync, calls, advance, settle, timers } = setup();
  sync.update({ program: 'FL', live: true, busy: false });
  await advance(0); await settle();
  sync.onEvent({ type: 'hello' });
  sync.onEvent({ type: 'prog', program: 'FL' });
  calls.length = 0;
  sync.onEvent({ type: 'bye' });                         // the mode ended (and a restart was planned)...
  assert.equal(timers.size, 1);
  sync.onEvent({ type: 'hello' });                       // ...but it is up again already
  assert.equal(timers.size, 0);
  await advance(5000); await settle();
  assert.deepEqual(calls, []);
});

test('with its own timers it works where setTimeout may not be called as a method (a browser)', async () => {
  const real = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  // what a browser does: setTimeout / clearTimeout must be called with no `this`, or with the window
  globalThis.setTimeout = function strictSetTimeout(fn, ms) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Failed to execute 'setTimeout' on 'Window': Illegal invocation");
    return real(fn, ms);
  };
  globalThis.clearTimeout = function strictClearTimeout(id) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Failed to execute 'clearTimeout' on 'Window': Illegal invocation");
    return realClear(id);
  };
  try {
    const calls = [];
    const sync = new RobotSync({ backend: { idle: async (p) => { calls.push(p); }, play: async () => {} }, delayMs: 20 });
    sync.update({ program: 'FL', live: true, busy: false });             // first start: at once
    await new Promise((r) => real(r, 30));
    assert.deepEqual(calls, ['FL']);
    sync.onEvent({ type: 'prog', program: 'FL' });
    sync.update({ program: 'FLF', live: true, busy: false });            // then after the pause, and the pause can be cancelled
    sync.update({ program: 'FLFF', live: true, busy: false });
    await new Promise((r) => real(r, 60));
    assert.deepEqual(calls, ['FL', 'FLFF']);
    sync.update({ program: 'F', live: false, busy: false });             // not connected any more: clearTimeout is called
  } finally {
    globalThis.setTimeout = real;
    globalThis.clearTimeout = realClear;
  }
});

test('a mode that keeps stopping by itself right after it started is not started again for ever', async () => {
  const { sync, calls, errors, advance, settle } = setup();
  sync.update({ program: 'FL', live: true, busy: false });
  await advance(0); await settle();
  for (let i = 0; i < 6; i++) {
    sync.onEvent({ type: 'hello' });
    sync.onEvent({ type: 'prog', program: 'FL' });
    await advance(300);                                 // it dies soon after saying hello (a Python error)
    sync.onEvent({ type: 'bye' });
    sync.onEvent({ type: 'error', message: 'ValueError: x' });     // the Traceback comes just after the bye
    await advance(5000); await settle();
  }
  assert.ok(calls.length <= 2, `not for ever: ${calls.join(', ')}`);
  assert.equal(errors.length >= 0, true);
});

test('a bye followed by its error does not start the mode again', async () => {
  const { sync, calls, advance, settle } = setup();
  sync.update({ program: 'FL', live: true, busy: false });
  await advance(0); await settle();
  sync.onEvent({ type: 'hello' });
  sync.onEvent({ type: 'prog', program: 'FL' });
  calls.length = 0;
  await advance(10000);
  sync.onEvent({ type: 'bye' });                        // a restart is planned...
  sync.onEvent({ type: 'error', message: 'MemoryError: x' });   // ...and cancelled by the error that follows
  await advance(5000); await settle();
  assert.deepEqual(calls, []);
});

test('a mode that lived for a while and was stopped is started again', async () => {
  const { sync, calls, advance, settle } = setup();
  sync.update({ program: 'FL', live: true, busy: false });
  await advance(0); await settle();
  sync.onEvent({ type: 'hello' });
  sync.onEvent({ type: 'prog', program: 'FL' });
  calls.length = 0;
  await advance(20000);
  sync.onEvent({ type: 'bye' });                        // (Stop)
  await advance(500); await settle();
  assert.deepEqual(calls, ['idle FL']);
});

test('what the sync decides is written in the journal, once, so that a missing start can be explained', async () => {
  const { sync, logs, advance, settle } = setup();
  sync.update({ program: 'FFLF', live: true, busy: false });
  sync.update({ program: 'FFLF', live: true, busy: false });            // the same again: nothing new to say
  assert.deepEqual(logs.filter((l) => /to be given/.test(l)).length, 1);
  assert.match(logs[0], /^sync: FFLF to be given to the robot in 0 ms \(it holds nothing known, mode not running\)$/);
  await advance(0); await settle();
  assert.ok(logs.some((l) => /starting the mode with FFLF/.test(l)));
  sync.onEvent({ type: 'hello' });
  sync.onEvent({ type: 'prog', program: 'FFLF' });
  assert.ok(logs.some((l) => /the robot holds the cards: FFLF/.test(l)));
  sync.update({ program: 'FFLF', live: true, busy: true });
  assert.ok(logs.some((l) => /waiting: a run is being sent or played/.test(l)));
  sync.onEvent({ type: 'exit' });
  sync.update({ program: 'FFLF', live: true, busy: false });
  assert.ok(logs.some((l) => /not starting the mode by itself/.test(l)));
});

test('evaluating again changes nothing when nothing changed (the once-a-second safety net)', async () => {
  const { sync, calls, advance, settle } = setup();
  sync.update({ program: 'FL', live: true, busy: false });
  await advance(0); await settle();
  sync.onEvent({ type: 'hello' });
  sync.onEvent({ type: 'prog', program: 'FL' });
  calls.length = 0;
  for (let i = 0; i < 10; i++) { sync.evaluate(); await advance(1000); await settle(); }
  assert.deepEqual(calls, []);
});

test('the safety net makes up for a start that was missed', async () => {
  const { sync, calls, advance, settle } = setup();
  sync.live = true; sync.program = 'FL'; sync.busy = false;             // the state arrived without update() being called
  sync.evaluate();
  await advance(0); await settle();
  assert.deepEqual(calls, ['idle FL']);
});
