// Writes the pictures of the README's examples to docs/examples (npm run docs:examples).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { EXAMPLES } from './examples.mjs';
import { renderExample } from './examples-svg.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
try {
  const { ArrowIcon } = await server.ssrLoadModule('/src/icons.jsx');
  const renderIcon = (code) => renderToStaticMarkup(React.createElement(ArrowIcon, { code }));
  const out = path.join(root, 'docs', 'examples');
  fs.mkdirSync(out, { recursive: true });
  for (const ex of EXAMPLES) {
    const { name, svg } = renderExample(ex, renderIcon);
    fs.writeFileSync(path.join(out, name), svg);
  }
  console.log(`wrote ${EXAMPLES.length} pictures to docs/examples`);
} finally {
  await server.close();
}
