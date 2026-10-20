import React, { useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { layout } from '../program.js';
import { FOLLOW_CELLS, edgePointer, toScreen, toWorld, viewBox, worldMatrix, zoomFor } from '../camera.js';
import { ArrowIcon, ArrowRightIcon, BluetoothOffIcon, BrushIcon, FlagIcon, RobotIcon, StarIcon, WarnIcon } from '../icons.jsx';
import { COLOR_CODES } from '../spec.js';
import { GROUND_CSS } from '../colors.js';

// The floor mat seen from above: one square = one straight step (15 cm). Coordinates here are in
// cells with y up; the SVG is y down, hence the sign in P().
//
// The robot is drawn once, at the origin, facing up. The mat is a group that is moved and turned
// under it every frame (see camera.js), so forward is always up.
const P = (x, y) => [x, -y];
const CIRCLE_DOTS = Array.from({ length: 8 }, (_, k) => {
  const a = (k * Math.PI) / 4;                  // 0 = front, clockwise
  return [Math.sin(a) * 0.2, -Math.cos(a) * 0.2];
});

// A straight step. A step backward is drawn a little to the side and in blue, so that it can be told
// from the step forward it undoes.
function Segment({ from, to, kind, state }) {
  let [x1, y1] = P(from.x, from.y);
  let [x2, y2] = P(to.x, to.y);
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  if (kind === 'B') {
    const off = 0.17;
    x1 += -uy * off; x2 += -uy * off; y1 += ux * off; y2 += ux * off;
  }
  const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return (
    <g className={`seg ${kind} ${state}`}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <path className="chev" d="M-0.13 -0.15 L0.1 0 L-0.13 0.15" transform={`translate(${(x1 + x2) / 2} ${(y1 + y2) / 2}) rotate(${ang})`} />
    </g>
  );
}

function Robot({ innerRef, dots }) {
  return (
    <g ref={innerRef} className="avatar">
      <path className="body" d="M-0.35 0.36 V-0.03 Q-0.35 -0.41 0 -0.41 Q0.35 -0.41 0.35 -0.03 V0.36 Z" />
      <circle className="led front" cx="-0.23" cy="-0.22" r="0.075" />
      <circle className="led front" cx="0.23" cy="-0.22" r="0.075" />
      <circle className="led back" cx="-0.23" cy="0.27" r="0.075" />
      <circle className="led back" cx="0.23" cy="0.27" r="0.075" />
      <circle className="pad" cx="0" cy="0" r="0.3" />
      {CIRCLE_DOTS.map(([x, y], k) => <circle key={k} ref={(el) => { dots.current[k] = el; }} className="dot" cx={x} cy={y} r="0.034" />)}
      <circle className="btn" cx="0" cy="0" r="0.065" />
      <g className="sensors">
        {[-0.24, -0.12, 0, 0.12, 0.24].map((x) => <circle key={x} cx={x} cy={-0.37 + Math.abs(x) * 0.25} r="0.022" />)}
      </g>
    </g>
  );
}

// The target: a chequered flag planted in a square. Drawn upright, planted at the origin.
function FinishFlag() {
  const squares = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) squares.push(<rect key={`${i}${j}`} x={i * 0.11} y={j * 0.11} width="0.11" height="0.11" />);
  return (
    <g className="finish">
      <path className="pole" d="M0 0.3 V-0.64" />
      <g transform="translate(0 -0.64)">
        <rect className="cloth" width="0.44" height="0.33" />
        <g className="checks">{squares}</g>
        <rect className="edge" width="0.44" height="0.33" />
      </g>
      <circle className="foot" cx="0" cy="0.3" r="0.06" />
    </g>
  );
}

// `api.setPose({ x, y, th }, leds)` moves the mat under the robot, and lights its LEDs, without
// re-rendering the whole tree. A touch on the mat sets the target flag there (onTarget), or removes
// it when it is touched again; the flag is only to be seen.
export default function Stage({ ref, program, cursor, doneUpTo, showPath, target, onTarget, canPlace, overlay, celebrate, t, kind, floor = {}, advanced, brush, onBrush, onFloor }) {
  const wrap = useRef(null);
  const svg = useRef(null);
  const world = useRef(null);
  const robot = useRef(null);
  const dots = useRef([]);
  const flagUp = useRef(null);
  const hud = useRef(null);
  const hudArrow = useRef(null);
  const pose = useRef({ x: 0, y: 0, th: 0 });
  const zoom = useRef({ cells: FOLLOW_CELLS, at: 0 });
  const [aspect, setAspect] = useState(1.2);

  const { start, poses, steps } = useMemo(() => layout(program, (x, y) => floor[`${x},${y}`]), [program, floor]);
  const latest = useRef({});
  latest.current = { aspect, showPath, target, points: [start, ...poses, ...(target ? [target] : [])] };

  // Put the mat where it has to be for this pose: turned so that the robot faces up, the zoom
  // slid towards its goal, the pointer to the target on the edge when the flag is out of sight.
  const frame = (p) => {
    const L = latest.current, now = performance.now();
    const dt = Math.min(0.1, (now - zoom.current.at) / 1000);
    zoom.current.at = now;
    const want = zoomFor({ pose: p, points: L.points, aspect: L.aspect, showPath: L.showPath });
    zoom.current.cells += (want - zoom.current.cells) * (1 - Math.exp(-dt * 6));
    const v = viewBox(zoom.current.cells, L.aspect);
    svg.current?.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    world.current?.setAttribute('transform', `matrix(${worldMatrix(p).join(' ')})`);
    flagUp.current?.setAttribute('transform', `rotate(${-p.th})`);
    const h = hud.current;
    if (h) {
      const e = L.target ? edgePointer(toScreen(L.target, p), v) : { visible: false };
      if (!e.visible) h.setAttribute('display', 'none');
      else {
        h.removeAttribute('display');
        h.setAttribute('transform', `translate(${e.x} ${e.y})`);
        hudArrow.current?.setAttribute('transform', `rotate(${e.angle})`);
      }
    }
  };

  useLayoutEffect(() => {
    const el = wrap.current;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setAspect(r.width / r.height); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => { frame(pose.current); });

  useImperativeHandle(ref, () => ({
    setPose(p, leds) {
      pose.current = p;
      frame(p);
      const el = robot.current;
      if (!el) return;
      el.style.setProperty('--pulse', String(leds ? leds.pulse : 0));
      for (let k = 0; k < 8; k++) {
        const d = dots.current[k];
        if (d) d.style.opacity = String(0.18 + 0.82 * ((leds?.circle?.[k] || 0) / 16));
      }
    },
    // the robot is back on the start square: a little pop
    arrive() {
      const el = robot.current;
      if (!el) return;
      el.classList.remove('arrive');
      void el.getBoundingClientRect();
      el.classList.add('arrive');
    },
  }), []);

  const touch = (e) => {
    if (!canPlace || !svg.current) return;
    const m = svg.current.getScreenCTM();
    if (!m) return;
    const at = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());   // where, in the robot's frame
    const w = toWorld(at.x, at.y, pose.current);
    const cell = { x: Math.round(w.x), y: Math.round(w.y) };
    if (advanced && brush) onFloor?.(cell);              // the brush paints the floor...
    else onTarget?.(cell);                               // ...otherwise a touch plants the flag
  };

  const prevOf = (k) => (k === 0 ? start : poses[k - 1]);
  const stateOf = (i) => (i <= doneUpTo ? 'done' : i === cursor ? 'active' : 'todo');

  return (
    <div className={`stage ${kind}`} ref={wrap} role="img" aria-label={t.stage} onClick={touch}>
      <svg ref={svg} className="mat" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="cell" width="1" height="1" patternUnits="userSpaceOnUse" x="-0.5" y="-0.5">
            <path d="M1 0 V1 M0 1 H1" className="gridline" />
          </pattern>
        </defs>
        <g ref={world}>
          <rect className="floor" x="-200" y="-200" width="400" height="400" />
          <rect x="-200" y="-200" width="400" height="400" fill="url(#cell)" />
          {Object.entries(floor).map(([key, c]) => {
            const [x, y] = key.split(',').map(Number);
            return <rect key={key} className="floor-tile" x={x - 0.5} y={-y - 0.5} width="1" height="1" rx="0.07" fill={GROUND_CSS[c]} />;
          })}
          <g className="start-tile">
            <rect x="-0.46" y="-0.46" width="0.92" height="0.92" rx="0.12" />
            <g transform="translate(-0.44 -0.02) scale(0.0072)" className="flag"><FlagIconShape /></g>
          </g>
          {showPath && poses.map((p, k) => (steps[k].code === 'F' || steps[k].code === 'B')
            ? <Segment key={`s${k}`} from={prevOf(k)} to={p} kind={steps[k].code} state={stateOf(steps[k].index)} />
            : null)}
          {target && (
            <g className="target" transform={`translate(${target.x} ${-target.y})`}>
              <rect className="target-cell" x="-0.46" y="-0.46" width="0.92" height="0.92" rx="0.12" />
              <g ref={flagUp}><FinishFlag /></g>
            </g>
          )}
        </g>
        <g ref={hud} className="hud" display="none">
          <g ref={hudArrow}><path d="M0.42 0 L0.66 -0.2 L0.66 0.2 Z" /></g>
          <circle r="0.38" />
          <g transform="translate(0 0.1) scale(0.5)"><FinishFlag /></g>
        </g>
        <Robot innerRef={robot} dots={dots} />
      </svg>
      {advanced && (
        <div className="brushbar" onClick={(e) => e.stopPropagation()}>
          <button className={`brush ${brush ? 'on' : ''}`} aria-pressed={Boolean(brush)} aria-label={t.floor.paint} onClick={() => onBrush(brush ? null : 'r')}><BrushIcon /></button>
          {brush && (
            <div className="swatches" role="group" aria-label={t.floor.paint}>
              {COLOR_CODES.map((c) => (
                <button key={c} className={`swatch ${brush === c ? 'on' : ''}`} aria-label={t.colors[c]} aria-pressed={brush === c} onClick={() => onBrush(c)}><i style={{ background: GROUND_CSS[c] }} /></button>
              ))}
              <button className={`swatch none ${brush === 'erase' ? 'on' : ''}`} aria-label={t.floor.erase} aria-pressed={brush === 'erase'} onClick={() => onBrush('erase')}><i /></button>
            </div>
          )}
        </div>
      )}
      {overlay && <Note kind={overlay.kind} key={overlay.key} />}
      {celebrate ? <Celebrate key={celebrate} /> : null}
    </div>
  );
}

// What the stage has to say, without words.
function Note({ kind }) {
  return (
    <div className={`stage-note ${kind}`} aria-hidden="true">
      {kind === 'sending' && (
        <>
          <span className="mini c-F"><ArrowIcon code="F" /></span>
          <span className="dots"><i /><i /><i /></span>
          <span className="who"><RobotIcon /></span>
        </>
      )}
      {kind === 'putBack' && <><span className="who"><RobotIcon /></span><ArrowRightIcon /><span className="flag"><FlagIcon /></span></>}
      {kind === 'done' && <span className="star"><StarIcon /></span>}
      {kind === 'warn' && <WarnIcon />}
      {kind === 'link' && <BluetoothOffIcon />}
    </div>
  );
}

// The flag of the start tile, drawn in the SVG (the <FlagIcon/> pictogram is HTML-side only).
function FlagIconShape() {
  return (
    <>
      <path d="M16 58 V8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M16 10 H50 L42 22 L50 34 H16 Z" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
    </>
  );
}

function Celebrate() {
  return (
    <div className="celebrate" aria-hidden="true">
      {Array.from({ length: 11 }, (_, i) => {
        const a = (i / 11) * Math.PI * 2 + 0.3;
        const r = 110 + (i % 3) * 45;
        return <span key={i} style={{ '--dx': `${Math.cos(a) * r}px`, '--dy': `${Math.sin(a) * r}px`, animationDelay: `${(i % 4) * 40}ms` }}><StarIcon /></span>;
      })}
    </div>
  );
}
