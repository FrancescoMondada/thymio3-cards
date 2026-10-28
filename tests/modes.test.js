// The modes of the settings: which cards the children have.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, CARD_KINDS, PALETTE_CODE, NORMAL_KINDS, cardKind, cleanCustom, cardsOf, toggleKind, paletteCodes, paletteColumns, hasGround, hasGroundCards, pickerRows, kindsOfProgram, fitsCards, paletteColumnsWide } from '../src/modes.js';
import { REPEAT_CODES, COLOR_CODES, WHILE_CODES, TOKEN_ALPHABET } from '../src/spec.js';
import { EXAMPLES } from '../src/program.js';

test('three modes; nine kinds of cards, and each has the card the palette puts in the program', () => {
  assert.deepEqual(MODES, ['normal', 'advanced', 'custom']);
  assert.equal(CARD_KINDS.length, 9);
  assert.deepEqual(Object.keys(PALETTE_CODE), CARD_KINDS);
  for (const k of CARD_KINDS) assert.equal(cardKind(PALETTE_CODE[k]), k, `the card of the palette for ${k}`);
});

test('every card there is has a kind', () => {
  for (const c of TOKEN_ALPHABET) assert.ok(CARD_KINDS.includes(cardKind(c)), c);
  assert.equal(cardKind('x'), null);
});

test('normal: the four steps; advanced: everything; custom: what was chosen, never nothing', () => {
  assert.deepEqual(cardsOf('normal'), NORMAL_KINDS);
  assert.deepEqual(cardsOf('advanced'), CARD_KINDS);
  assert.deepEqual(cardsOf('custom', ['if', 'F', 'repeat']), ['F', 'repeat', 'if'], 'in the order of the cards');
  assert.deepEqual(cardsOf('custom', []), NORMAL_KINDS);
  assert.deepEqual(cardsOf('custom', null), NORMAL_KINDS);
  assert.deepEqual(cardsOf('custom', ['x', 'F', 'F', 7]), ['F'], 'unknown kinds and doubles are dropped');
  assert.deepEqual(cardsOf('whatever'), NORMAL_KINDS);
  assert.deepEqual(cleanCustom('F'), NORMAL_KINDS, 'not a list');
});

test('a card is given or taken away; the last one stays', () => {
  assert.deepEqual(toggleKind(['F', 'B'], 'if'), ['F', 'B', 'if']);
  assert.deepEqual(toggleKind(['F', 'B', 'if'], 'L'), ['F', 'B', 'L', 'if'], 'in the order of the cards');
  assert.deepEqual(toggleKind(['F', 'B', 'if'], 'B'), ['F', 'if']);
  assert.deepEqual(toggleKind(['F'], 'F'), ['F'], 'the last card cannot be taken away');
  assert.deepEqual(toggleKind(['F'], 'nonsense'), ['F']);
  assert.deepEqual(toggleKind(null, 'repeat'), ['F', 'B', 'L', 'R', 'repeat'], 'from the normal cards');
});

test('the palette: the cards of the mode, one repeat card for a number and for a colour', () => {
  assert.deepEqual(paletteCodes(cardsOf('normal')), ['F', 'B', 'L', 'R']);
  assert.deepEqual(paletteCodes(cardsOf('advanced')), ['F', 'B', 'L', 'R', '(', ')', '2', 'r'], 'as before: eight cards');
  assert.deepEqual(paletteCodes(['F', 'repeat']), ['F', '2']);
  assert.deepEqual(paletteCodes(['F', 'while']), ['F', 'E'], 'a colour only: the repeat card starts on a colour');
  assert.deepEqual(paletteCodes(['repeat', 'while']), ['2'], 'both: one card');
  assert.deepEqual(paletteCodes(['L', 'if']), ['L', 'r']);
});

test('the palette has four columns, five for five or nine cards', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map(paletteColumns), [4, 4, 4, 4, 5, 4, 4, 4, 5]);
});

test('the ground matters when a card looks at it', () => {
  assert.equal(hasGround(NORMAL_KINDS), false);
  assert.equal(hasGround(['F', 'repeat', 'open', 'close']), false);
  assert.equal(hasGround(['F', 'if']), true);
  assert.equal(hasGround(['while']), true);
  assert.equal(hasGround(CARD_KINDS), true);
});

test('the choices of a selected card: numbers, colours of a repeat, colours of an if', () => {
  const all = CARD_KINDS;
  assert.deepEqual(pickerRows('3', all), [REPEAT_CODES, WHILE_CODES]);
  assert.deepEqual(pickerRows('E', all), [REPEAT_CODES, WHILE_CODES]);
  assert.deepEqual(pickerRows('r', all), [COLOR_CODES]);
  assert.deepEqual(pickerRows('3', ['F', 'repeat']), [REPEAT_CODES], 'numbers only');
  assert.deepEqual(pickerRows('E', ['F', 'while']), [WHILE_CODES], 'colours only');
  assert.deepEqual(pickerRows('3', ['F', 'while']), [REPEAT_CODES, WHILE_CODES], 'a card that is there stays readable, and can become one that is given');
  assert.deepEqual(pickerRows('E', ['F', 'repeat']), [REPEAT_CODES, WHILE_CODES]);
  assert.deepEqual(pickerRows('r', ['F']), [COLOR_CODES]);
});

test('the kinds a program uses; an example is shown when the mode has all its cards', () => {
  assert.deepEqual(kindsOfProgram('FFLR').sort(), ['F', 'L', 'R']);
  assert.deepEqual(kindsOfProgram('2(FrR)E(F)').sort(), ['F', 'R', 'close', 'if', 'open', 'repeat', 'while'].sort());
  assert.deepEqual(kindsOfProgram(''), []);
  assert.equal(fitsCards('FFLR', NORMAL_KINDS), true);
  assert.equal(fitsCards('4(FR)', NORMAL_KINDS), false);
  assert.equal(fitsCards('4(FR)', ['F', 'R', 'open', 'close', 'repeat']), true);
  assert.equal(fitsCards('4(FR)', ['F', 'R', 'repeat']), false, 'the brackets are missing');
  // the examples of the basic mode are made of the four steps; the others need the advanced cards
  for (const ex of EXAMPLES) assert.equal(fitsCards(ex.program, NORMAL_KINDS), !ex.advanced, ex.id);
  for (const ex of EXAMPLES) assert.equal(fitsCards(ex.program, CARD_KINDS), true, ex.id);
});

test('a program has a card that looks at the ground when it has an "if" or a repeat on a colour', () => {
  assert.equal(hasGroundCards(''), false);
  assert.equal(hasGroundCards('FFRL'), false);
  assert.equal(hasGroundCards('2(FR)'), false, 'a repeat with a number does not look at the ground');
  assert.equal(hasGroundCards('FrL'), true, 'if the ground is red');
  assert.equal(hasGroundCards('E(F)'), true, 'while the ground is red');
  assert.equal(hasGroundCards('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFk'.slice(0, 55)), false, 'only the cards that are kept are looked at');
});

test('on a tablet held upright the palette is one row: as many columns as cards, four at least, eight at most', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 12].map(paletteColumnsWide), [4, 4, 4, 4, 5, 6, 7, 8, 8, 8]);
});
