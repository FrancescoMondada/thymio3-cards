// A grid of 15 cm squares for the floor, on an A0 sheet (841 x 1189 mm), as an SVG that is made to be edited and a
// PDF printed from it (npm run docs:grid, scripts/make-grid-a0.mjs). One user unit is one millimetre.
//
// Layers, from the bottom: the colour of each cell (a white square a click selects; give it a fill to colour the whole
// cell), the places and details (empty: draw there, in a corner of a cell, the cell keeps its colour), the grid, the
// dot in the middle of each cell, the lettering of the border. A palette of the eight colours of the robot's colour
// sensor sits off the page, where it is not printed.
import { COLOR_CODES } from '../src/spec.js';
import { GROUND_CSS } from '../src/colors.js';

export const PAGE = { width: 841, height: 1189 };      // A0, portrait: columns A to E, rows 1 to 7
export const CELL = 150;                               // mm
export const DOT = 5;                                  // mm, the diameter of the dot in the middle of a cell
export const MIN_MARGIN = 40;                          // mm kept round the grid for the lettering
const LINE = 0.6;                                      // mm, the lines of the grid
const FONT = 38;                                       // mm, the letters and numbers of the border
const SWATCH = 30;

const colourNames = { r: 'rouge', y: 'jaune', g: 'vert', c: 'cyan', b: 'bleu', p: 'violet', w: 'blanc', k: 'noir' };
const f = (v) => +v.toFixed(3);
const letter = (i) => String.fromCharCode(65 + i);

export function gridLayout({ page = PAGE, cell = CELL, minMargin = MIN_MARGIN } = {}) {
  const cols = Math.floor((page.width - 2 * minMargin) / cell);
  const rows = Math.floor((page.height - 2 * minMargin) / cell);
  return { cols, rows, left: (page.width - cols * cell) / 2, top: (page.height - rows * cell) / 2, cell, page };
}

const layer = (id, label, body, extra = '') => `<g id="${id}" inkscape:groupmode="layer" inkscape:label="${label}"${extra}>${body}</g>`;

export function buildGridSvg(options = {}) {
  const { cols, rows, left, top, cell, page } = gridLayout(options);
  const cx = (c) => left + (c + 0.5) * cell, cy = (r) => top + (r + 0.5) * cell;
  const cells = [], dots = [], lines = [], labels = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const name = `${letter(c)}${r + 1}`;
      cells.push(`<rect id="cell-${name}" x="${f(left + c * cell)}" y="${f(top + r * cell)}" width="${cell}" height="${cell}" fill="#ffffff"/>`);
      dots.push(`<circle id="dot-${name}" cx="${f(cx(c))}" cy="${f(cy(r))}" r="${DOT / 2}" fill="#000000"/>`);
    }
  }
  for (let c = 0; c <= cols; c++) lines.push(`<line x1="${f(left + c * cell)}" y1="${f(top)}" x2="${f(left + c * cell)}" y2="${f(top + rows * cell)}"/>`);
  for (let r = 0; r <= rows; r++) lines.push(`<line x1="${f(left)}" y1="${f(top + r * cell)}" x2="${f(left + cols * cell)}" y2="${f(top + r * cell)}"/>`);
  const text = (x, y, s, id) => `<text id="${id}" x="${f(x)}" y="${f(y + FONT * 0.36)}">${s}</text>`;   // centred on (x, y): the capitals and digits are 0.72 em tall
  const gap = (left - 0) / 2, gapY = top / 2;
  for (let c = 0; c < cols; c++) {
    labels.push(text(cx(c), gapY, letter(c), `col-${letter(c)}-haut`), text(cx(c), page.height - gapY, letter(c), `col-${letter(c)}-bas`));
  }
  for (let r = 0; r < rows; r++) {
    labels.push(text(gap, cy(r), r + 1, `ligne-${r + 1}-gauche`), text(page.width - gap, cy(r), r + 1, `ligne-${r + 1}-droite`));
  }
  const swatches = COLOR_CODES.map((c, i) => `<rect id="palette-${colourNames[c]}" x="${page.width + 30}" y="${f(top + i * (SWATCH + 10))}" width="${SWATCH}" height="${SWATCH}" fill="${GROUND_CSS[c]}" stroke="#000000" stroke-width="0.5"/>`
    + `<text x="${page.width + 30 + SWATCH + 8}" y="${f(top + i * (SWATCH + 10) + SWATCH / 2 + 4)}" font-size="12" fill="#000000" style="font-family:Helvetica,Arial,sans-serif">${colourNames[c]}</text>`).join('');
  const note = `<text x="${page.width + 30}" y="${f(top - 14)}" font-size="12" fill="#000000" style="font-family:Helvetica,Arial,sans-serif">Palette des 8 couleurs du capteur (hors page, non imprimée)</text>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${page.width}mm" height="${page.height}mm" viewBox="0 0 ${page.width} ${page.height}">
<title>Grille de cases de 15 cm, A0</title>
<desc>${cols} colonnes (A à ${letter(cols - 1)}) et ${rows} lignes (1 à ${rows}) de cases de ${cell / 10} cm, un point de ${DOT} mm au centre de chaque case. 1 unité = 1 mm.</desc>
${layer('couleurs', '1 · Couleurs des cases (donner une couleur de remplissage à un carré colorie toute la case)', cells.join('\n'))}
${layer('lieux', '2 · Lieux et détails (dessiner ici, dans un coin des cases)', '')}
${layer('grille', '3 · Grille', lines.join('\n'), ` fill="none" stroke="#000000" stroke-width="${LINE}" stroke-linecap="square"`)}
${layer('points', '4 · Points au centre des cases', dots.join('\n'))}
${layer('reperes', '5 · Lettres et numéros du bord', labels.join('\n'), ` fill="#000000" text-anchor="middle" font-size="${FONT}" font-weight="700" style="font-family:Helvetica,Arial,sans-serif"`)}
${layer('palette', '6 · Palette (hors page, non imprimée)', note + swatches)}
</svg>
`;
}
