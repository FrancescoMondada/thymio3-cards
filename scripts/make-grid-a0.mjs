// Prints docs/grille-a0.svg to docs/grille-a0.pdf (A0), npm run docs:grid. The SVG is the drawing to edit: this command never
// changes it (it only makes it first if it is not there), so the PDF can be made again after each edit. The base drawing,
// without any edit, is written again with  node scripts/make-grid-a0.mjs --new  (it replaces the SVG!). Another SVG can be
// printed by giving its path. Chrome has to be installed (or its path given in CHROME).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PAGE, buildGridSvg } from './grid-a0.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fresh = args.includes('--new');
const given = args.find((a) => !a.startsWith('--'));
const svgFile = given ? path.resolve(given) : path.join(root, 'docs', 'grille-a0.svg');
const CANDIDATES = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const chrome = CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) { console.error('Chrome not found: install it or set CHROME=/path/to/chrome'); process.exit(1); }

const wrote = fresh || !fs.existsSync(svgFile);
if (wrote) fs.writeFileSync(svgFile, buildGridSvg());
const svg = fs.readFileSync(svgFile, 'utf8').replace(/^<\?xml[^>]*>\s*/, '');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thymio-grid-'));
const html = path.join(dir, 'grille.html');
fs.writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><title>Grille A0</title><style>@page { size: ${PAGE.width}mm ${PAGE.height}mm; margin: 0; } html, body { margin: 0; padding: 0; } svg { display: block; width: ${PAGE.width}mm; height: ${PAGE.height}mm; }</style></head><body>${svg}</body></html>`);
const out = svgFile.replace(/\.svg$/, '.pdf');
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--user-data-dir=${path.join(dir, 'profile')}`, `--print-to-pdf=${out}`, pathToFileURL(html).href], { stdio: 'ignore', timeout: 180000 });
fs.rmSync(dir, { recursive: true, force: true });
console.log(`${wrote ? `wrote ${path.relative(root, svgFile)}, then ` : `printed ${path.relative(root, svgFile)} to `}${path.relative(root, out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
