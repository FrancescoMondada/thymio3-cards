import React from 'react';
import { ArrowShape } from '../icons.jsx';

// The drawings of the robot's manual (see Manual.jsx): the robot seen from above, from the side (on a table), the remote control, a hand.
// Each scene is an SVG of 320 x 200 that scales to its card; the few words come in as props, the rest is shapes and the colours of the cards
// (green forward, blue backward, orange left, purple right), so that a child links the button of the robot to the card.
const INK = '#2a2b44', PINK = '#ff4f8b', MUTED = '#7d7a95', LINE = '#ece6f8', TABLE = '#e7d4ae';
const MAGENTA = '#e040fb', CYAN = '#18d6e0', RED = '#ef4444', GREEN = '#19b35a', ORANGE = '#ff9f1c';
const STEP = { F: ['var(--F)', 'var(--F-d)'], B: ['var(--B)', 'var(--B-d)'], L: ['var(--L)', 'var(--L-d)'], R: ['var(--R)', 'var(--R-d)'] };
const rad = (deg) => (deg * Math.PI) / 180;

// An arrow of the cards, white, in a square of side s
function Glyph({ code, s, color = '#fff' }) {
  return <g transform={`scale(${s / 64})`} style={{ color }} fill="currentColor"><ArrowShape code={code} /></g>;
}

// A tile like a card: coloured, with its arrow
function Tile({ code, x = 0, y = 0, s = 30, faded = false }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={faded ? 0.35 : 1}>
      <rect width={s} height={s} rx={s * 0.26} style={{ fill: STEP[code][0], stroke: STEP[code][1] }} strokeWidth="2.5" />
      <g transform={`translate(${s * 0.18} ${s * 0.18})`}><Glyph code={code} s={s * 0.64} /></g>
    </g>
  );
}

// The door with its arrow: "leave the mode" (the middle button of the robot). Drawn in a 24 x 24 box around (0, 0).
function ExitGlyph({ color = '#fff', width = 2.8 }) {
  return (
    <g fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <path d="M-9 -10 H-1 V10 H-9 Z" /><path d="M-1 0 H10 M6 -4 L10 0 L6 4" />
    </g>
  );
}

// A cross: the mark of what is wiped out
function Cross({ x, y, s = 14, color = RED }) {
  return <path d={`M${x - s} ${y - s} L${x + s} ${y + s} M${x + s} ${y - s} L${x - s} ${y + s}`} stroke={color} strokeWidth="6" strokeLinecap="round" fill="none" />;
}

// A ripple around the thing that is pressed or touched
function Ripple({ x, y, r = 14 }) {
  return (
    <g fill="none" stroke={PINK} strokeLinecap="round">
      <circle cx={x} cy={y} r={r} strokeWidth="3.5" />
      <circle cx={x} cy={y} r={r + 7} strokeWidth="2.5" opacity=".55" />
      <circle cx={x} cy={y} r={r + 13} strokeWidth="2" opacity=".28" />
    </g>
  );
}

// An arc of a circle (the waves of the remote control), from a0 to a1 degrees, 0 = to the right
function Arc({ x, y, r, a0, a1, width = 3.5, color = MUTED, opacity = 1 }) {
  const p = (a) => `${(x + r * Math.cos(rad(a))).toFixed(1)} ${(y + r * Math.sin(rad(a))).toFixed(1)}`;
  return <path d={`M${p(a0)} A${r} ${r} 0 0 1 ${p(a1)}`} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" opacity={opacity} />;
}

// ---- the robot from above: front up, five touch buttons in a cross, the ring of eight lights, four body lights -----------------------
// Drawn around (0, 0), 100 wide and 110 high. `press`: the button that is touched (F B L R or C), `body`: the body lights ('pulse' magenta and
// cyan, or off), `exit`: the middle button is the dark one with its door (the button that leaves the mode).
const BODY = 'M-50 52 V-2 Q-50 -58 0 -58 Q50 -58 50 -2 V52 Z';
const BUTTONS = [['F', 0, -25], ['B', 0, 25], ['L', -25, 0], ['R', 25, 0]];

export function RobotTop({ press = '', body = 'off', exit = false, button = true }) {
  const front = body === 'pulse' ? MAGENTA : '#e3e6f0';
  const back = body === 'pulse' ? CYAN : '#e3e6f0';
  return (
    <g>
      <path d={BODY} fill="#fff" stroke="#c3c9dc" strokeWidth="3" strokeLinejoin="round" />
      <circle r="44" fill="#f1f3f9" />
      {[-34, 34].map((x) => <circle key={`f${x}`} cx={x} cy="-37" r="6" fill={front} />)}
      {[-34, 34].map((x) => <circle key={`b${x}`} cx={x} cy="38" r="6" fill={back} />)}
      {Array.from({ length: 8 }, (_, k) => <circle key={k} cx={40 * Math.sin(rad(45 * k))} cy={-40 * Math.cos(rad(45 * k))} r="2.4" fill="#d9dce8" />)}
      {button && BUTTONS.map(([code, x, y]) => (
        <g key={code} transform={`translate(${x} ${y})`}>
          <rect x="-10" y="-10" width="20" height="20" rx="5" style={{ fill: STEP[code][0], stroke: STEP[code][1] }} strokeWidth="1.5" />
          <g transform="translate(-6.2 -6.2)"><Glyph code={code} s={12.4} /></g>
        </g>
      ))}
      {exit
        ? <g><circle r="10" fill={INK} /><g transform="scale(.55)"><ExitGlyph /></g></g>
        : <circle r="7.5" fill="#cfd5e3" />}
      {press && (() => {
        const at = press === 'C' ? [0, 0] : BUTTONS.find(([c]) => c === press).slice(1);
        return <g transform={`translate(${at[0]} ${at[1]})`}><Ripple x={0} y={0} r={press === 'C' ? 13 : 15} /></g>;
      })()}
    </g>
  );
}

// ---- 1. the buttons of the robot, and the remote control that has the same ---------------------------------------------------------
// ---- 2. the remote control --------------------------------------------------------------------------------------------------------
function Remote({ go = false, stop = false }) {
  return (
    <g>
      <rect x="-44" y="-96" width="88" height="192" rx="26" fill="#3a3b58" />
      <circle cy="-82" r="5" fill="#8a8cae" />
      {BUTTONS.map(([code, x, y]) => (
        <g key={code} transform={`translate(${x * 1.08} ${y * 1.08 - 30})`}>
          <rect x="-12" y="-12" width="24" height="24" rx="7" style={{ fill: STEP[code][0] }} />
          <g transform="translate(-8 -8)"><Glyph code={code} s={16} /></g>
        </g>
      ))}
      <g transform="translate(-22 42)">
        <circle r="17" fill={GREEN} /><path d="M-5 -8 L9 0 L-5 8 Z" fill="#fff" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
        {go && <Ripple x={0} y={0} r={19} />}
      </g>
      <g transform="translate(22 42)">
        <circle r="17" fill={RED} /><rect x="-7" y="-7" width="14" height="14" rx="3" fill="#fff" />
        {stop && <Ripple x={0} y={0} r={19} />}
      </g>
      {[-24, 0, 24].map((x) => <circle key={x} cx={x} cy="82" r="5" fill="#5a5c82" />)}
    </g>
  );
}

const Or = ({ x, y, or }) => (
  <g transform={`translate(${x} ${y})`}><circle r="10" fill="#fff" stroke={LINE} strokeWidth="2.5" /><text y="4" textAnchor="middle" fontSize="11" fontWeight="900" fill={MUTED}>{or}</text></g>
);

export function KeysArt({ labels, or }) {
  const rows = [['F', labels.forward, '15 cm'], ['B', labels.backward, '15 cm'], ['L', labels.left, '90°'], ['R', labels.right, '90°']];
  return (
    <svg viewBox="0 0 320 200" aria-hidden="true" focusable="false">
      <g transform="translate(52 104) scale(1.05)"><RobotTop press="F" exit /></g>
      <Or x={112} y={104} or={or} />
      <g transform="translate(152 104) scale(.7)"><Remote /></g>
      {rows.map(([code, word, what], i) => (
        <g key={code}>
          <Tile code={code} x={190} y={8 + 34 * i} s={30} />
          <text x="226" y={8 + 34 * i + 14} fontSize="16" fontWeight="900" fill={INK}>{word}</text>
          <text x="226" y={8 + 34 * i + 28} fontSize="12.5" fontWeight="800" fill={MUTED}>{what}</text>
        </g>
      ))}
      <g transform="translate(190 150)">
        <rect width="30" height="30" rx="8" fill={INK} />
        <g transform="translate(15 15) scale(.62)"><ExitGlyph /></g>
      </g>
      <text x="226" y="171" fontSize="16" fontWeight="900" fill={INK}>{labels.centre}</text>
    </svg>
  );
}

// ---- 3. start the program ---------------------------------------------------------------------------------------------------------
function Hand({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`} fill="#ffd9b3" stroke="#e0a672" strokeWidth="2.2" strokeLinejoin="round" opacity=".95">
      <rect x="-20" y="-2" width="40" height="28" rx="11" />
      {[-17, -6, 5, 16].map((fx, i) => <rect key={fx} x={fx - 4.2} y={-24 - (i === 1 || i === 2 ? 4 : 0)} width="8.4" height={i === 1 || i === 2 ? 30 : 26} rx="4.2" />)}
      <rect x="-30" y="6" width="9" height="20" rx="4.5" transform="rotate(-28 -26 18)" />
    </g>
  );
}

export function GoArt({ or }) {
  const tile = (x) => <rect x={x} y="22" width="96" height="140" rx="18" fill="#f6f3ff" stroke={LINE} strokeWidth="3" />;
  return (
    <svg viewBox="0 0 320 200" aria-hidden="true" focusable="false">
      {tile(6)}{tile(112)}{tile(218)}
      {/* the Go of the remote control */}
      <g transform="translate(54 92) scale(.55)"><Remote go /></g>
      {/* a hand over the back of the robot, then taken away */}
      <g transform="translate(160 84) scale(.62)"><RobotTop button={false} body="pulse" /></g>
      <circle cx="141" cy="109" r="4.5" fill={ORANGE} /><circle cx="179" cy="109" r="4.5" fill={ORANGE} />
      <Hand x={160} y={112} />
      <path d="M192 124 q16 -4 14 -30 M201 100 l5 -8 l5 9" fill="none" stroke={PINK} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      {/* the green button of the tablet */}
      <rect x="236" y="48" width="60" height="88" rx="10" fill="#fff" stroke={INK} strokeWidth="3.5" />
      <rect x="244" y="82" width="44" height="24" rx="12" fill={GREEN} />
      <path d="M260 88 L272 94 L260 100 Z" fill="#fff" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />
      <Ripple x={266} y={94} r={17} />
      <Or x={108} y={92} or={or} /><Or x={214} y={92} or={or} />
    </svg>
  );
}

// ---- 3b. stop: the middle button of the robot, the Stop of the remote control, the red button of the tablet ---------------------------------
export function StopArt({ or }) {
  const tile = (x) => <rect x={x} y="22" width="96" height="140" rx="18" fill="#f6f3ff" stroke={LINE} strokeWidth="3" />;
  return (
    <svg viewBox="0 0 320 200" aria-hidden="true" focusable="false">
      {tile(6)}{tile(112)}{tile(218)}
      <g transform="translate(54 92) scale(.55)"><Remote stop /></g>
      <g transform="translate(160 92) scale(.74)"><RobotTop body="pulse" press="C" exit /></g>
      <rect x="236" y="48" width="60" height="88" rx="10" fill="#fff" stroke={INK} strokeWidth="3.5" />
      <rect x="244" y="82" width="44" height="24" rx="12" fill={RED} />
      <rect x="260" y="88" width="12" height="12" rx="2.5" fill="#fff" />
      <Ripple x={266} y={94} r={17} />
      <Or x={108} y={92} or={or} /><Or x={214} y={92} or={or} />
    </svg>
  );
}

// ---- 4. erase: the robot seen from the side, on a table --------------------------------------------------------------------------------
// The robot from the front, at table level, around (0, 0), 100 wide and 56 high: its body, a wheel on each side, the row of the five
// front sensors, and on its TOP the bar of the arrow buttons (the four colours): that bar tells which way up it is.
function RobotSide() {
  return (
    <g>
      <rect x="-51" y="-2" width="10" height="26" rx="4" fill={INK} />
      <rect x="41" y="-2" width="10" height="26" rx="4" fill={INK} />
      <rect x="-42" y="-24" width="84" height="46" rx="16" fill="#fff" stroke="#c3c9dc" strokeWidth="3" />
      {['L', 'F', 'B', 'R'].map((code, i) => <rect key={code} x={-30 + i * 15} y="-31" width="14" height="9" rx="3" style={{ fill: STEP[code][0] }} />)}
      {[-24, -12, 0, 12, 24].map((x) => <circle key={x} cx={x} cy="-5" r="2.6" fill={INK} />)}
    </g>
  );
}

// One lane: the robot upright (faint), the way it is turned (an arrow), the robot so, and what that does to the cards.
function Lane({ y, pose, time, codes, crossed, tile = 26, children }) {
  const ground = 82;
  const s = 0.72;
  // the centre of the turned robot, so that it rests on the table by the part that touches it
  const turned = pose === 'side' ? { x: 148, y: ground - 50 * s, r: 90 } : { x: 148, y: ground - 27 * s, r: 180 };
  const gap = tile < 26 ? 4 : 6;
  return (
    <g transform={`translate(0 ${y})`}>
      <rect x="4" y="2" width="312" height="94" rx="20" fill="#f6f3ff" stroke={LINE} strokeWidth="3" />
      <rect x="14" y={ground} width="186" height="5" rx="2.5" fill={TABLE} />
      <g transform={`translate(54 ${ground - 24 * s}) scale(${s})`} opacity=".4"><RobotSide /></g>
      <g transform={`translate(${turned.x} ${turned.y}) rotate(${turned.r}) scale(${s})`}><RobotSide /></g>
      <path d="M92 30 q22 -20 40 -2" fill="none" stroke={PINK} strokeWidth="3.6" strokeLinecap="round" />
      <path d="M124 18 l10 11 l-14 4" fill="none" stroke={PINK} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <text x="110" y="15" textAnchor="middle" fontSize="13" fontWeight="900" fill={MUTED}>{time}</text>
      <path d="M190 52 h10 M196 47 l5 5 l-5 5" fill="none" stroke={MUTED} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <g>
        {codes.map((c, i) => <Tile key={i} code={c} x={212 + i * (tile + gap)} y={40} s={tile} faded={i >= codes.length - crossed} />)}
        <Cross x={212 + (codes.length - crossed) * (tile + gap) + (crossed * (tile + gap) - gap) / 2} y={40 + tile / 2} s={crossed > 1 ? 20 : 12} />
      </g>
      {children}
    </g>
  );
}

export function EraseArt({ labels, or }) {
  return (
    <svg viewBox="0 0 320 200" aria-hidden="true" focusable="false">
      {/* on its left or right side: the last step goes */}
      <Lane y={0} pose="side" time={labels.t1} codes={['F', 'R', 'F']} crossed={1} />
      {/* upside down, or the Stop of the remote control: everything goes */}
      <Lane y={102} pose="upside" time={labels.t2} codes={['F', 'R', 'F', 'L']} crossed={4} tile={22}>
        <g transform="translate(262 18)"><circle r="12" fill={RED} /><rect x="-5" y="-5" width="10" height="10" rx="2.2" fill="#fff" /></g>
        <Or x={234} y={18} or={or} />
      </Lane>
    </svg>
  );
}
