import React, { useRef, useState } from 'react';
import { ArrowIcon, EraserIcon, PlayIcon, StopIcon, TrashIcon } from '../icons.jsx';
import { STEP_CODES, cardClass } from '../spec.js';
import { cardLabel } from '../labels.js';

// The advanced cards of the palette, each with the value it starts with (the cards are changed when selected).
export const ADVANCED_PALETTE = ['(', ')', '2', 'r'];

export function Palette({ onPointerDown, onKeyTap, t, disabled, advanced }) {
  return (
    <div className="palette" role="group" aria-label={t.title}>
      {[...STEP_CODES, ...(advanced ? ADVANCED_PALETTE : [])].map((code) => (
        <button
          key={code}
          className={`pcard ${cardClass(code)}`}
          disabled={disabled}
          style={{ touchAction: 'none' }}
          aria-label={cardLabel(t, code)}
          onPointerDown={(e) => onPointerDown(e, { kind: 'new', code })}
          onClick={(e) => { if (e.detail === 0) onKeyTap(code); }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <ArrowIcon code={code} />
        </button>
      ))}
    </div>
  );
}

// "Keep your finger down": erasing everything must not happen by accident. The ring fills while
// the finger stays; letting go early does nothing but remind how it works.
function HoldButton({ onHold, onShort, label, children, wobble, ms = 900 }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef(0);
  const done = useRef(false);
  const begin = () => {
    done.current = false;
    setHolding(true);
    timer.current = setTimeout(() => { done.current = true; setHolding(false); onHold(); }, ms);
  };
  const end = () => {
    clearTimeout(timer.current);
    if (holding && !done.current) onShort?.();
    setHolding(false);
  };
  return (
    <button
      className={`tool hold ${holding ? 'holding' : ''} ${wobble ? 'wobble' : ''}`}
      aria-label={label}
      onPointerDown={begin}
      onPointerUp={end}
      onPointerLeave={() => { clearTimeout(timer.current); setHolding(false); }}
      onPointerCancel={() => { clearTimeout(timer.current); setHolding(false); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHold(); } }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45" style={{ animationDuration: `${ms}ms` }} /></svg>
      {children}
    </button>
  );
}

export function Dock({ eraserRef, canErase, running, canGo, onEraseLast, onClear, onClearHint, onGo, onStop, eraserActive, wobble, t }) {
  return (
    <div className="actions">
      <button
        ref={eraserRef}
        className={`tool eraser ${eraserActive ? 'ready' : ''}`}
        disabled={!canErase}
        aria-label={t.eraseLast}
        onClick={onEraseLast}
      >
        <EraserIcon />
      </button>
      <HoldButton onHold={onClear} onShort={onClearHint} wobble={wobble} label={`${t.eraseAll} — ${t.eraseAllHint}`}>
        <TrashIcon />
      </HoldButton>
      {running ? (
        <button className="go stop" onClick={onStop} aria-label={t.stop}><StopIcon /></button>
      ) : (
        <button className={`go ${canGo ? 'ready' : ''}`} onClick={onGo} aria-label={t.go}><PlayIcon /></button>
      )}
    </div>
  );
}
