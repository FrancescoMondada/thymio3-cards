import test from 'node:test';
import assert from 'node:assert/strict';
import { Homing, homePose } from '../src/robot/pose-anim.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

test('nothing to glide when the robot is already on the start square', () => {
  assert.equal(Homing.needed(homePose()), false);
  assert.equal(Homing.needed({ x: 0, y: 0, th: 360 }), false, 'a whole turn is the same heading');
  assert.equal(Homing.needed({ x: 0, y: 0, th: -720 }), false);
  assert.equal(Homing.needed({ x: 1, y: 0, th: 0 }), true);
  assert.equal(Homing.needed({ x: 0, y: 0, th: 90 }), true);
});

test('the glide starts where the robot was, ends on the start square, and is eased', () => {
  const from = { x: 2, y: 3, th: 90 };
  const h = new Homing(from, 1000);
  const a = h.at(1000);
  assert.deepEqual(a.pose, from);
  assert.equal(a.done, false);
  const end = h.at(1000 + h.duration);
  near(end.pose.x, 0); near(end.pose.y, 0); near(Math.sin((end.pose.th * Math.PI) / 180), 0); near(Math.cos((end.pose.th * Math.PI) / 180), 1);
  assert.equal(end.done, true);
  assert.equal(h.at(1000 + h.duration * 5).done, true, 'and stays done');
  // eased: slower at the ends than in the middle, and never going back
  let last = Infinity;
  const dists = [];
  for (let k = 0; k <= 20; k++) { const p = h.at(1000 + (h.duration * k) / 20).pose; dists.push(Math.hypot(p.x, p.y)); }
  for (const d of dists) { assert.ok(d <= last + 1e-12, 'always getting closer'); last = d; }
  assert.ok(dists[0] - dists[1] < dists[9] - dists[10], 'starts gently');
  assert.ok(dists[19] - dists[20] < dists[9] - dists[10], 'ends gently');
});

test('the turn takes the short way round', () => {
  const turned = (th) => new Homing({ x: 0, y: 0, th }, 0).dth;
  assert.equal(turned(90), -90);
  assert.equal(turned(-90), 90);
  assert.equal(turned(270), 90, 'three quarters one way is a quarter the other');
  assert.equal(turned(450), -90);
  assert.equal(turned(-270), -90);
  assert.equal(Math.abs(turned(180)), 180);
  assert.equal(turned(360), 0);
});

test('it lasts between 0.45 and 0.95 s, longer for a longer way', () => {
  const d = (x, y, th) => new Homing({ x, y, th }, 0).duration;
  assert.equal(d(0.1, 0, 0), 450);
  assert.ok(d(3, 0, 0) > d(1, 0, 0));
  assert.ok(d(0, 0, 180) > d(0, 0, 90));
  assert.equal(d(40, 40, 180), 950);
});

test('a clock that runs back does not push the robot out of its path', () => {
  const h = new Homing({ x: 4, y: 0, th: 0 }, 500);
  assert.deepEqual(h.at(100).pose, { x: 4, y: 0, th: 0 });
});
