import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { ArrowIcon, ChevronDownIcon, CloseIcon, FlagIcon, PlusIcon } from '../icons.jsx';
import { MAX_STEPS } from '../spec.js';

// One card of a program, or of the palette.
export function CardFace({ code, label }) {
  return (
    <div className={`card c-${code}`} role="img" aria-label={label}>
      <ArrowIcon code={code} />
    </div>
  );
}

// The program: the start flag, then the cards in the order the robot will play them. A touch
// drags a card by holding it first, so a swipe still scrolls a long program.
export default function Track({
  ref, cards, cursor, doneUpTo, selected, dragFrom, dropIndex, onPointerDown, onRemove, t, phase, shake,
}) {
  const ol = useRef(null);
  const bar = useRef(null);
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
              <CardFace code={c.code} label={t.card[c.code]} />
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
        <div className="drop-bar" ref={bar} style={{ display: 'none' }} />
      </ol>
      {count === 0 && <div className="hint-arrow" aria-hidden="true"><ChevronDownIcon /></div>}
      <div className={`gauge ${count >= MAX_STEPS ? 'full' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={MAX_STEPS} aria-valuenow={count}>
        <i style={{ width: `${(count / MAX_STEPS) * 100}%` }} />
      </div>
    </div>
  );
}
