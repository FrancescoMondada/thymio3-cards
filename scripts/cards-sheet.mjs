// The cards to print, cut and use in class: A4 pages of 45 mm cards (a page of instructions, then the cards), drawn with
// the pictograms of the interface, so no word on a card. `buildSheet(renderIcon, renderFlag, words)` gives the HTML that
// Chrome prints to docs/cartes-thymio.pdf (npm run docs:cards, scripts/make-cards-pdf.mjs).
import { COLOR_CODES, REPEAT_CODES, WHILE_CODES } from '../src/spec.js';
import { colours } from './examples-svg.mjs';

export const CARD_MM = 45;                 // a cell of the grid; the card in it is 39 mm, with 3 mm of white around to cut in
export const COLUMNS = 4;
export const ROWS = 6;

// What is on each page, and how many of each card: [card, copies]. 'start' and 'finish' are not cards of the language.
export const SHEETS = [
  { title: 'Cartes de base', cards: [['F', 8], ['B', 4], ['L', 4], ['R', 4], ['start', 2], ['finish', 2]] },
  { title: 'Groupes et répétitions', cards: [['(', 6], [')', 6], ...REPEAT_CODES.map((c) => [c, 1]), ['2', 1], ['3', 1], ['4', 1], ['5', 1]] },
  { title: 'Couleurs : « si » et « tant que »', cards: [...COLOR_CODES.map((c) => [c, 1]), ...WHILE_CODES.map((c) => [c, 1])] },
];

// The last page: one card of each sort, as large as a page holds them, to show in front of the class (not to cut)
export const SHOWCASE = ['start', 'finish', 'F', 'B', 'L', 'R', '(', ')', '2', 'E', 'r'];
export const SHOW_MM = 62;
const SHOW_GAP_MM = 4;

const FINISH = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 58 V7" stroke="#2a2b44" stroke-width="5" stroke-linecap="round" fill="none"/>'
  + '<rect x="20" y="8" width="36" height="27" fill="#fff"/>'
  + [0, 1, 2, 3, 4, 5].flatMap((i) => [0, 1, 2].filter((j) => (i + j) % 2 === 0).map((j) => `<rect x="${20 + i * 6}" y="${8 + j * 9}" width="6" height="9" fill="#2a2b44"/>`)).join('')
  + '<rect x="20" y="8" width="36" height="27" fill="none" stroke="#2a2b44" stroke-width="2.5"/></svg>';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// one card: the pictogram of the interface on its colour
function card(code, renderIcon, renderFlag) {
  if (code === 'start') return `<div class="card paper" style="color:#e11d48">${renderFlag()}</div>`;
  if (code === 'finish') return `<div class="card paper finish">${FINISH}</div>`;
  const [c, cd] = colours(code);
  return `<div class="card" style="background:${c};border-color:${cd}">${renderIcon(code)}</div>`;
}

const css = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #2a2b44; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
.grid { position: absolute; left: ${(210 - COLUMNS * CARD_MM) / 2}mm; top: 14mm; width: ${COLUMNS * CARD_MM}mm; display: grid; grid-template-columns: repeat(${COLUMNS}, ${CARD_MM}mm); grid-auto-rows: ${CARD_MM}mm; }
.cell { width: ${CARD_MM}mm; height: ${CARD_MM}mm; padding: 3mm; border-right: .2mm dotted #8d89a6; border-bottom: .2mm dotted #8d89a6; }
.cell:nth-child(${COLUMNS}n + 1) { border-left: .2mm dotted #8d89a6; }
.cell:nth-child(-n + ${COLUMNS}) { border-top: .2mm dotted #8d89a6; }
.cell.none { border: 0 !important; }
.card { width: 100%; height: 100%; border-radius: 6mm; border: .5mm solid; display: grid; place-items: center; color: #fff; }
.card svg { width: 25mm; height: 25mm; }
.card.paper { background: #fffaf0; border: .6mm dashed #e5c98f; }
.card.finish { border-color: #ff8fb4; }
.show { position: absolute; left: ${(210 - 3 * SHOW_MM - 2 * SHOW_GAP_MM) / 2}mm; top: 16mm; display: grid; grid-template-columns: repeat(3, ${SHOW_MM}mm); grid-auto-rows: ${SHOW_MM}mm; gap: ${SHOW_GAP_MM}mm; }
.show .card { border-radius: 9mm; border-width: .8mm; }
.show .card.paper { border-width: 1mm; }
.show .card svg { width: 40mm; height: 40mm; }
.foot { position: absolute; left: 15mm; right: 15mm; bottom: 6mm; font-size: 8.5pt; color: #7d7a95; display: flex; justify-content: space-between; }
.intro { padding: 12mm 18mm 0; }
.intro h1 { font-size: 24pt; margin: 0 0 1mm; }
.intro .sub { font-size: 11.5pt; color: #5b5876; margin: 0 0 4mm; }
.intro h2 { font-size: 12.5pt; margin: 4.5mm 0 1.5mm; }
.intro p, .intro li { font-size: 10pt; line-height: 1.4; margin: 0 0 1mm; }
.intro ol, .intro ul { margin: 0; padding-left: 5mm; }
.legend { width: 100%; border-collapse: collapse; margin-top: 1mm; }
.legend td { padding: .9mm 0; border-bottom: .2mm solid #e5e0f0; vertical-align: middle; font-size: 10pt; line-height: 1.3; }
.legend td.pic { width: 27mm; white-space: nowrap; }
.legend .mini { display: inline-block; width: 10mm; height: 10mm; margin-right: 1.5mm; vertical-align: middle; }
.legend .mini .card { border-radius: 2.2mm; border-width: .3mm; }
.legend .mini .card svg { width: 6.5mm; height: 6.5mm; }
.legend b { font-weight: 700; }
.url { color: #2a68c9; }
`;

// words: { card: { F, B, L, R, open, close, repeat, if, while }, colors: { r, y, ... } } (the words of the interface, in French)
export function buildSheet(renderIcon, renderFlag, words, { appUrl = 'https://francescomondada.github.io/thymio3-cards/' } = {}) {
  const mini = (code) => `<span class="mini">${card(code, renderIcon, renderFlag)}</span>`;
  const colourNames = COLOR_CODES.map((c) => words.colors[c]).join(', ');
  const total = SHEETS.map((s) => s.cards.reduce((n, [, k]) => n + k, 0));
  const intro = `<section class="page"><div class="intro">
<h1>Les cartes Thymio</h1>
<p class="sub">À imprimer, découper et utiliser en classe : d'abord sans écran, puis avec le robot.</p>
<h2>Imprimer et découper</h2>
<ol>
<li>Imprimez les pages 2 à ${SHEETS.length + 1} en <b>A4, à 100 %</b> (« taille réelle », sans « ajuster à la page »), recto seul. Les cases mesurent ${CARD_MM} mm. La page ${SHEETS.length + 2} ne se découpe pas : ce sont les cartes en grand, à montrer devant la classe.</li>
<li>Découpez le long des lignes pointillées : chaque carte a une marge blanche de 3 mm, inutile de couper juste.</li>
<li>Pour qu'elles durent : plastifiez la feuille avant de découper, ou collez-la sur du carton.</li>
</ol>
<h2>Programmer avec les cartes</h2>
<ul>
<li>Posez la carte <b>Départ</b>, puis les cartes les unes après les autres, de gauche à droite : le robot les fait dans cet ordre. La carte <b>Arrivée</b> se pose sur le tapis, là où le robot doit aller.</li>
<li>Une carte « avance » ou « recule » fait un pas de 15 cm ; une carte « tourne » fait un quart de tour (90°) sur place.</li>
<li>Un enfant peut jouer le robot sur un tapis de carreaux de 15 cm. Pour le vrai robot, ou pour le robot virtuel, on recopie le programme dans l'application : <span class="url">${esc(appUrl)}</span></li>
</ul>
<h2>Les cartes</h2>
<table class="legend">
<tr><td class="pic">${mini('start')}${mini('finish')}</td><td><b>Départ</b> et <b>Arrivée</b> : où le programme commence, où le robot doit aller.</td></tr>
<tr><td class="pic">${mini('F')}${mini('B')}</td><td><b>${esc(words.card.F)}</b>, <b>${esc(words.card.B)}</b> : un pas de 15 cm.</td></tr>
<tr><td class="pic">${mini('L')}${mini('R')}</td><td><b>${esc(words.card.L)}</b>, <b>${esc(words.card.R)}</b> : un quart de tour.</td></tr>
<tr><td class="pic">${mini('(')}${mini(')')}</td><td><b>${esc(words.card.open)}</b> et <b>${esc(words.card.close)}</b> : les cartes entre les deux comptent pour une seule.</td></tr>
<tr><td class="pic">${mini('2')}${mini('9')}</td><td><b>Répéter</b> : fait la carte suivante, ou le groupe suivant, 2 à 9 fois.</td></tr>
<tr><td class="pic">${mini('E')}${mini('G')}</td><td><b>Répéter avec une couleur</b> (« tant que ») : refait la carte suivante, ou le groupe, tant que le sol sous le robot est de cette couleur.</td></tr>
<tr><td class="pic">${mini('r')}${mini('g')}</td><td><b>Si le sol est…</b> : le robot regarde la couleur du sol ; si c'est celle de la carte, il fait la carte suivante (ou le groupe), sinon il la saute.</td></tr>
</table>
<p style="margin-top:2mm">Les huit couleurs sont celles du capteur du robot : ${esc(colourNames)}. Pour un vrai robot, posez des carrés de papier de couleur de 15 cm sur le sol.</p>
<h2>Les feuilles</h2>
<ul>
${SHEETS.map((s, i) => `<li><b>Page ${i + 2}. ${esc(s.title)}</b> : ${total[i]} cartes${i === 0 ? ' (le mode normal : avance, recule, gauche, droite)' : i === 1 ? ' (le mode avancé)' : ''}.</li>`).join('\n')}
<li><b>Page ${SHEETS.length + 2}. Les cartes en grand</b> : une carte de chaque sorte (${SHOWCASE.length}), à montrer à la classe ou à projeter.</li>
</ul>
</div>
<div class="foot"><span>Thymio · Cartes</span><span>1 / ${SHEETS.length + 2}</span></div></section>`;
  const pages = SHEETS.map((sheet, p) => {
    const codes = sheet.cards.flatMap(([code, n]) => Array(n).fill(code));
    const cells = Array.from({ length: COLUMNS * ROWS }, (_, i) => (codes[i] ? `<div class="cell">${card(codes[i], renderIcon, renderFlag)}</div>` : '<div class="cell none"></div>')).join('');
    return `<section class="page"><div class="grid">${cells}</div><div class="foot"><span>Thymio · Cartes — ${esc(sheet.title)}</span><span>${p + 2} / ${SHEETS.length + 2}</span></div></section>`;
  });
  const show = `<section class="page"><div class="show">${SHOWCASE.map((code) => card(code, renderIcon, renderFlag)).join('')}</div><div class="foot"><span>Thymio · Cartes — Les cartes en grand</span><span>${SHEETS.length + 2} / ${SHEETS.length + 2}</span></div></section>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Les cartes Thymio</title><style>${css}</style></head><body>${intro}${pages.join('')}${show}</body></html>`;
}
