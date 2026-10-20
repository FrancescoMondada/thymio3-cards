import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { ArrowIcon, ChevronDownIcon, CloseIcon, FlagIcon, PlusIcon, digitPath } from '../icons.jsx';
import { MAX_STEPS, REPEAT_CODES, COLOR_CODES, WHILE_CODES, WHILE_COLOR, cardClass, isRepeat, isColor, isWhile } from '../spec.js';
import { GROUND_CSS } from '../colors.js';
import { cardLabel } from '../labels.js';

// One card of a program, or of the palette.
export function CardFace({ code, label }) {
  return (
    <div className={`card ${cardClass(code)}`} role="img" aria-label={label}>
      <ArrowIcon code={code} />
    </div>
  );
}

// The program: the start flag, then the cards in the order the robot will play them. A touch
// drags a card by holding it first, so a swipe still scrolls a long program.
export default function Track({
  ref, cards, cursor, doneUpTo, selected, dragFrom, dropIndex, onPointerDown, onRemove, onSetCode, check, t, phase, shake,
}) {
  const ol = useRef(null);
  const bar = useRef(null);
  const pick = useRef(null);
  const chosen = selected != null ? cards[selected] : null;
  const picking = phase === 'idle' && chosen && (isRepeat(chosen.code) || isWhile(chosen.code) || isColor(chosen.code));
  const count = cards.length;

  // The drop mark floats over the list; it never changes the layout, so the card under the finger
  // does not jump while the finger looks for its place.
  useLayoutEffect(() => {
    const b = bar.current, list = ol.current;
    if (!b || !list) return;
    if (dropIndex == null) { b.style.display = 'none'; return; }
    const items = list.querySelectorAll('[data-card]');
    const gap = parseFloat(getComputedStyle(list).columnGap) || 10;
    let el, left, side = 0;
    if (dropIndex < items.length) { el = items[dropIndex]; left = el.offsetLeft - gap / 2; }
    else if (items.length) { el = items[items.length - 1]; left = el.offsetLeft + el.offsetWidth + gap / 2; side = 1; }
    else { el = list.querySelector('.flag-tile'); left = el.offsetLeft + el.offsetWidth + gap / 2; side = 1; }
    b.style.display = 'block';
    b.style.left = `${left - 3}px`;
    b.style.top = `${el.offsetTop}px`;
    b.style.height = `${el.offsetHeight}px`;
    b.dataset.side = String(side);
  });

  // The picker of a repeat or an "if" card: a bar under the card, over what follows.
  useLayoutEffect(() => {
    const p = pick.current, list = ol.current;
    if (!p || !list || selected == null) return;
    const el = list.querySelector(`[data-card="${selected}"]`);
    if (!el) return;
    p.style.top = `${el.offsetTop + el.offsetHeight + 8}px`;
    p.scrollIntoView?.({ block: 'nearest' });
  });

  // Follow the card the robot is playing; show the new card that was just added.
  const prevCount = useRef(count);
  useEffect(() => {
    const scroller = typeof ref === 'object' && ref ? ref.current : null;
    if (!scroller) return;
    const grew = count > prevCount.current;
    prevCount.current = count;
    const idx = phase === 'playing' && cursor >= 0 ? cursor : grew ? count - 1 : -1;
    if (idx < 0) return;
    const el = ol.current?.querySelector(`[data-card="${idx}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [count, cursor, phase, ref]);

  return (
    <div className={`track-scroll ${shake ? 'shake' : ''}`} ref={ref}>
      <ol className="track" ref={ol}>
        <li className="flag-tile" role="img" aria-label={t.start}><FlagIcon /></li>
        {cards.map((c, i) => {
          const state = phase !== 'idle' || cursor >= 0 ? (i <= doneUpTo ? 'done' : i === cursor ? 'active' : 'todo') : '';
          return (
            <li
              key={c.id}
              data-card={i}
              className={`slot ${state} ${selected === i ? 'selected' : ''} ${dragFrom === i ? 'lifted' : ''}`}
              style={{ touchAction: 'pan-y' }}
              onPointerDown={(e) => onPointerDown(e, { kind: 'move', code: c.code, index: i })}
              onContextMenu={(e) => e.preventDefault()}
            >
              <CardFace code={c.code} label={cardLabel(t, c.code)} />
              {check && check.index === i && <span key={check.key} className={`flash ${check.taken ? 'yes' : 'no'}`} aria-hidden="true" />}
              {selected === i && phase === 'idle' && (
                <button
                  className="x" aria-label={t.remove}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                ><CloseIcon /></button>
              )}
            </li>
          );
        })}
        {count === 0 && <li className="empty-hint" aria-hidden="true"><span className="ghost-slot"><PlusIcon /></span></li>}
        {picking && (
          <div className="picker" ref={pick} role="group" aria-label={cardLabel(t, chosen.code)}>
            {(isColor(chosen.code) ? [COLOR_CODES] : [REPEAT_CODES, WHILE_CODES]).map((row, r) => (
              <div className="pick-row" key={r}>
                {row.map((v) => (
                  <button
                    key={v} className={`pick ${cardClass(v)} ${v === chosen.code ? 'on' : ''}`} aria-pressed={v === chosen.code}
                    aria-label={cardLabel(t, v)}
                    onClick={(e) => { e.stopPropagation(); onSetCode(selected, v); }}
                  >{isRepeat(v)
                    ? <svg viewBox="-11 -17 22 34" aria-hidden="true"><path d={digitPath(v)} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    : <svg viewBox="-12 -12 24 24" aria-hidden="true"><circle r="9.5" fill={GROUND_CSS[isWhile(v) ? WHILE_COLOR[v] : v]} stroke="currentColor" strokeWidth="2.6" /></svg>}</button>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="drop-bar" ref={bar} style={{ display: 'none' }} />
      </ol>
      {count === 0 && <div className="hint-arrow" aria-hidden="true"><ChevronDownIcon /></div>}
      <div className={`gauge ${count >= MAX_STEPS ? 'full' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={MAX_STEPS} aria-valuenow={count}>
        <i style={{ width: `${(count / MAX_STEPS) * 100}%` }} />
      </div>
    </div>
  );
}
