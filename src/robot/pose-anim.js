import { applyStep } from '../lang.js';
import { TICKS_PER_MS } from '../spec.js';

const TURN_MS = 1500;                      // a 90 degree turn of the firmware angle controller
const PULSE_UP_MS = 1280, PULSE_DOWN_MS = 2560;   // Common_GetBodyColorPulse()
const HOME = { x: 0, y: 0, th: 0 };

const lerp = (a, b, p) => a + (b - a) * p;
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
const CIRCLE_OF = { F: 0, R: 2, B: 4, L: 6 };

export const homePose = () => ({ ...HOME });

// The robot goes back to the start square (the cards were touched): the mat slides and turns back
// under it, so that the return is seen. Eased, 0.45 to 0.95 s depending on the distance; the turn
// takes the short way round.
const HOMING_MIN_MS = 450, HOMING_MAX_MS = 950;
const turnToHome = (th) => { const r = ((th % 360) + 360) % 360; return (r <= 180 ? -r : 360 - r) || 0; };

export class Homing {
  // Is there anything to show? (the robot is not on the start square already)
  static needed(from) { return Math.hypot(from.x, from.y) > 0.02 || Math.abs(turnToHome(from.th)) > 0.5; }

  constructor(from, now) {
    this.from = { x: from.x, y: from.y, th: from.th };
    this.dth = turnToHome(from.th);
    this.t0 = now;
    this.duration = Math.max(HOMING_MIN_MS, Math.min(HOMING_MAX_MS, 400 + 120 * Math.hypot(from.x, from.y) + 2 * Math.abs(this.dth)));
  }

  at(now) {
    const p = Math.max(0, Math.min(1, (now - this.t0) / this.duration));
    const e = ease(p);
    return { pose: { x: lerp(this.from.x, 0, e), y: lerp(this.from.y, 0, e), th: this.from.th + this.dth * e }, done: p >= 1 };
  }
}

// A real robot does not tell where it is, only which step it started and when its motion ended
// ("@@step", "@@moved"). The mat shows the ideal movement of that step, timed like the robot's:
// a straight step lasts what the 15 cm calibration says, a turn about a second and a half. When
// the robot says it is done the avatar is at the end of the step, early or late. The pose is the sum of
// the steps the robot says it takes (not a place in the program: with repeats and ifs a card is done
// several times, or not at all).
export class PoseAnimator {
  constructor() { this.reset('', null); }

  reset(program, cal) {
    this.cal = cal || { fw: 9000000, bw: 9000000 };
    this.from = { x: 0, y: 0, h: 0 };
    this.to = this.from;
    this.index = -1;
    this.code = '';
    this.t0 = 0;
    this.moved = true;
    this.ended = false;
    this.startedAt = 0;
  }

  setCal(cal) { this.cal = cal; }

  begin(now) { this.startedAt = now; }

  onStep(index, code, now) {
    this.from = this.to;                   // the step before is over, whether or not its "moved" arrived
    this.to = applyStep(this.from, code);
    this.index = index; this.code = code; this.t0 = now; this.moved = false;
  }

  onMoved(index) { if (index === this.index) this.moved = true; }

  onEnd() { this.ended = true; this.moved = true; }

  duration() {
    if (this.code === 'F') return this.cal.fw / TICKS_PER_MS;
    if (this.code === 'B') return this.cal.bw / TICKS_PER_MS;
    return TURN_MS;
  }

  pose(now) {
    if (this.index < 0) return { x: 0, y: 0, th: 0 };
    let p = this.moved ? 1 : Math.min(0.985, (now - this.t0) / this.duration());
    if (this.code === 'L' || this.code === 'R') p = ease(p);
    return { x: lerp(this.from.x, this.to.x, p), y: lerp(this.from.y, this.to.y, p), th: lerp(this.from.h, this.to.h, p) * 90 };
  }

  // What the robot's LEDs show, as far as the interface can tell: the body pulses, and the
  // circle shows the direction of the step.
  leds(now) {
    const t = (now - this.startedAt) % (PULSE_UP_MS + PULSE_DOWN_MS);
    const pulse = t < PULSE_UP_MS ? t / PULSE_UP_MS : 1 - (t - PULSE_UP_MS) / PULSE_DOWN_MS;
    const circle = new Array(8).fill(0);
    if (!this.ended && this.index >= 0 && this.code in CIRCLE_OF) circle[CIRCLE_OF[this.code]] = 16;
    return { pulse: this.ended ? 0 : pulse, circle };
  }
}
