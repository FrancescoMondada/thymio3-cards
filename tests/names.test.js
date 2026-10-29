// The name beside the QR code: a name drawn at random from a very large palette, agreed in the four languages, and
// the date and the time next to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NAME_COUNT, NAME_LANGS, NAME_MAX, composeName, randomName, randomParts, genderOf, cleanName, formatWhen } from '../src/names.js';

// animals 0 fox, 1 giraffe, 10 rabbit; adjectives 0 red, 1 blue, 9 small, 10 big; number 32 -> 42
test('a name is an animal, an adjective that agrees with it, and a number: the four languages', () => {
  assert.equal(composeName('en', 0, 1, 32), 'Blue Fox 42');
  assert.equal(composeName('fr', 0, 1, 32), 'Renard bleu 42', 'masculine');
  assert.equal(composeName('fr', 1, 1, 32), 'Girafe bleue 42', 'feminine');
  assert.equal(composeName('fr', 0, 9, 32), 'Petit renard 42', 'some adjectives go before the noun');
  assert.equal(composeName('fr', 1, 9, 32), 'Petite girafe 42');
  assert.equal(composeName('de', 0, 1, 32), 'Blauer Fuchs 42', 'der Fuchs');
  assert.equal(composeName('de', 1, 1, 32), 'Blaue Giraffe 42', 'die Giraffe');
  assert.equal(composeName('de', 10, 1, 32), 'Blaues Kaninchen 42', 'das Kaninchen');
  assert.equal(composeName('it', 0, 0, 32), 'Volpe rossa 42', 'la volpe');
  assert.equal(composeName('it', 2, 0, 32), 'Leone rosso 42', 'il leone');
  assert.equal(composeName('it', 0, 9, 32), 'Piccola volpe 42');
  assert.equal(composeName('it', 2, 10, 32), 'Grande leone 42');
  assert.equal(composeName('xx', 0, 1, 32), 'Renard bleu 42', 'an unknown language is French');
});

test('the palette is very large, and every name of it is well formed and fits the limit', () => {
  assert.ok(NAME_COUNT >= 50000, `${NAME_COUNT} names per language`);
  const animals = Math.round(NAME_COUNT / 90 / 24);
  assert.equal(animals * 24 * 90, NAME_COUNT);
  let longestOfAll = 0;
  for (const lang of NAME_LANGS) {
    const seen = new Set();
    let longest = '';
    for (let a = 0; a < animals; a++) for (let j = 0; j < 24; j++) for (const number of [0, 45, 89]) {
      const name = composeName(lang, a, j, number);
      assert.ok(!/undefined|NaN|\s{2}|^\s|\s$/.test(name), `${lang}: "${name}"`);
      assert.match(name, /^\p{Lu}\p{L}+( \p{L}+)? \p{L}+ [1-9]\d$/u, `${lang}: "${name}"`);
      assert.ok(name.length <= NAME_MAX, `${lang}: "${name}" is ${name.length}`);
      if (name.length > longest.length) longest = name;
      seen.add(name);
    }
    assert.equal(seen.size, animals * 24 * 3, `${lang}: no two combinations give the same name`);
    assert.ok(longest.length < NAME_MAX, `${lang}: the longest, "${longest}", leaves room under the limit`);
    longestOfAll = Math.max(longestOfAll, longest.length);
  }
});

test('the longest drawn name is the one the comment of the module says', () => {
  let longest = 0;
  for (const lang of NAME_LANGS) for (let a = 0; a < 42; a++) for (let j = 0; j < 24; j++) longest = Math.max(longest, composeName(lang, a, j, 89).length);
  assert.equal(longest, 29, 'names.js says "the longest drawn is 29"');
});

test('a drawn name uses the whole palette, and two tablets of a class rarely share one', () => {
  let state = 12345;
  const rand = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };     // a fixed sequence, so the test does not flake
  const names = Array.from({ length: 60000 }, () => randomName('fr', rand));
  const distinct = new Set(names);
  assert.ok(distinct.size > 35000, `${distinct.size} different names in 60000 draws`);
  const classes = 2000;
  let shared = 0;
  for (let c = 0; c < classes; c++) {
    const room = new Set(Array.from({ length: 30 }, () => randomName('en', rand)));
    if (room.size < 30) shared++;
  }
  assert.ok(shared / classes < 0.03, `${shared} classes of 30 tablets out of ${classes} had two with the same name`);
  const last = randomParts('fr', () => 0.999999999);
  assert.deepEqual([last.adjective, last.number, genderOf('fr', last.animal)], [23, 89, 'f'], 'the end of the range is the last piece, not an index past it');
  assert.deepEqual(randomParts('fr', () => 1), last, 'even a generator that gave 1');
  assert.deepEqual(randomParts('fr', () => 0), { animal: 0, adjective: 0, number: 0 }, 'and the start is the first');
});

test('a name that is kept: one line of text, not longer than the limit', () => {
  assert.equal(cleanName('Léa'), 'Léa');
  assert.equal(cleanName('a\nb\t\rc'), 'a b c');
  assert.equal(cleanName('x'.repeat(100)).length, NAME_MAX);
  assert.equal(cleanName(null), '');
  assert.equal(cleanName(undefined), '');
  assert.equal(cleanName(42), '42');
});

test('the date and the time as one short line, in the language', () => {
  const d = new Date(Date.UTC(2026, 9, 29, 11, 42));
  const fr = formatWhen(d, 'fr', 'UTC'), en = formatWhen(d, 'en', 'UTC'), de = formatWhen(d, 'de', 'UTC'), it = formatWhen(d, 'it', 'UTC');
  for (const line of [fr, en, de, it]) assert.ok(line.includes('2026') && /11[:.]42/.test(line) && !/AM|PM/.test(line), line);
  assert.ok(/oct/i.test(fr) && /Oct/.test(en) && /Okt/.test(de) && /ott/i.test(it), [fr, en, de, it].join(' | '));
  assert.ok(formatWhen(new Date(Date.UTC(2026, 9, 29, 0, 5)), 'en', 'UTC').includes('00:05'), 'a 24 hour clock: midnight is 00, not 12 AM');
  assert.ok(formatWhen(d, 'not a language !', 'UTC').includes('2026'), 'a language the browser does not know still gives a date');
});

test('the genders of the names are balanced, whatever the genders of the animals: each gender of the language equally often', () => {
  const animals = Array.from({ length: 42 }, (_, i) => i);
  const share = (lang) => {
    const c = {};
    for (const a of animals) c[genderOf(lang, a)] = (c[genderOf(lang, a)] || 0) + 1;
    return c;
  };
  assert.ok(share('fr').m >= 3 * share('fr').f, 'the palette itself is not balanced in French (it is why the draw is gender first)');
  let state = 987654321;
  const rand = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
  const draws = 30000;
  const expected = { fr: ['m', 'f'], it: ['m', 'f'], de: ['m', 'f', 'n'], en: ['-'] };
  for (const [lang, genders] of Object.entries(expected)) {
    const seen = {};
    for (let i = 0; i < draws; i++) { const g = genderOf(lang, randomParts(lang, rand).animal); seen[g] = (seen[g] || 0) + 1; }
    assert.deepEqual(Object.keys(seen).sort(), [...genders].sort(), `${lang}: the genders that come up`);
    for (const g of genders) assert.ok(Math.abs(seen[g] / draws - 1 / genders.length) < 0.015, `${lang}: ${g} is ${(100 * seen[g] / draws).toFixed(1)} %, expected ${(100 / genders.length).toFixed(1)} %`);
  }
  assert.equal(genderOf('xx', 0), 'm', 'an unknown language is French');
});
