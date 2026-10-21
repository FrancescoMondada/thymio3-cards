// Writes docs/cartes-thymio.pdf, the cards to print, cut and use in class (npm run docs:cards). The pictograms are
// those of the interface (rendered here with Vite), the page is printed to PDF by Chrome, which has to be installed
// (or its path given in CHROME).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { buildSheet } from './cards-sheet.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATES = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const chrome = CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) { console.error('Chrome not found: install it or set CHROME=/path/to/chrome'); process.exit(1); }

const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
try {
  const { ArrowIcon, FlagIcon } = await server.ssrLoadModule('/src/icons.jsx');
  const { I18N } = await server.ssrLoadModule('/src/i18n.js');
  const html = buildSheet((code) => renderToStaticMarkup(React.createElement(ArrowIcon, { code })), () => renderToStaticMarkup(React.createElement(FlagIcon)), I18N.fr);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thymio-cards-'));
  const file = path.join(dir, 'cartes.html');
  fs.writeFileSync(file, html);
  const out = path.join(root, 'docs', 'cartes-thymio.pdf');
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--user-data-dir=${path.join(dir, 'profile')}`, `--print-to-pdf=${out}`, pathToFileURL(file).href], { stdio: 'ignore', timeout: 120000 });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`wrote ${path.relative(root, out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
} finally {
  await server.close();
}
