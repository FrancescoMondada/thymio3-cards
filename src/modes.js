// Which cards the children have at hand. The settings choose one of three modes: normal (the four steps),
// advanced (everything), or custom (the cards the adult picks, for a more specific exercise or a step-by-step
// approach). A card is one of nine kinds; the cards that are already in a program stay whatever the mode.
import { REPEAT_CODES, COLOR_CODES, WHILE_CODES, isStep, isColor, isRepeat, isWhile, kindOf, cleanProgram } from './spec.js';

export const MODES = ['normal', 'advanced', 'custom'];
// the four steps, the two brackets, a repeat (a number), a repeat with a colour ("while"), the "if" on a colour
export const CARD_KINDS = ['F', 'B', 'L', 'R', 'open', 'close', 'repeat', 'while', 'if'];
// the card that is put in the program when the palette's card is taken (its value is chosen once it is selected)
export const PALETTE_CODE = { F: 'F', B: 'B', L: 'L', R: 'R', open: '(', close: ')', repeat: '2', while: 'E', if: 'r' };
export const NORMAL_KINDS = ['F', 'B', 'L', 'R'];

export const cardKind = (code) => (isStep(code) ? code : kindOf(code));

// A choice read back from the browser (or typed in): known kinds only, in the order of CARD_KINDS, never empty.
export function cleanCustom(value) {
  const list = Array.isArray(value) ? value : [];
  const kept = CARD_KINDS.filter((k) => list.includes(k));
  return kept.length ? kept : NORMAL_KINDS;
}

export const cardsOf = (mode, custom) => (mode === 'advanced' ? CARD_KINDS : mode === 'custom' ? cleanCustom(custom) : NORMAL_KINDS);

// Give a card, or take it away: the last card cannot be taken away.
export function toggleKind(custom, kind) {
  const list = cleanCustom(custom);
  if (!CARD_KINDS.includes(kind)) return list;
  if (list.includes(kind)) return list.length > 1 ? list.filter((k) => k !== kind) : list;
  return CARD_KINDS.filter((k) => k === kind || list.includes(k));
}

// The cards of the palette. A repeat with a number and a repeat with a colour are one card (the choices
// of the card, once it is selected, hold both), so with both there is one palette card.
export function paletteCodes(kinds) {
  return CARD_KINDS.filter((k) => kinds.includes(k) && !(k === 'while' && kinds.includes('repeat'))).map((k) => PALETTE_CODE[k]);
}

// A palette of n cards is laid out in this many columns: four, or five when five or nine fit better
export const paletteColumns = (n) => (n === 5 || n >= 9 ? 5 : 4);

// The floor of the virtual robot (the brush, the picture's colours) matters when a card looks at the ground.
export const hasGround = (kinds) => kinds.includes('if') || kinds.includes('while');

// The rows of choices of a selected repeat or "if" card: numbers, colours of a repeat, colours of an "if".
// The kind of the card itself is always there, even if the mode does not give it any more.
export function pickerRows(code, kinds) {
  if (isColor(code)) return [COLOR_CODES];
  const rows = [];
  if (kinds.includes('repeat') || isRepeat(code)) rows.push(REPEAT_CODES);
  if (kinds.includes('while') || isWhile(code)) rows.push(WHILE_CODES);
  return rows;
}

// The kinds of cards a program uses, and whether the mode has them all (an example is shown only then)
export const kindsOfProgram = (program) => [...new Set([...cleanProgram(program)].map(cardKind))];
export const fitsCards = (program, kinds) => kindsOfProgram(program).every((k) => kinds.includes(k));
