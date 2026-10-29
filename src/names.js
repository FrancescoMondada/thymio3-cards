// The name shown beside the QR code of the page, with the date and the time: a student shows the code, the teacher
// photographs it and files the photo, so the picture has to say whose it is. Every tablet starts with a name drawn
// at random, "Blue Fox 42", from a palette so large (about 90 000 names per language) that two tablets of a class
// almost never share one; the adult can type a first name instead.
//
// An animal and an adjective that agree with it, as the language wants (the fox is red, the giraffe is red-e), and
// a number of two digits. An animal is `word gender` (m, f, n), an adjective its forms.
//
// The genders of the animals are not balanced (French: 32 masculine, 10 feminine), and a child who is given "Petit renard"
// three times out of four would notice. So a name is drawn gender first, each gender of the language equally likely
// (masculine and feminine in French and Italian, with the neuter in German), then an animal of that gender.

export const NAME_MAX = 32;                 // characters of a name, typed or drawn (the longest drawn is 29)

const ANIMALS = [
  { en: 'fox', fr: 'renard m', de: 'Fuchs m', it: 'volpe f' },
  { en: 'giraffe', fr: 'girafe f', de: 'Giraffe f', it: 'giraffa f' },
  { en: 'lion', fr: 'lion m', de: 'Löwe m', it: 'leone m' },
  { en: 'tiger', fr: 'tigre m', de: 'Tiger m', it: 'tigre f' },
  { en: 'panda', fr: 'panda m', de: 'Panda m', it: 'panda m' },
  { en: 'koala', fr: 'koala m', de: 'Koala m', it: 'koala m' },
  { en: 'penguin', fr: 'pingouin m', de: 'Pinguin m', it: 'pinguino m' },
  { en: 'dolphin', fr: 'dauphin m', de: 'Delfin m', it: 'delfino m' },
  { en: 'whale', fr: 'baleine f', de: 'Wal m', it: 'balena f' },
  { en: 'owl', fr: 'hibou m', de: 'Eule f', it: 'gufo m' },
  { en: 'rabbit', fr: 'lapin m', de: 'Kaninchen n', it: 'coniglio m' },
  { en: 'turtle', fr: 'tortue f', de: 'Schildkröte f', it: 'tartaruga f' },
  { en: 'snail', fr: 'escargot m', de: 'Schnecke f', it: 'lumaca f' },
  { en: 'butterfly', fr: 'papillon m', de: 'Schmetterling m', it: 'farfalla f' },
  { en: 'bee', fr: 'abeille f', de: 'Biene f', it: 'ape f' },
  { en: 'ladybird', fr: 'coccinelle f', de: 'Marienkäfer m', it: 'coccinella f' },
  { en: 'frog', fr: 'grenouille f', de: 'Frosch m', it: 'rana f' },
  { en: 'crocodile', fr: 'crocodile m', de: 'Krokodil n', it: 'coccodrillo m' },
  { en: 'elephant', fr: 'éléphant m', de: 'Elefant m', it: 'elefante m' },
  { en: 'monkey', fr: 'singe m', de: 'Affe m', it: 'scimmia f' },
  { en: 'zebra', fr: 'zèbre m', de: 'Zebra n', it: 'zebra f' },
  { en: 'kangaroo', fr: 'kangourou m', de: 'Känguru n', it: 'canguro m' },
  { en: 'hedgehog', fr: 'hérisson m', de: 'Igel m', it: 'riccio m' },
  { en: 'squirrel', fr: 'écureuil m', de: 'Eichhörnchen n', it: 'scoiattolo m' },
  { en: 'wolf', fr: 'loup m', de: 'Wolf m', it: 'lupo m' },
  { en: 'bear', fr: 'ours m', de: 'Bär m', it: 'orso m' },
  { en: 'cat', fr: 'chat m', de: 'Katze f', it: 'gatto m' },
  { en: 'dog', fr: 'chien m', de: 'Hund m', it: 'cane m' },
  { en: 'horse', fr: 'cheval m', de: 'Pferd n', it: 'cavallo m' },
  { en: 'sheep', fr: 'mouton m', de: 'Schaf n', it: 'pecora f' },
  { en: 'duck', fr: 'canard m', de: 'Ente f', it: 'anatra f' },
  { en: 'chick', fr: 'poussin m', de: 'Küken n', it: 'pulcino m' },
  { en: 'parrot', fr: 'perroquet m', de: 'Papagei m', it: 'pappagallo m' },
  { en: 'shark', fr: 'requin m', de: 'Hai m', it: 'squalo m' },
  { en: 'octopus', fr: 'pieuvre f', de: 'Oktopus m', it: 'polpo m' },
  { en: 'camel', fr: 'chameau m', de: 'Kamel n', it: 'cammello m' },
  { en: 'sloth', fr: 'paresseux m', de: 'Faultier n', it: 'bradipo m' },
  { en: 'llama', fr: 'lama m', de: 'Lama n', it: 'lama m' },
  { en: 'swan', fr: 'cygne m', de: 'Schwan m', it: 'cigno m' },
  { en: 'mouse', fr: 'souris f', de: 'Maus f', it: 'topo m' },
  { en: 'dragonfly', fr: 'libellule f', de: 'Libelle f', it: 'libellula f' },
  { en: 'ant', fr: 'fourmi f', de: 'Ameise f', it: 'formica f' },
];

// fr: [masculine, feminine], de: the stem (er, e, es follow), it: [masculine, feminine]; `pre`: the languages in which
// it stands before the noun ("petit renard", "piccola volpe"), the others put it after
const ADJECTIVES = [
  { en: 'red', fr: ['rouge', 'rouge'], de: 'rot', it: ['rosso', 'rossa'] },
  { en: 'blue', fr: ['bleu', 'bleue'], de: 'blau', it: ['blu', 'blu'] },
  { en: 'green', fr: ['vert', 'verte'], de: 'grün', it: ['verde', 'verde'] },
  { en: 'yellow', fr: ['jaune', 'jaune'], de: 'gelb', it: ['giallo', 'gialla'] },
  { en: 'black', fr: ['noir', 'noire'], de: 'schwarz', it: ['nero', 'nera'] },
  { en: 'white', fr: ['blanc', 'blanche'], de: 'weiß', it: ['bianco', 'bianca'] },
  { en: 'grey', fr: ['gris', 'grise'], de: 'grau', it: ['grigio', 'grigia'] },
  { en: 'brown', fr: ['brun', 'brune'], de: 'braun', it: ['marrone', 'marrone'] },
  { en: 'golden', fr: ['doré', 'dorée'], de: 'golden', it: ['dorato', 'dorata'] },
  { en: 'small', fr: ['petit', 'petite'], de: 'klein', it: ['piccolo', 'piccola'], pre: ['fr', 'it'] },
  { en: 'big', fr: ['grand', 'grande'], de: 'groß', it: ['grande', 'grande'], pre: ['fr', 'it'] },
  { en: 'fast', fr: ['rapide', 'rapide'], de: 'schnell', it: ['veloce', 'veloce'] },
  { en: 'brave', fr: ['courageux', 'courageuse'], de: 'mutig', it: ['coraggioso', 'coraggiosa'] },
  { en: 'clever', fr: ['malin', 'maligne'], de: 'schlau', it: ['furbo', 'furba'] },
  { en: 'happy', fr: ['joyeux', 'joyeuse'], de: 'fröhlich', it: ['allegro', 'allegra'] },
  { en: 'gentle', fr: ['doux', 'douce'], de: 'sanft', it: ['dolce', 'dolce'] },
  { en: 'curious', fr: ['curieux', 'curieuse'], de: 'neugierig', it: ['curioso', 'curiosa'] },
  { en: 'strong', fr: ['fort', 'forte'], de: 'stark', it: ['forte', 'forte'] },
  { en: 'funny', fr: ['drôle', 'drôle'], de: 'lustig', it: ['buffo', 'buffa'] },
  { en: 'kind', fr: ['gentil', 'gentille'], de: 'freundlich', it: ['gentile', 'gentile'], pre: ['fr'] },
  { en: 'wild', fr: ['sauvage', 'sauvage'], de: 'wild', it: ['selvaggio', 'selvaggia'] },
  { en: 'sleepy', fr: ['endormi', 'endormie'], de: 'schläfrig', it: ['assonnato', 'assonnata'] },
  { en: 'shiny', fr: ['brillant', 'brillante'], de: 'glänzend', it: ['luminoso', 'luminosa'] },
  { en: 'calm', fr: ['calme', 'calme'], de: 'ruhig', it: ['calmo', 'calma'] },
];

const NUMBERS = 90;                                   // 10 to 99
export const NAME_COUNT = ANIMALS.length * ADJECTIVES.length * NUMBERS;     // names per language
export const NAME_LANGS = ['fr', 'en', 'de', 'it'];

const upFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const GERMAN_ENDING = { m: 'er', f: 'e', n: 'es' };

// The name for an animal, an adjective and a number (indexes: the pieces of the palette), in a language
export function composeName(lang, animal, adjective, number) {
  const a = ANIMALS[animal], j = ADJECTIVES[adjective];
  const n = 10 + number;
  if (lang === 'en') return `${upFirst(j.en)} ${upFirst(a.en)} ${n}`;
  if (lang === 'de') {
    const [noun, g] = a.de.split(' ');
    return `${upFirst(j.de)}${GERMAN_ENDING[g]} ${noun} ${n}`;
  }
  const code = lang === 'it' ? 'it' : 'fr';           // an unknown language is French
  const [noun, g] = a[code].split(' ');
  const adj = j[code][g === 'f' ? 1 : 0];
  const before = (j.pre || []).includes(code);
  return upFirst(before ? `${adj} ${noun}` : `${noun} ${adj}`) + ` ${n}`;
}

// The grammatical gender of an animal in a language: m, f or n; English has none
export const genderOf = (lang, animal) => (lang === 'en' ? '-' : ANIMALS[animal][lang === 'de' || lang === 'it' ? lang : 'fr'].split(' ')[1]);

// The animals of each gender of a language: [[indexes of the masculine], [of the feminine], ...], the genders that exist
const GROUPS = {};
function groupsOf(lang) {
  const key = NAME_LANGS.includes(lang) ? lang : 'fr';
  if (!GROUPS[key]) {
    const by = {};
    ANIMALS.forEach((_, i) => { (by[genderOf(key, i)] ||= []).push(i); });
    GROUPS[key] = ['m', 'f', 'n', '-'].filter((g) => by[g]).map((g) => by[g]);
  }
  return GROUPS[key];
}

// The pieces of a name drawn at random (`rand`: a function giving a number from 0 up to 1, exclusive, as Math.random does)
export function randomParts(lang, rand = Math.random) {
  const pick = (n) => Math.min(n - 1, Math.floor(rand() * n));
  const groups = groupsOf(lang);
  const group = groups[pick(groups.length)];
  return { animal: group[pick(group.length)], adjective: pick(ADJECTIVES.length), number: pick(NUMBERS) };
}

// A name drawn at random
export function randomName(lang, rand = Math.random) {
  const { animal, adjective, number } = randomParts(lang, rand);
  return composeName(lang, animal, adjective, number);
}

// A name as it is kept: text, no line break, not longer than the limit
export const cleanName = (s) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, NAME_MAX);

// The date and the time as one short line in a language: "29 oct. 2026, 11:42"
export function formatWhen(date, lang, timeZone) {
  try {
    return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(timeZone ? { timeZone } : {}) }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
}
