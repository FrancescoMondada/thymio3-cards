import { VirtualThymio } from './physics.js';
import { SimSequence } from './mode.js';
import { CELL_MM } from '../spec.js';

// The virtual robot, driven by the interface. It plays the program with the same mode as the
// real robot and sends the same events (see script-core.js: parseRobotLine). advance(ms) moves
// virtual time; the caller decides how fast (x1 is real time).
export class SimBackend {
  constructor(emit) {
    this.emit = emit;
    this.robot = new VirtualThymio();
    this.mode = null;
    this.running = false;
    this.stepIndex = 0;
    this.budget = 0;
  }

  // `floor(cx, cy)`: the colour letter of a floor cell, or undefined (see SimSequence)
  play(program, floor) {
    this.robot = new VirtualThymio();
    this.mode = new SimSequence(this.robot, program, (e) => {
      if (e.type === 'end') this.running = false;
      this.emit(e);
    }, { floor });
    this.stepIndex = 0;
    this.budget = 0;
    this.running = true;
    this.mode.start({ autoplay: true });
  }

  stop() {
    if (!this.mode) return;
    this.mode.stop();
    this.running = false;
  }

  // Same cadence as the script: the mode ticks every 20 ms, the physics runs every 2 ms.
  advance(ms) {
    if (!this.running) return;
    this.budget += ms;
    while (this.budget >= 2 && this.running) {
      if (this.stepIndex % 10 === 0) this.mode.tick();
      this.robot.step();
      this.stepIndex += 1;
      this.budget -= 2;
    }
  }

  // Pose on the mat, in cells (x right, y up) and degrees counter-clockwise.
  pose() {
    const r = this.robot;
    return { x: r.x / CELL_MM, y: r.y / CELL_MM, th: r.headingDeg };
  }

  leds() { return this.mode ? this.mode.leds : null; }
}
