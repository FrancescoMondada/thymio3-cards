import React from 'react';
import { isStep, isOpen, isClose, isRepeat, isColor, isWhile, WHILE_COLOR } from './spec.js';
import { GROUND_CSS } from './colors.js';

// Chunky, rounded, white-on-colour pictograms. 64 x 64.
const base = { viewBox: '0 0 64 64', 'aria-hidden': true, focusable: 'false' };
const stroke = { stroke: 'currentColor', strokeWidth: 4, strokeLinejoin: 'round', strokeLinecap: 'round' };

// The drawing alone (64 x 64, drawn with currentColor), so that the mat can reuse it in small.
export function ArrowShape({ code }) {
  if (!isStep(code)) return <TokenShape code={code} />;
  return (
    <>
      {code === 'F' && <path d="M32 7 L56 33 H41 V57 H23 V33 H8 Z" {...stroke} />}
      {code === 'B' && <path d="M32 57 L56 31 H41 V7 H23 V31 H8 Z" {...stroke} />}
      {(code === 'L' || code === 'R') && (
        <g {...stroke} transform={code === 'R' ? 'translate(64 0) scale(-1 1)' : undefined}>
          <path d="M44 58 V34 Q44 22 32 22 H26" fill="none" strokeWidth={14} strokeLinecap="butt" />
          <path d="M5 22 L28 4 V40 Z" />
        </g>
      )}
    </>
  );
}

// A digit 2..9 as the segments of a display, 14 x 26 around (0, 0): the robot's own LED style.
const SEGMENT = { a: 'M-7 -13 H7', b: 'M7 -13 V0', c: 'M7 0 V13', d: 'M-7 13 H7', e: 'M-7 0 V13', f: 'M-7 -13 V0', g: 'M-7 0 H7' };
const DIGIT_SEGMENTS = { 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgecd', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
export const digitPath = (n) => [...(DIGIT_SEGMENTS[n] || '')].map((k) => SEGMENT[k]).join(' ');

// The advanced cards: a group's brackets, "repeat the next card" (a loop arrow around the number of
// times, or around a colour: while the ground is that colour), "if the ground is this colour" (a question mark over a floor tile of that colour). No words.
function TokenShape({ code }) {
  if (isOpen(code) || isClose(code)) {
    return <path d={isOpen(code) ? 'M43 7 Q15 32 43 57' : 'M21 7 Q49 32 21 57'} fill="none" stroke="currentColor" strokeWidth={10} strokeLinecap="round" />;
  }
  if (isRepeat(code) || isWhile(code)) {
    // the loop arrow, around the number of times, or around the colour it goes on for while the ground has it
    return (
      <>
        <path d="M32 10 A22 22 0 1 1 10 32" fill="none" stroke="currentColor" strokeWidth={6.5} strokeLinecap="round" />
        <path d="M10 18 L3 31 H17 Z" fill="currentColor" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" />
        {isRepeat(code)
          ? <g transform="translate(32 32) scale(.9)"><path d={digitPath(code)} fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" /></g>
          : <circle cx="32" cy="32" r="10.5" fill={GROUND_CSS[WHILE_COLOR[code]]} stroke="currentColor" strokeWidth={4} />}
      </>
    );
  }
  if (isColor(code)) {
    // a question mark over a tile of the floor, in the colour asked for: "is the ground this colour?"
    return (
      <>
        <path d="M22 12 Q22 3 32 3 Q42 3 42 11 Q42 17 36 20.5 Q32 23 32 27" fill="none" stroke="currentColor" strokeWidth={7.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="32" cy="35.5" r="4.2" fill="currentColor" />
        <path d="M6 59 L14 46 H50 L58 59 Z" fill={GROUND_CSS[code]} stroke="currentColor" strokeWidth={3.5} strokeLinejoin="round" />
      </>
    );
  }
  return null;
}

export function ArrowIcon({ code }) {
  return (
    <svg {...base} className="icon-arrow" fill="currentColor">
      <ArrowShape code={code} />
    </svg>
  );
}

export const PlayIcon = () => (
  <svg {...base} fill="currentColor"><path d="M20 10 L54 32 L20 54 Z" {...stroke} strokeWidth={6} /></svg>
);
export const StopIcon = () => (
  <svg {...base} fill="currentColor"><rect x="14" y="14" width="36" height="36" rx="7" {...stroke} strokeWidth={4} /></svg>
);
export const EraserIcon = () => (
  <svg {...base}>
    <g transform="rotate(-35 32 34)">
      <rect x="8" y="22" width="48" height="24" rx="7" fill="#ffb3c7" stroke="currentColor" strokeWidth="3.5" />
      <rect x="8" y="22" width="19" height="24" rx="7" fill="#fff" stroke="currentColor" strokeWidth="3.5" />
    </g>
    <path d="M10 56 H54" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
  </svg>
);
export const TrashIcon = () => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 16 H52" /><path d="M25 16 V9 H39 V16" /><path d="M16 16 L19 56 H45 L48 16" />
    <path d="M27 26 V46" /><path d="M37 26 V46" />
  </svg>
);
export const BrushIcon = () => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M50 8 L58 16 L30 44 L22 36 Z" fill="currentColor" />
    <path d="M22 38 C12 38 12 48 8 56 C18 56 28 54 30 44" />
  </svg>
);
export const FlagIcon = () => (
  <svg {...base}>
    <path d="M16 58 V8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    <path d="M16 10 H50 L42 22 L50 34 H16 Z" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
  </svg>
);
export const PathIcon = () => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="14" cy="50" r="5" fill="currentColor" />
    <path d="M14 42 C14 24 44 34 44 20" strokeDasharray="1 9" />
    <path d="M35 21 L44 11 L53 21" />
  </svg>
);
export const BatteryIcon = ({ level = 1 }) => (
  <svg viewBox="0 0 40 20" aria-hidden="true" focusable="false">
    <rect x="1.5" y="2.5" width="31" height="15" rx="4" fill="none" stroke="currentColor" strokeWidth="2.5" />
    <rect x="34" y="7" width="4" height="6" rx="1.5" fill="currentColor" />
    <rect x="5" y="6" width={Math.max(2, 24 * level)} height="8" rx="2" fill="currentColor" />
  </svg>
);
export const StarIcon = () => (
  <svg {...base} fill="currentColor"><path d="M32 5 L39 24 L59 25 L43 38 L48 58 L32 47 L16 58 L21 38 L5 25 L25 24 Z" {...stroke} strokeWidth={3} /></svg>
);
export const CloseIcon = () => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round"><path d="M16 16 L48 48 M48 16 L16 48" /></svg>
);

// The robot seen from above, for the button and the empty states.
export const RobotIcon = () => (
  <svg {...base}>
    <path d="M10 56 V30 Q10 8 32 8 Q54 8 54 30 V56 Z" fill="#fff" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
    <circle cx="20" cy="20" r="4.5" fill="#e040fb" /><circle cx="44" cy="20" r="4.5" fill="#e040fb" />
    <circle cx="20" cy="47" r="4.5" fill="#18d6e0" /><circle cx="44" cy="47" r="4.5" fill="#18d6e0" />
    <circle cx="32" cy="34" r="6" fill="currentColor" />
  </svg>
);

export const PlusIcon = () => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round"><path d="M32 11 V53 M11 32 H53" /></svg>
);
export const ChevronDownIcon = () => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"><path d="M10 20 L32 44 L54 20" /></svg>
);
export const ArrowRightIcon = () => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 32 H52 M34 13 L54 32 L34 51" /></svg>
);
export const WarnIcon = () => (
  <svg {...base}>
    <path d="M32 6 L59 54 H5 Z" fill="#ffc61a" stroke="#2a2b44" strokeWidth="4" strokeLinejoin="round" />
    <path d="M32 21 V37" stroke="#2a2b44" strokeWidth="6" strokeLinecap="round" />
    <circle cx="32" cy="46" r="3.8" fill="#2a2b44" />
  </svg>
);
export const BluetoothOffIcon = () => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 20 L46 44 L31 58 V6 L46 20 L16 44" opacity=".55" />
    <path d="M8 8 L56 56" stroke="#ef4444" strokeWidth="7" />
  </svg>
);

// The robot and the waves it sends. off: grey and dashed, waiting to be reached; wait: the waves
// move; on: the robot is in colour, its lights on, the waves green, and a tick (the tick can be left
// out: the robot is reached but not ready); no: this browser cannot reach a robot.
export function ConnectIcon({ state = 'off', tick = true }) {
  return (
    <svg {...base} className={`conn-icon ${state}`}>
      <g className="waves" fill="none" strokeWidth="4.5" strokeLinecap="round">
        <path d="M45 17 A6 6 0 0 1 51 23" />
        <path d="M45 11 A12 12 0 0 1 57 23" />
        <path d="M45 5 A18 18 0 0 1 63 23" />
      </g>
      <g className="bot">
        <path className="body" d="M7 59 V37 Q7 15 26 15 Q45 15 45 37 V59 Z" strokeWidth="4" strokeLinejoin="round" />
        <circle className="lf" cx="16" cy="28" r="4.5" fill="#e040fb" />
        <circle className="lf" cx="36" cy="28" r="4.5" fill="#e040fb" />
        <circle className="lb" cx="16" cy="50" r="4.5" fill="#18d6e0" />
        <circle className="lb" cx="36" cy="50" r="4.5" fill="#18d6e0" />
        <circle cx="26" cy="39" r="5.5" fill="currentColor" />
      </g>
      {tick && (state === 'on' || state === 'sync' || state === 'standby') && (
        <g className="tick"><circle cx="50" cy="50" r="12" fill="#19b35a" stroke="#fff" strokeWidth="3.5" /><path d="M44 50 L49 55 L57 45" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" /></g>
      )}
      {state === 'no' && (
        <g className="tick"><circle cx="50" cy="50" r="12" fill="#ef4444" stroke="#fff" strokeWidth="3.5" /><path d="M45 45 L55 55 M55 45 L45 55" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" /></g>
      )}
    </svg>
  );
}

export const CheckIcon = () => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"><path d="M12 34 L26 48 L52 16" /></svg>
);

export const RefreshIcon = () => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M52 32 A20 20 0 1 1 44 16" /><path d="M46 6 V18 H34" />
  </svg>
);
