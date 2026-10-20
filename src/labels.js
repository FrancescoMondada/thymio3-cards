import { isStep, isOpen, isClose, isRepeat, isColor, isWhile, WHILE_COLOR } from './spec.js';

// What a screen reader says about a card.
export function cardLabel(t, code) {
  if (isStep(code)) return t.card[code];
  if (isOpen(code)) return t.card.open;
  if (isClose(code)) return t.card.close;
  if (isRepeat(code)) return `${t.card.repeat} — ${code} ${t.floor.times}`;
  if (isWhile(code)) return `${t.card.while} — ${t.colors[WHILE_COLOR[code]]}`;
  if (isColor(code)) return `${t.card.if} — ${t.colors[code]}`;
  return '';
}
