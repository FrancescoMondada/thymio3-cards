// The "Sequence" mode for the simulator: a port of src/py/sequence_mode.py, limited to what
// the interface can do on a virtual robot (replay a program). It prints the same events as
// the script, through `emit`, and exposes the LEDs the robot would show.
// tests/sim.test.js checks its timeline against the one of the real script.
import { cleanProgram, MAX_STEPS, TICKS_PER_MS, FORWARD, BACKWARD, LEFT, RIGHT, CELL_MM } from '../spec.js';
import { compile, Machine } from '../lang.js';

const MOVE_SPEED = 300;
const MAX_ROT_SPEED = 500;
const STOP_MOVE_MS = 500;
const STOP_ROT_MS = 700;
const MAXB = 16;
const GUARD_TICKS = 150000;
const S_KP = 0.1, S_KI = 0.2, S_MAX_I = 1000, S_LIMIT = 600;
const ST = { record: 0, play: 1 };
const PS = { replay: 0, movement: 1, rotation: 2, sense: 3 };
const SENSE_TICKS = 5;                        // the ground is read on this many ticks before an "if" decides
const COLOUR_ORDER = 'rygcbpwk?';             // a tie between two colours goes to the first of these

const tdiv = (a, b) => Math.trunc(a / b);
const clamp = (v, l) => Math.max(-Math.abs(l), Math.min(Math.abs(l), v));

export class SimSequence {
  // `floor(cx, cy)` is the colour letter of the floor cell (cells of 15 cm, x right, y up, the start cell is
  // 0, 0), or undefined: what the colour sensor under the virtual robot sees.
  constructor(robot, program, emit, { floor } = {}) {
    this.r = robot;
    this.emit = emit || (() => {});
    this.floor = floor || (() => undefined);
    this.machine = null;
    this.senseOp = null;
    this.senseSeen = '';
    this.senseLeft = 0;
    this.seq = cleanProgram(program).split('').slice(0, MAX_STEPS);
    this.wr = this.seq.length;
    this.rd = 0;
    this.state = ST.record;
    this.playState = PS.replay;
    this.motionInProgress = false;
    this.motionRunning = false;
    this.rotationInProgress = false;
    this.tStop = 0;
    this.rotDoneAt = -1;
    this.targetHeading = 0;
    this.alarm = 0;
    this.lastEl = 0;
    this.tMove = 0;
    this.rot90 = 16384 + robot.rotFactor;
    this.sOn = false;
    this.sTarget = 0;
    this.sBase = 0;
    this.sMaxCorr = 0;
    this.sInt = 0;
    this.sLastUs = 0;
    this.pulse = 0;
    this.ledState = 0;
    this.finished = false;
    // what the robot's LEDs show (for the avatar)
    this.leds = { front: [0, 0, 0], back: [0, 0, 0], circle: new Array(8).fill(0) };
  }

  start({ autoplay = true, phase = 0 } = {}) {
    const p = phase % 192;
    this.pulse = p < 64 ? p : p - 192;
    this.ledState = (2 * phase) & 0xff;
    this.emit({ type: 'hello', version: 1 });
    this.emit({ type: 'cal', fw: this.r.dur[0], bw: this.r.dur[1], rot90: this.rot90 });
    this.emit({ type: 'prog', program: this.seq.slice(0, this.wr).join('') });
    this.emit({ type: 'state', state: 'record' });
    if (autoplay) this.startPlay();
  }

  startPlay() {
    this.state = ST.play;
    this.emit({ type: 'state', state: 'play' });
    this.r.resetAngle();
    this.targetHeading = 0;
    this.playState = PS.replay;
    this.machine = new Machine(compile(this.seq.slice(0, this.wr).join('')));
  }

  // Stop button: what cleanup() does on the robot.
  stop() {
    this.r.timerPause();
    this.r.setSpeed(0, 0);
    this.r.cancelRotation();
    this.sOn = false;
    this.leds = { front: [0, 0, 0], back: [0, 0, 0], circle: new Array(8).fill(0) };
    this.finished = true;
    this.emit({ type: 'bye' });
  }

  bodyPulse() {
    this.pulse += 1;
    let b;
    if (this.pulse > 0) {
      b = this.pulse >> 2;
      if (this.pulse >= MAXB << 2) this.pulse = -(MAXB << 3);
    } else {
      b = -(this.pulse >> 3);
    }
    return b;
  }

  recordAnimation() {
    this.ledState = (this.ledState + 2) & 0xff;
    const fixed = Math.floor(this.ledState / MAXB);
    const lo = this.ledState & (MAXB - 1);
    const l = new Array(8).fill(0);
    l[fixed & 7] = MAXB;
    l[(fixed - 2) & 7] = MAXB - lo;
    l[(fixed + 2) & 7] = lo;
    l[(fixed + 4) & 7] = lo;
    this.leds.circle = l;
  }

  playAnimation(step) {
    const c = new Array(8).fill(0);
    if (step === BACKWARD) c[4] = MAXB;
    else if (step === FORWARD) c[0] = MAXB;
    else if (step === LEFT) c[6] = MAXB;
    else if (step === RIGHT) c[2] = MAXB;
    this.leds.circle = c;
  }

  // ---- straight controller (straight_controller.c) --------------------------------------
  straightStart(headingDeg, speed) {
    this.sTarget = tdiv(headingDeg * this.rot90, 90);
    this.sBase = speed;
    this.sMaxCorr = Math.abs(speed);
    this.sInt = 0;
    this.sLastUs = this.r.tUs;
    this.sOn = true;
  }

  applySpeeds(base, corr) {
    let left = base - corr;
    let right = base + corr;
    const over = Math.max(left, right) - S_LIMIT;
    if (over > 0) { left -= over; right -= over; }
    const under = -S_LIMIT - Math.min(left, right);
    if (under > 0) { left += under; right += under; }
    const rnd = (v) => (v < 0 ? Math.trunc(v - 0.5) : Math.trunc(v + 0.5));
    this.r.setSpeed(rnd(left), rnd(right));
  }

  straightUpdate() {
    if (!this.sOn) return;
    if (!this.motionRunning) { this.sOn = false; return; }
    const el = this.r.timerGet();
    const late = this.r.nowMs - this.tMove > Math.floor(this.alarm / TICKS_PER_MS) + 150;
    const done = el >= this.alarm || el < this.lastEl || late;
    this.lastEl = el;
    if (done) { this.endMove(); return; }
    if (el >= this.alarm - GUARD_TICKS) return;
    const now = this.r.tUs;
    let dt = (now - this.sLastUs) / 1e6;
    this.sLastUs = now;
    if (dt <= 0 || dt > 0.1) dt = 0.02;
    const err = this.sTarget - this.r.angleRaw();
    this.sInt = clamp(this.sInt + err * dt, S_MAX_I);
    const corr = clamp(S_KP * err + S_KI * this.sInt, this.sMaxCorr);
    this.applySpeeds(this.sBase, corr);
  }

  startMove(direction) {
    const dur = direction > 0 ? this.r.dur[0] : this.r.dur[1];
    this.r.timerSet(dur);
    this.r.timerReset();
    this.r.timerStart();
    this.alarm = dur;
    this.lastEl = 0;
    this.tMove = this.r.nowMs;
    this.motionInProgress = true;
    this.motionRunning = true;
    this.straightStart(this.targetHeading, MOVE_SPEED * direction);
    this.straightUpdate();
  }

  endMove() {
    this.motionRunning = false;
    this.sOn = false;
    this.r.setSpeed(0, 0);
    this.r.timerPause();
    this.tStop = this.r.nowMs;
    this.emit({ type: 'moved', index: this.rd - 1 });
  }

  // ---- one tick of the mode ---------------------------------------------------------------
  tick() {
    if (this.finished) return;
    const b = this.bodyPulse();
    this.leds.front = [b, 0, b];
    this.leds.back = [0, b, b];
    if (this.state === ST.record) {
      if (this.wr < MAX_STEPS) this.recordAnimation();
    } else {
      this.play();
    }
    this.straightUpdate();
    if (this.motionInProgress && !this.motionRunning && this.r.nowMs - this.tStop >= STOP_MOVE_MS) {
      this.motionInProgress = false;
    }
  }

  play() {
    if (this.playState === PS.replay) {
      this.handleReplay();
    } else if (this.playState === PS.movement) {
      if (!this.motionInProgress) this.playState = PS.replay;
    } else if (this.playState === PS.rotation) {
      if (this.r.rotationCompleted()) {
        const now = this.r.nowMs;
        if (this.rotDoneAt < 0) {
          this.rotDoneAt = now;
          this.emit({ type: 'moved', index: this.rd - 1 });
        } else if (now - this.rotDoneAt >= STOP_ROT_MS) {
          this.rotationInProgress = false;
          this.playState = PS.replay;
        }
      }
    } else if (this.playState === PS.sense) {
      this.sense();
    }
  }

  // An "if" or a "while": the ground is read on SENSE_TICKS ticks, the colour seen most often counts, and the
  // card after it is done only if it is the one asked for (see sense() in sequence_mode.py).
  sense() {
    const cx = Math.floor(this.r.x / CELL_MM + 0.5), cy = Math.floor(this.r.y / CELL_MM + 0.5);
    this.senseSeen += this.floor(cx, cy) || '?';
    this.senseLeft -= 1;
    if (this.senseLeft > 0) return;
    let best = '?', top = 0;
    for (const c of COLOUR_ORDER) {
      const votes = [...this.senseSeen].filter((x) => x === c).length;
      if (votes > top) { best = c; top = votes; }
    }
    const taken = best === this.senseOp[2];
    this.emit({ type: 'if', index: this.senseOp[1], taken, seen: best });
    this.machine.decide(taken);
    this.playState = PS.replay;
  }

  handleReplay() {
    if (this.motionInProgress || this.rotationInProgress) return;
    const op = this.machine.next();
    if (op) {
      this.rd = op[1] + 1;                          // the card being done (one more than its index)
      if (op[0] === 'I' || op[0] === 'W') {
        this.senseOp = op;
        this.senseSeen = '';
        this.senseLeft = SENSE_TICKS;
        this.playState = PS.sense;
        this.emit({ type: 'sense', index: op[1] });
        return;
      }
      const cur = op[2];
      this.emit({ type: 'step', index: op[1], code: cur });
      if (cur === BACKWARD) { this.startMove(-1); this.playState = PS.movement; }
      else if (cur === FORWARD) { this.startMove(1); this.playState = PS.movement; }
      else if (cur === LEFT || cur === RIGHT) {
        this.rotationInProgress = true;
        this.targetHeading += cur === LEFT ? 90 : -90;
        this.r.rotateAbsolute(this.targetHeading, MAX_ROT_SPEED);
        this.rotDoneAt = -1;
        this.playState = PS.rotation;
      }
      this.playAnimation(cur);
    } else {
      this.rd = 0;
      this.state = ST.record;
      this.emit({ type: 'state', state: 'record' });
      this.leds.circle = new Array(8).fill(0);
      this.emit({ type: 'end' });
    }
  }
}
