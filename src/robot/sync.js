// Keeps the robot's program equal to the cards' program.
//
// The robot reports its own program ("@@prog"), so what changes on the robot (its buttons, laying
// it on its side) reaches the cards. In the other direction a running script cannot receive
// anything, so the robot is given the cards' program by starting its mode again with it, a moment
// after the last change. This class decides when; the backend does it (backend.idle / backend.play).
//
// Inputs: update({ program, live, busy }) whenever the cards, the connection or the busy flag
// (a run is being sent or played) change; onEvent(e) for what the robot says; play(program).
// Outputs: onState({ syncing, modeUp, failed }), onAdopt(program) when the robot changed its own program,
// onError(err) when it could not be given the cards.
const SHORT_LIFE_MS = 3000;     // a mode that stops by itself within this time of its hello did not really start

export class RobotSync {
  // setTimer / clearTimer are injected for the tests. The defaults call the globals as plain
  // functions: a browser refuses setTimeout called as a method of another object ("Illegal invocation").
  constructor({ backend, delayMs = 450, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id), now = () => Date.now(), onState, onAdopt, onError, onLog }) {
    this.backend = backend;
    this.delayMs = delayMs;
    this.setTimer = setTimer;
    this.now = now;
    this.clearTimer = clearTimer;
    this.onState = onState || (() => {});
    this.onAdopt = onAdopt || (() => {});
    this.onError = onError || (() => {});
    this.log = (text) => { if (text !== this.lastLog) { this.lastLog = text; onLog?.('info', `sync: ${text}`); } };
    this.lastLog = '';
    this.program = '';
    this.live = false;
    this.busy = false;
    this.known = null;        // the program the robot holds; null: not known yet
    this.modeUp = false;      // the mode runs on the robot
    this.syncing = false;     // the robot is being given the cards
    this.hold = null;         // the program for which the mode must not restart by itself (left on purpose, or failed)
    this.timer = 0;
    this.timerFor = null;     // the program the timer was set for
    this.kind = 'wait';       // what the script being started does: 'wait' or 'play'
    this.helloAt = 0;         // when the mode last said hello
    this.shortLives = 0;      // how many times in a row the mode ended soon after starting
    this.liveFails = 0;       // live updates that failed in a row
    this.liveBroken = false;  // given up for this connection
  }

  // The cards are written into the mode that runs, which answers with its program (see backend.live):
  // no restart. It is for a mode that is up and whose program is known; anything else, or any failure,
  // is the restart. Two failures in a row and it is not tried again until the next connection.
  async tryLive(sent) {
    if (this.liveBroken || !this.modeUp || this.known === null || typeof this.backend.live !== 'function') return false;
    try {
      const ms = await this.backend.live(sent);
      this.liveFails = 0;
      this.log(`live update: the running mode holds ${sent || '(no cards)'} (${ms} ms, not restarted)`);
      return true;
    } catch (err) {
      this.liveFails += 1;
      this.log(`live update failed (${err?.message || err}): starting the mode again instead`);
      if (this.liveFails >= 2) {
        this.liveBroken = true;
        this.log('live update failed twice in a row: not tried again until the robot is connected again');
      }
      return false;
    }
  }

  get pending() { return Boolean(this.timer); }

  // `failed`: the robot could not be given its mode (nothing is known of it, and the start was given up)
  notify() { this.onState({ syncing: this.syncing, modeUp: this.modeUp, failed: this.known === null && this.hold !== null && !this.syncing }); }

  cancelTimer() {
    if (this.timer) this.clearTimer(this.timer);
    this.timer = 0;
    this.timerFor = null;
  }

  update({ program, live, busy }) {
    this.program = program;
    this.live = live;
    this.busy = busy;
    this.evaluate();
  }

  // Is the robot to be given the cards, and when? (what is decided goes to the journal, once)
  evaluate() {
    const shown = this.program || '(no cards)';
    if (!this.live) { this.cancelTimer(); return; }
    if (this.busy) { this.cancelTimer(); this.log('waiting: a run is being sent or played'); return; }
    if (this.syncing) { this.cancelTimer(); this.log(`waiting: the robot is being given the cards, then ${shown} if they changed`); return; }
    if (this.modeUp && this.program === this.known) { this.cancelTimer(); this.log(`the robot holds the cards: ${shown}`); return; }
    if (!this.modeUp && this.hold === this.program) { this.cancelTimer(); this.log(`not starting the mode by itself for ${shown} (it was left on purpose, or it failed): change the cards or press go`); return; }
    if (this.timer && this.timerFor === this.program) return;                                // already on its way
    this.cancelTimer();                                                                       // the cards changed again: wait again
    this.timerFor = this.program;
    // right away the first time (a robot that has just been connected), a moment after the last change otherwise
    const wait = this.known === null ? 0 : this.delayMs;
    this.log(`${shown} to be given to the robot in ${wait} ms (it holds ${this.known === null ? 'nothing known' : this.known || '(no cards)'}, mode ${this.modeUp ? 'running' : 'not running'})`);
    this.timer = this.setTimer(() => { this.timer = 0; this.timerFor = null; this.push(); }, wait);
  }

  async push() {
    if (!this.live || this.busy || this.syncing) { this.log(`push skipped (live ${this.live}, busy ${this.busy}, syncing ${this.syncing})`); return; }
    const sent = this.program;
    this.log(`starting the mode with ${sent || '(no cards)'}`);
    this.hold = null;
    this.kind = 'wait';
    this.syncing = true;
    this.notify();
    try {
      if (!(await this.tryLive(sent))) await this.backend.idle(sent);
      // the mode started with `sent` (it said hello), or took it (it answered): that is what the robot
      // holds, whether or not its "@@prog" has arrived yet
      this.known = sent;
      this.modeUp = true;
    } catch (err) {
      this.hold = sent;
      this.log(`could not give the robot ${sent || '(no cards)'}: ${err?.message || err}`);
      this.onError(err);
    } finally {
      this.syncing = false;
      this.notify();
    }
    this.evaluate();                  // the cards may have changed meanwhile
  }

  // "C'est parti": the run carries the program itself, whatever was on its way is not needed.
  async play(program) {
    this.cancelTimer();
    this.hold = null;
    this.kind = 'play';
    await this.backend.play(program);
    this.known = program;
    this.modeUp = true;
    this.notify();
  }

  // The robot is back in its firmware (after the self test, for instance): start the mode again.
  reset() {
    this.known = null;
    this.modeUp = false;
    this.hold = null;
    this.notify();
    this.evaluate();
  }

  onEvent(e) {
    switch (e.type) {
      case 'hello':
        this.modeUp = true;
        this.helloAt = this.now();
        this.notify();
        this.evaluate();              // a start that was on its way may not be needed any more
        break;
      case 'prog':
        this.known = e.program;
        // A different program, with nothing on its way to the robot: it was changed on the robot.
        if (this.live && !this.busy && !this.syncing && !this.timer && e.program !== this.program) {
          this.log(`the robot's program changed on the robot: ${e.program || '(no cards)'} (the cards follow)`);
          this.onAdopt(e.program);
        } else this.evaluate();
        break;
      // The mode's own "@@bye" is what says it ended: it comes in order with its other lines. The
      // script-ended notification of the API travels on another channel and may arrive late, when
      // the next start is already up: it says nothing about the mode.
      case 'bye': {
        // A mode that ends by itself soon after it started is failing (its error may come just after
        // this line): starting it again and again would never stop. Twice, and it is left alone.
        const wasUp = this.modeUp;
        this.modeUp = false;
        if (wasUp && !this.syncing && this.now() - this.helloAt < SHORT_LIFE_MS) this.shortLives += 1; else if (wasUp && !this.syncing) this.shortLives = 0;
        if (this.shortLives >= 2) {
          this.hold = this.program;
          this.shortLives = 0;
          this.cancelTimer();
          this.notify();
          this.onError(new Error('the mode keeps stopping by itself'));
          break;
        }
        this.notify();
        this.evaluate();              // (while the mode is being replaced, `syncing` holds it back)
        break;
      }
      case 'exit':                    // the centre button of the robot: left on purpose
        this.modeUp = false;
        this.hold = this.program;
        this.cancelTimer();           // (a restart planned by the "@@bye" that follows is not wanted)
        this.notify();
        break;
      case 'error':
        this.hold = this.program;
        this.cancelTimer();
        this.notify();
        break;
      case 'conn':
        if (e.status === 'disconnected') {
          this.cancelTimer();
          this.known = null;
          this.modeUp = false;
          this.syncing = false;
          this.hold = null;
          this.liveFails = 0;
          this.liveBroken = false;
          this.notify();
        }
        break;
      default: break;
    }
  }
}
