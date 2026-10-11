// The mat turns under the robot, which stays in the same place facing up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toScreen, toWorld, worldMatrix, viewBox, zoomFor, edgePointer, FOLLOW_CELLS, ROBOT_AT } from '../src/camera.js';
import { layout } from '../src/program.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const poses = [{ x: 0, y: 0, th: 0 }, { x: 2, y: 3, th: 90 }, { x: -1.5, y: 4, th: -90 }, { x: 3, y: -2, th: 180 }, { x: 0.3, y: 0.7, th: 37 }, { x: 1, y: 1, th: -360 }, { x: 0, y: 0, th: 450 }];

test('the robot is at the origin, and what is ahead of it is up whatever its heading', () => {
  for (const pose of poses) {
    const here = toScreen(pose, pose);
    assert.ok(near(here.x, 0) && near(here.y, 0));
    const a = (pose.th * Math.PI) / 180;
    const ahead = { x: pose.x - Math.sin(a) * 2, y: pose.y + Math.cos(a) * 2 };      // 2 cells in front of it
    const s = toScreen(ahead, pose);
    assert.ok(near(s.x, 0, 1e-9) && near(s.y, -2, 1e-9), `ahead is up (th ${pose.th}): ${JSON.stringify(s)}`);
    const left = { x: pose.x - Math.cos(a), y: pose.y - Math.sin(a) };               // 1 cell to its left
    const l = toScreen(left, pose);
    assert.ok(near(l.x, -1, 1e-9) && near(l.y, 0, 1e-9), `left is left (th ${pose.th})`);
  }
});

test('the screen can be turned back into the mat (to place a flag where it is touched)', () => {
  for (const pose of poses) {
    for (const p of [{ x: 0, y: 0 }, { x: 3, y: -4 }, { x: -2.5, y: 7 }]) {
      const s = toScreen(p, pose);
      const w = toWorld(s.x, s.y, pose);
      assert.ok(near(w.x, p.x, 1e-9) && near(w.y, p.y, 1e-9));
    }
  }
});

test('the SVG matrix of the mat does the same as toScreen', () => {
  for (const pose of poses) {
    const [a, b, c, d, e, f] = worldMatrix(pose);
    for (const p of [{ x: 0, y: 0 }, { x: 3, y: -4 }, { x: -2.5, y: 7 }]) {
      const svg = { x: p.x, y: -p.y };                       // the mat is drawn as (x, -y)
      const m = { x: a * svg.x + c * svg.y + e, y: b * svg.x + d * svg.y + f };
      const s = toScreen(p, pose);
      assert.ok(near(m.x, s.x, 1e-9) && near(m.y, s.y, 1e-9), `th ${pose.th}`);
    }
  }
});

test('the view: the robot always at the same place, a fixed zoom when the path is hidden', () => {
  for (const aspect of [0.7, 1, 1.5, 2.2]) {
    const v = viewBox(FOLLOW_CELLS, aspect);
    assert.ok(near(v.w / v.h, aspect));
    assert.ok(near(Math.min(v.w, v.h), FOLLOW_CELLS));
    assert.ok(near(-v.y / v.h, ROBOT_AT) && near(v.x + v.w / 2, 0));
    for (const pose of poses) {
      assert.equal(zoomFor({ pose, points: [{ x: 40, y: 40 }], aspect, showPath: false }), FOLLOW_CELLS, 'the path must not show in the zoom');
    }
  }
});

test('with the path shown, all of it stays on the screen whatever the robot does', () => {
  for (const program of ['FFRFFFLFF', 'F'.repeat(20), 'BBBBLLFFFF', 'FRFRFRFR']) {
    const { start, poses: steps } = layout(program);
    const points = [start, ...steps];
    for (const aspect of [0.7, 1.4, 2]) {
      for (const pose of [...points.map((p) => ({ x: p.x, y: p.y, th: p.h * 90 })), { x: 0.3, y: 0.7, th: 37 }]) {
        const zoom = zoomFor({ pose, points, aspect, showPath: true });
        const v = viewBox(zoom, aspect);
        for (const p of points) {
          const s = toScreen(p, pose);
          assert.ok(s.x >= v.x && s.x <= v.x + v.w && s.y >= v.y && s.y <= v.y + v.h, `${program} ${aspect} ${JSON.stringify(pose)} ${JSON.stringify(s)}`);
        }
      }
    }
  }
});

test('a pointer to what is off screen sits on the edge, towards it', () => {
  const box = viewBox(FOLLOW_CELLS, 1.2);
  assert.equal(edgePointer({ x: 0.5, y: -1 }, box).visible, false, 'in view: no pointer');
  for (const target of [{ x: 10, y: 0 }, { x: -10, y: -3 }, { x: 0, y: -20 }, { x: 4, y: 30 }, { x: -30, y: 30 }]) {
    const p = edgePointer(target, box);
    assert.equal(p.visible, true);
    assert.ok(p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h, 'inside the view');
    const onEdge = near(Math.abs(p.x - (box.x + box.w - 0.8)), 0, 1e-6) || near(p.x, box.x + 0.8, 1e-6) || near(p.y, box.y + 0.8, 1e-6) || near(p.y, box.y + box.h - 0.8, 1e-6);
    assert.ok(onEdge, `on the edge: ${JSON.stringify(p)}`);
    assert.ok(near(Math.atan2(p.y, p.x), Math.atan2(target.y, target.x), 1e-9), 'same direction as the target');
    assert.ok(near(p.angle, (Math.atan2(target.y, target.x) * 180) / Math.PI, 1e-9));
  }
});
