import { useCallback, useEffect, useRef, useState } from 'react';

const MOVE_THRESHOLD = 8;     // px before a press becomes a drag
const HOLD_MS = 220;          // a finger must rest this long on a placed card to lift it
const EDGE = 48;              // px from the top/bottom of the track where it scrolls by itself

// Pointer based drag and drop for the cards (HTML5 drag and drop does not work with a finger).
//
//   payload { kind: 'new', code }              a card of the palette
//   payload { kind: 'move', code, index }      a card of the program
//
// A press that does not move is a tap. Mouse: the card follows after a few pixels. Touch:
// palette cards follow at once (that area does not scroll); program cards must be held for a
// moment first, so that a swipe on them still scrolls the program.
export function useDrag({ trackRef, eraserRef, enabled, onTapNew, onTapCard, onInsert, onMove, onRemove }) {
  const [drag, setDrag] = useState(null);
  const latest = useRef({});
  latest.current = { enabled, onTapNew, onTapCard, onInsert, onMove, onRemove };
  const gesture = useRef(null);

  // Registered once and never passive: the browser must be allowed to cancel the scroll of a
  // finger that has just lifted a card.
  useEffect(() => {
    const block = (e) => { if (gesture.current?.started && e.cancelable) e.preventDefault(); };
    window.addEventListener('touchmove', block, { passive: false });
    return () => window.removeEventListener('touchmove', block);
  }, []);

  const targetAt = useCallback((x, y) => {
    const track = trackRef.current;
    if (!track) return null;
    const box = track.getBoundingClientRect();
    const pad = 24;
    if (x < box.left - pad || x > box.right + pad || y < box.top - pad || y > box.bottom + pad) return null;
    const cards = [...track.querySelectorAll('[data-card]')];
    if (!cards.length) return 0;
    let best = 0, bestD = Infinity, bestRect = null;
    cards.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), (y - (r.top + r.height / 2)) * 1.4);
      if (d < bestD) { bestD = d; best = i; bestRect = r; }
    });
    return x < bestRect.left + bestRect.width / 2 ? best : best + 1;
  }, [trackRef]);

  const overEraser = useCallback((x, y) => {
    const el = eraserRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x > r.left - 8 && x < r.right + 8 && y > r.top - 8 && y < r.bottom + 8;
  }, [eraserRef]);

  const onPointerDown = useCallback((e, payload) => {
    if (!latest.current.enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // A gesture that never got its pointerup (button released outside the window, lost focus)
    // must not block the next press, nor keep a card stuck to the pointer.
    gesture.current?.cleanup();
    const g = {
      id: e.pointerId, payload, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      touch: e.pointerType !== 'mouse', started: false, timer: 0, raf: 0, scrollRaf: 0, cleanup: null,
    };
    gesture.current = g;

    const publish = () => {
      g.raf = 0;
      if (!g.started) return;
      const eraser = payload.kind === 'move' && overEraser(g.x, g.y);
      setDrag({
        kind: payload.kind, code: payload.code, from: payload.index, x: g.x, y: g.y,
        target: eraser ? null : targetAt(g.x, g.y), eraser,
      });
    };
    const schedule = () => { if (!g.raf) g.raf = requestAnimationFrame(publish); };

    const autoscroll = () => {
      if (!g.started) return;
      const track = trackRef.current;
      if (track) {
        const r = track.getBoundingClientRect();
        if (g.y < r.top + EDGE && g.y > r.top - 30) track.scrollTop -= 9;
        else if (g.y > r.bottom - EDGE && g.y < r.bottom + 30) track.scrollTop += 9;
      }
      g.scrollRaf = requestAnimationFrame(autoscroll);
    };

    const start = () => {
      if (g.started) return;
      g.started = true;
      clearTimeout(g.timer);
      try { navigator.vibrate?.(12); } catch { /* not everywhere */ }
      publish();
      g.scrollRaf = requestAnimationFrame(autoscroll);
    };

    const cleanup = () => {
      clearTimeout(g.timer);
      cancelAnimationFrame(g.raf);
      cancelAnimationFrame(g.scrollRaf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', abort);
      window.removeEventListener('keydown', abortOnEscape);
      document.removeEventListener('visibilitychange', abort);
      if (gesture.current === g) gesture.current = null;
      setDrag(null);
    };
    g.cleanup = cleanup;

    function abort() { cleanup(); }
    function abortOnEscape(ev) { if (ev.key === 'Escape') cleanup(); }

    function move(ev) {
      if (ev.pointerId !== g.id) return;
      // the mouse is back with no button down: the release happened somewhere we never heard of
      if (ev.pointerType === 'mouse' && ev.buttons === 0) { cleanup(); return; }
      g.x = ev.clientX;
      g.y = ev.clientY;
      if (!g.started) {
        if (Math.hypot(g.x - g.x0, g.y - g.y0) < MOVE_THRESHOLD) return;
        if (g.touch && payload.kind === 'move') { cleanup(); return; }   // a swipe: let it scroll
        start();
      }
      schedule();
    }

    function up(ev) {
      if (ev.pointerId !== g.id) return;
      g.x = ev.clientX;
      g.y = ev.clientY;
      const was = g.started;
      const eraser = was && payload.kind === 'move' && overEraser(g.x, g.y);
      const target = was && !eraser ? targetAt(g.x, g.y) : null;
      cleanup();
      const h = latest.current;
      if (!was) {
        if (payload.kind === 'new') h.onTapNew?.(payload.code);
        else h.onTapCard?.(payload.index);
      } else if (eraser) {
        h.onRemove?.(payload.index);
      } else if (target !== null) {
        if (payload.kind === 'new') h.onInsert?.(payload.code, target);
        else h.onMove?.(payload.index, target);
      }
    }

    function cancel(ev) {
      if (ev.pointerId === g.id) cleanup();
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', abort);
    window.addEventListener('keydown', abortOnEscape);
    document.addEventListener('visibilitychange', abort);
    if (g.touch && payload.kind === 'move') g.timer = setTimeout(start, HOLD_MS);
  }, [targetAt, overEraser, trackRef]);

  return { drag, onPointerDown };
}
