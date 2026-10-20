// The language of the cards, and how it is run. The robot's mode (src/py/sequence_mode.py:
// compile_program, Machine) and the simulator (sim/mode.js) do exactly this; tests/lang.test.js and
// tests/test_sequence_mode.py check that the two compilers agree on any program.
//
// A program is a string, one character per card (see spec.js). It is read leniently, so that any
// string means something: a group that is not closed is closed at the end, a ")" with nothing to close
// is ignored, a repeat, an "if" or a "while" with no card after it (at the end, or just before a ")"), or
// whose card does nothing (an empty group), does nothing.
//
//   unit    = a step | "(" cards ")" | repeat unit | if-colour unit
//   program = units
//
// It is compiled to a list of operations, each carrying the index of its card:
//   ['S', index, code]            do a step (F B L R)
//   ['L', index, n]               a loop that does what follows, up to its 'E', n times
//   ['E', loopPc]                 the end of the loop that began at operation loopPc
//   ['I', index, colour, skip]    if the ground is this colour go on, else skip the `skip` operations that follow
//   ['W', index, colour, skip]    the same, for a loop that goes on while the ground is this colour; its body ends with
//   ['X', whilePc]                which goes back to the 'W' to look at the ground again
import { isStep, isOpen, isClose, isRepeat, isColor, isWhile, WHILE_COLOR, cleanProgram } from './spec.js';

export function compile(program) {
  const t = cleanProgram(program);
  const ops = [];
  const n = t.length;

  // Compile the unit that begins at i; returns the index after it, or -1 when there is no unit there.
  const unit = (i) => {
    if (i >= n || isClose(t[i])) return -1;
    const c = t[i];
    if (isStep(c)) { ops.push(['S', i, c]); return i + 1; }
    if (isOpen(c)) {
      let j = i + 1;
      while (j < n && !isClose(t[j])) j = unit(j);
      return j < n ? j + 1 : j;
    }
    // a repeat, an "if" or a "while": it needs a unit after it
    const at = ops.length;
    ops.push(isRepeat(c) ? ['L', i, Number(c)] : isWhile(c) ? ['W', i, WHILE_COLOR[c], 0] : ['I', i, c, 0]);
    const j = unit(i + 1);
    if (j < 0 || ops.length === at + 1) { ops.pop(); return j < 0 ? i + 1 : j; }     // nothing to do in it: it does nothing
    if (isRepeat(c)) ops.push(['E', at]);
    else {
      if (isWhile(c)) ops.push(['X', at]);
      ops[at][3] = ops.length - at - 1;
    }
    return j;
  };

  let i = 0;
  while (i < n) i = isClose(t[i]) ? i + 1 : unit(i);
  return ops;
}

// Runs a compiled program, one operation at a time. next() gives the next step ('S') or the next
// check ('I' or 'W') and stops there; for a check the caller reads the ground, then calls decide(taken).
// It gives null at the end of the program.
export class Machine {
  constructor(ops) {
    this.ops = ops;
    this.pc = 0;
    this.loops = [];       // [loopPc, left]
  }

  next() {
    const ops = this.ops;
    while (this.pc < ops.length) {
      const op = ops[this.pc];
      if (op[0] === 'S') { this.pc += 1; return op; }
      if (op[0] === 'I' || op[0] === 'W') return op;
      if (op[0] === 'X') this.pc = op[1];                       // the end of a "while": look at the ground again
      else if (op[0] === 'L') { this.loops.push([this.pc, op[2]]); this.pc += 1; } else {   // 'E'
        const top = this.loops[this.loops.length - 1];
        top[1] -= 1;
        if (top[1] > 0) this.pc = top[0] + 1;
        else { this.loops.pop(); this.pc += 1; }
      }
    }
    return null;
  }

  // the answer to the check next() has just given
  decide(taken) {
    const op = this.ops[this.pc];
    this.pc += taken ? 1 : 1 + op[3];
  }
}

// The pose after a step: cells (x right, y up), `h` quarter turns counter-clockwise, 0 = facing up.
export function applyStep({ x, y, h }, code) {
  if (code === 'L') return { x, y, h: h + 1 };
  if (code === 'R') return { x, y, h: h - 1 };
  const dir = code === 'F' ? 1 : -1;
  const q = ((h % 4) + 4) % 4;
  return { x: x + dir * [0, -1, 0, 1][q], y: y + dir * [1, 0, -1, 0][q], h };
}

// What the robot would do on a floor, as the steps it takes in order: [{ index, code, cell }]. `colourAt(x, y)`
// says the colour of the floor cell where the robot stands (cell coordinates, x right, y up, the start
// cell is 0, 0, the robot faces up), or undefined. At most `limit` steps (a program can repeat for very long).
export function trace(program, colourAt = () => undefined, limit = 400) {
  const machine = new Machine(compile(program));
  const steps = [];
  let pose = { x: 0, y: 0, h: 0 };
  let looks = 0;                       // a "while" with nothing to do in it could look at the ground for ever
  for (let op = machine.next(); op && steps.length < limit && looks < limit * 20; op = machine.next()) {
    if (op[0] === 'I' || op[0] === 'W') { looks += 1; machine.decide(colourAt(pose.x, pose.y) === op[2]); continue; }
    pose = applyStep(pose, op[2]);
    steps.push({ index: op[1], code: op[2], ...pose });
  }
  return steps;
}
