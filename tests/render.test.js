// Renders the real components on the server side: catches what a build cannot (a prop that is not
// destructured, a missing string in one language) and checks the rule of the main screen: no text.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let server, load;
before(async () => {
  server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  load = (p) => server.ssrLoadModule(p);
});
after(async () => { await server.close(); });

const h = React.createElement;
const noop = () => {};
const textOf = (markup) => markup.replace(/<[^>]*>/g, '').trim();

test('the main screen has no text at all, in every language', async () => {
  const { default: App } = await load('/src/App.jsx');
  const { I18N } = await load('/src/i18n.js');
  for (const lang of Object.keys(I18N)) {
    globalThis.localStorage = { getItem: (k) => (k === 'cards.lang' ? lang : k === 'cards.program' ? 'FFLRBF' : null), setItem: noop };
    const markup = renderToStaticMarkup(h(App));
    assert.equal(textOf(markup), '', `text on the main screen (${lang}): ${textOf(markup)}`);
    assert.match(markup, /aria-label=/, 'labels are for screen readers only');
    assert.equal((markup.match(/class="slot/g) || []).length, 6, 'the six cards are there');
  }
  delete globalThis.localStorage;
});

test('advanced mode: the cards, the palette and the brush are pictograms, still no text, in every language', async () => {
  const { default: App } = await load('/src/App.jsx');
  const { I18N } = await load('/src/i18n.js');
  for (const lang of Object.keys(I18N)) {
    const store = { 'cards.lang': lang, 'cards.advanced': '1', 'cards.program': '4(FR)3Fk(B)E(F)', 'cards.floor': '{"0,2":"r","1,1":"g"}' };
    globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: noop };
    const markup = renderToStaticMarkup(h(App));
    assert.equal(textOf(markup), '', `text on the main screen (${lang}): ${textOf(markup)}`);
    assert.equal((markup.match(/class="slot/g) || []).length, 15, 'the fifteen cards are there');
    for (const kind of ['c-repeat', 'c-open', 'c-close', 'c-if', 'c-F', 'c-R', 'c-B']) assert.ok(markup.includes(kind), `a ${kind} card (${lang})`);
    assert.equal((markup.match(/class="pcard /g) || []).length, 8, `four steps and four advanced cards in the palette (${lang})`);
    assert.ok(markup.includes('class="brushbar"'), 'the brush');
    assert.equal((markup.match(/class="floor-tile"/g) || []).length, 2, 'the painted floor is drawn');
    const t = I18N[lang];
    assert.ok(markup.includes(`aria-label="${t.card.open}"`) && markup.includes(`aria-label="${t.floor.paint}"`), `with their names for screen readers (${lang})`);
    assert.ok(markup.includes(`aria-label="${t.card.while} — ${t.colors.r}"`), `the loop card with a colour is named for what it does (${lang})`);
  }
  // not in the basic mode: four cards in the palette, no brush, no floor
  globalThis.localStorage = { getItem: (k) => ({ 'cards.advanced': '0', 'cards.floor': '{"0,2":"r"}' })[k] ?? null, setItem: noop };
  const basic = renderToStaticMarkup(h(App));
  assert.equal((basic.match(/class="pcard /g) || []).length, 4);
  assert.ok(!basic.includes('brushbar') && !basic.includes('floor-tile'));
  delete globalThis.localStorage;
});

test('the settings: the three modes, and the examples that the cards of the mode allow', async () => {
  const { default: Panel } = await load('/src/components/Panel.jsx');
  const { I18N } = await load('/src/i18n.js');
  const { CARD_KINDS, NORMAL_KINDS } = await load('/src/modes.js');
  for (const [lang, t] of Object.entries(I18N)) {
    const base = {
      t, lang, onLang: noop, sound: true, onSound: noop, speed: 1, onSpeed: noop, live: false, bluetooth: true,
      conn: { status: 'disconnected', device: '', firmware: null, battery: 0 }, cal: null, program: '', lastError: '',
      log: [], onClearLog: noop, onTest: noop, testing: false, canTest: false, onExample: noop, onConnect: noop, onDisconnect: noop, onClose: noop,
      showPath: false, onTogglePath: noop, canReset: true, onResetRobot: noop, mode: 'normal', onMode: noop, kinds: NORMAL_KINDS, custom: NORMAL_KINDS, onToggleCard: noop,
    };
    const normal = renderToStaticMarkup(h(Panel, base));
    const advanced = renderToStaticMarkup(h(Panel, { ...base, mode: 'advanced', kinds: CARD_KINDS }));
    const custom = renderToStaticMarkup(h(Panel, { ...base, mode: 'custom', kinds: ['F', 'R', 'open', 'close', 'repeat'], custom: ['F', 'R', 'open', 'close', 'repeat'] }));
    for (const m of ['normal', 'advanced', 'custom']) assert.ok(normal.includes(`>${t.panel.modes[m]}</button>`), `the ${m} mode is a button (${lang})`);
    assert.ok(normal.includes(t.panel.mode) && normal.includes(t.panel.modeHints.normal), `the mode and what it does (${lang})`);
    assert.ok(advanced.includes(t.panel.modeHints.advanced) && custom.includes(t.panel.modeHints.custom));
    assert.ok(normal.indexOf(t.panel.quick) < normal.indexOf(t.panel.mode), `after the shortcuts (${lang})`);
    assert.match(normal, /aria-pressed="true"[^>]*>Normal?[^<]*<|aria-pressed="true"[^>]*>[^<]*<\/button>/, 'the mode in use is pressed');
    // the cards to give appear in the custom mode only
    assert.ok(!normal.includes('custom-cards') && !advanced.includes('custom-cards'));
    assert.equal((custom.match(/class="custom-card /g) || []).length, 9, `nine cards to give or take away (${lang})`);
    assert.equal((custom.match(/class="custom-card [^"]*\bon\b/g) || []).length, 5, 'five are given');
    assert.ok(custom.includes(`aria-label="${t.card.while}"`) && custom.includes(`aria-label="${t.card.if}"`), `named for what they do (${lang})`);
    assert.ok(custom.includes(t.panel.customCards));
    // the examples: those made of the cards of the mode
    assert.ok(!normal.includes(t.examples.loopSquare), `no advanced example in the normal mode (${lang})`);
    for (const id of ['loopSquare', 'zigzag', 'turnOnRed', 'backOnGreen', 'alongRed']) assert.ok(advanced.includes(t.examples[id]), `${id} (${lang})`);
    assert.equal((advanced.match(/class="mini"/g) || []).length, 11, `eleven examples (${lang})`);
    assert.equal((normal.match(/class="mini"/g) || []).length, 6);
    assert.ok(custom.includes(t.examples.loopSquare), `4(FR) is made of the cards given (${lang})`);
    assert.ok(!custom.includes(t.examples.zigzag), '3(FRFL) needs the turn to the left, which is not given');
    assert.ok(!custom.includes(t.examples.turnOnRed) && !custom.includes(t.examples.alongRed), 'the ones that need an "if" or a colour are not');
    assert.ok(custom.includes(t.examples.line) && custom.includes(t.examples.square), 'the ones of forward steps and right turns are');
    assert.ok(!custom.includes(t.examples.back), 'the one that goes backward is not (the card is not given)');
  }
  // the last card cannot be taken away
  const { CARD_KINDS: kinds } = await load('/src/modes.js');
  const { default: P } = await load('/src/components/Panel.jsx');
  const t = I18N.en;
  const one = renderToStaticMarkup(h(P, { t, lang: 'en', onLang: noop, sound: true, onSound: noop, speed: 1, onSpeed: noop, live: false, bluetooth: true, conn: { status: 'disconnected', device: '', firmware: null, battery: 0 }, cal: null, program: '', lastError: '', log: [], onClearLog: noop, onTest: noop, testing: false, canTest: false, onExample: noop, onConnect: noop, onDisconnect: noop, onClose: noop, showPath: false, onTogglePath: noop, canReset: true, onResetRobot: noop, mode: 'custom', onMode: noop, kinds: ['F'], custom: ['F'], onToggleCard: noop }));
  assert.equal((one.match(/class="custom-card [^"]*"[^>]*disabled=""/g) || []).length, 1, 'the only card given cannot be taken away');
  assert.equal(kinds.length, 9);
});

test('the settings page renders in every language, connected or not, with a journal', async () => {
  const { default: Panel } = await load('/src/components/Panel.jsx');
  const { I18N } = await load('/src/i18n.js');
  const log = [
    { at: 1000, kind: 'info', text: 'link: connected to THYMIO-1' },
    { at: 1400, kind: 'out', text: 'upload mode "FL" (play): 9000 bytes' },
    { at: 3900, kind: 'in', text: 'stdout "@@hello 1↵"' },
    { at: 4000, kind: 'err', text: 'no "hello" from the script after 10000 ms' },
  ];
  for (const [lang, t] of Object.entries(I18N)) {
    for (const live of [false, true]) {
      const markup = renderToStaticMarkup(h(Panel, {
        t, lang, onLang: noop, sound: true, onSound: noop, speed: 1, onSpeed: noop, live, bluetooth: true,
        conn: { status: live ? 'connected' : 'disconnected', device: 'THYMIO-1', firmware: { esp32_ver: '1.10.2' }, battery: 4.1 },
        cal: { fw: 9000000, bw: 9000000 }, program: 'FL', lastError: 'AttributeError: x',
        log, onClearLog: noop, onTest: noop, testing: false, canTest: live, onExample: noop, onConnect: noop, onDisconnect: noop, onClose: noop,
      }));
      assert.ok(markup.includes('<kbd>D</kbd>'), `the D key is documented (${lang})`);
      assert.ok(markup.includes(t.panel.log), `journal title (${lang})`);
      assert.ok(markup.includes('upload mode'), 'the journal is shown');
      assert.ok(markup.includes('+  0.40s'.trim()) || markup.includes('0.40s'), 'with times');
      assert.ok(markup.includes('AttributeError'), 'the last error is shown');
    }
  }
});

test('without Web Bluetooth the settings page says what to use, Bluefy on an iPhone or iPad, in every language', async () => {
  const { default: Panel } = await load('/src/components/Panel.jsx');
  const { I18N } = await load('/src/i18n.js');
  for (const [lang, t] of Object.entries(I18N)) {
    const base = {
      t, lang, onLang: noop, sound: true, onSound: noop, speed: 1, onSpeed: noop, live: false,
      conn: { status: 'disconnected', device: '', firmware: null, battery: 0 }, cal: null, program: '', lastError: '',
      log: [], onClearLog: noop, onTest: noop, testing: false, canTest: false, onExample: noop, onConnect: noop, onDisconnect: noop, onClose: noop,
    };
    const off = renderToStaticMarkup(h(Panel, { ...base, bluetooth: false }));
    const on = renderToStaticMarkup(h(Panel, { ...base, bluetooth: true }));
    assert.ok(/Bluefy/.test(t.panel.noBluetooth) && /iPhone/.test(t.panel.noBluetooth) && /iPad/.test(t.panel.noBluetooth) && /Chrome/.test(t.panel.noBluetooth), `the warning names Chrome, Bluefy, iPhone and iPad (${lang})`);
    assert.ok(off.includes('Bluefy'), `the warning is shown (${lang})`);
    assert.ok(off.includes('role="alert"') && off.includes(t.panel.noBluetoothTitle), `with a headline (${lang})`);
    assert.ok(off.includes('href="https://apps.apple.com/app/id1492822055"'), `and a link to Bluefy (${lang})`);
    assert.ok(off.indexOf('role="alert"') < off.indexOf(t.panel.language), `before everything else on the page (${lang})`);
    assert.ok(!on.includes('Bluefy'), `and only when the browser cannot connect (${lang})`);
  }
});

test('the keys D and R have buttons in the settings, after the sound, in every language', async () => {
  const { default: Panel } = await load('/src/components/Panel.jsx');
  const { I18N } = await load('/src/i18n.js');
  for (const [lang, t] of Object.entries(I18N)) {
    const base = {
      t, lang, onLang: noop, sound: true, onSound: noop, speed: 1, onSpeed: noop, live: false, bluetooth: true,
      conn: { status: 'disconnected', device: '', firmware: null, battery: 0 }, cal: null, program: '', lastError: '',
      log: [], onClearLog: noop, onTest: noop, testing: false, canTest: false, onExample: noop, onConnect: noop, onDisconnect: noop, onClose: noop,
      showPath: false, onTogglePath: noop, canReset: true, onResetRobot: noop,
    };
    const idle = renderToStaticMarkup(h(Panel, base));
    assert.ok(idle.includes(t.panel.quick) && idle.includes(t.panel.pathBtn) && idle.includes(t.panel.resetBtn), `labels (${lang})`);
    assert.ok(idle.indexOf(t.panel.sound) < idle.indexOf(t.panel.quick), `after the sound (${lang})`);
    assert.ok(idle.indexOf(t.panel.quick) < idle.indexOf(t.panel.examples), `and before the examples (${lang})`);
    assert.match(idle, /aria-pressed="false"/, `the path is hidden (${lang})`);
    assert.ok(!/class="tile-btn reset"[^>]*disabled/.test(idle), `reset is available when nothing runs (${lang})`);
    const shown = renderToStaticMarkup(h(Panel, { ...base, showPath: true }));
    assert.match(shown, /aria-pressed="true"/, `the path is shown (${lang})`);
    assert.match(shown, /class="tile-btn on"/, `and the button says so (${lang})`);
    const running = renderToStaticMarkup(h(Panel, { ...base, canReset: false }));
    assert.match(running, /class="tile-btn reset"[^>]*disabled/, `no reset while the robot plays (${lang})`);
  }
});

test('live update is not an option: nothing about it in the settings, in any language', async () => {
  const { default: Panel } = await load('/src/components/Panel.jsx');
  const { I18N } = await load('/src/i18n.js');
  for (const [lang, t] of Object.entries(I18N)) {
    assert.ok(!('liveUpdate' in t.panel) && !('liveHint' in t.panel), `no words for it (${lang})`);
    const markup = renderToStaticMarkup(h(Panel, {
      t, lang, onLang: noop, sound: true, onSound: noop, speed: 1, onSpeed: noop, live: false, bluetooth: true,
      conn: { status: 'disconnected', device: '', firmware: null, battery: 0 }, cal: null, program: '', lastError: '',
      log: [], onClearLog: noop, onTest: noop, testing: false, canTest: false, onExample: noop, onConnect: noop, onDisconnect: noop, onClose: noop,
      showPath: false, onTogglePath: noop, canReset: true, onResetRobot: noop,
    }));
    assert.ok(!markup.includes('live-row') && !/xp[eé]riment/i.test(markup), `and no row for it (${lang})`);
  }
});

test('the connect button shows its states: grey, connecting, in sync, on, standby, unavailable', async () => {
  const { default: TopBar } = await load('/src/components/TopBar.jsx');
  const { I18N } = await load('/src/i18n.js');
  const t = I18N.fr;
  const render = (conn, live, bluetooth, extra = {}) => renderToStaticMarkup(h(TopBar, { t, conn, live, bluetooth, busy: false, syncing: false, modeUp: false, failed: false, onConnect: noop, onPanel: noop, ...extra }));
  const off = render({ status: 'disconnected' }, false, true);
  const wait = render({ status: 'connecting' }, false, true);
  const starting = render({ status: 'connected', device: 'THYMIO-1', battery: 0 }, true, true);
  const failed = render({ status: 'connected', device: 'THYMIO-1', battery: 0 }, true, true, { failed: true });
  const on = render({ status: 'connected', device: 'THYMIO-1', battery: 4.0 }, true, true, { modeUp: true });
  const sync = render({ status: 'connected', device: 'THYMIO-1', battery: 4.0 }, true, true, { modeUp: true, syncing: true });
  const standby = render({ status: 'connected', device: 'THYMIO-1', battery: 4.0 }, true, true, { modeUp: false });
  const no = render({ status: 'disconnected' }, false, false);
  assert.match(off, /conn-icon off/); assert.match(wait, /conn-icon wait/); assert.match(on, /conn-icon on/);
  assert.match(sync, /conn-icon sync/); assert.match(standby, /conn-icon standby/); assert.match(no, /conn-icon no/);
  for (const m of [on, sync, standby]) { assert.ok(m.includes('class="tick"'), 'a tick when the robot is ready'); assert.ok(m.includes('class="bat"'), 'and its battery, with it'); assert.ok(m.includes('live'), 'and the green button'); }
  for (const m of [off, wait]) assert.ok(!m.includes('class="tick"'));
  // Reached over Bluetooth but not ready yet: still waiting (the waves move), with neither tick, battery nor green
  assert.match(starting, /conn-icon wait/);
  for (const m of [starting, failed]) { assert.ok(!m.includes('class="tick"'), 'no tick before the robot is ready'); assert.ok(!m.includes('class="bat"'), 'no battery either'); assert.ok(!/robot-btn [a-z]+ live/.test(m), 'and the button is not green'); }
  // a start that failed does not wait for ever: the waves stop
  assert.match(failed, /conn-icon standby/);
  assert.ok(starting.includes(t.robot.connecting) && !starting.includes(t.robot.connected), 'named as still connecting');
  // the tick and the battery always go together
  for (const m of [off, wait, starting, failed, on, sync, standby]) assert.equal(m.includes('class="tick"'), m.includes('class="bat"'), 'tick and battery come together');
  for (const m of [off, wait, starting, failed, on, sync, standby, no]) assert.equal(textOf(m), '');
});

test('the top left logo opens the settings, and there is no other settings button', async () => {
  const { default: TopBar } = await load('/src/components/TopBar.jsx');
  const { I18N } = await load('/src/i18n.js');
  for (const [lang, t] of Object.entries(I18N)) {
    let opened = 0;
    const tree = TopBar({ t, conn: { status: 'disconnected' }, live: false, bluetooth: true, busy: false, syncing: false, modeUp: false, onConnect: noop, onPanel: () => { opened += 1; } });
    const buttons = [];
    const walk = (el) => { if (!el || typeof el !== 'object') return; if (el.type === 'button') buttons.push(el); [].concat(el.props?.children ?? []).forEach(walk); };
    walk(tree);
    const logo = buttons.find((b) => b.props.className === 'logo');
    assert.ok(logo, `the logo is a button (${lang})`);
    assert.equal(logo.props['aria-label'], t.panel.title, `named for screen readers (${lang})`);
    logo.props.onClick();
    assert.equal(opened, 1, `and opens the settings (${lang})`);
    assert.equal(buttons.length, 4, `the logo, the QR code buttons (show, scan) and the robot are the only buttons (${lang})`);
    assert.deepEqual(buttons.map((b) => b.props.className.split(' ')[0]), ['logo', 'top-btn', 'top-btn', 'robot-btn'], 'the two next to the settings, in that order');
    const markup = renderToStaticMarkup(h(TopBar, { t, conn: { status: 'disconnected' }, live: false, bluetooth: true, busy: false, syncing: false, modeUp: false, onConnect: noop, onPanel: noop }));
    assert.ok(!markup.includes('gear'), 'no gear any more');
    assert.equal(textOf(markup), '', 'still no text');
  }
});

test('the disconnect question has no words and two answers', async () => {
  const { default: ConfirmDisconnect } = await load('/src/components/ConfirmDisconnect.jsx');
  const { I18N } = await load('/src/i18n.js');
  for (const [lang, t] of Object.entries(I18N)) {
    const markup = renderToStaticMarkup(h(ConfirmDisconnect, { t, onYes: noop, onNo: noop }));
    assert.equal(textOf(markup), '', `no text (${lang})`);
    assert.ok(markup.includes(`aria-label="${t.robot.disconnect}"`) && markup.includes(`aria-label="${t.robot.keep}"`), `both answers are labelled (${lang})`);
    assert.match(markup, /conn-icon on/); assert.match(markup, /conn-icon off/);
  }
});

test('the mat draws the target flag and the path only when asked', async () => {
  const { default: Stage } = await load('/src/components/Stage.jsx');
  const { I18N } = await load('/src/i18n.js');
  const base = { program: 'FFRF', cursor: -1, doneUpTo: -1, canPlace: true, onTarget: noop, overlay: null, celebrate: 0, t: I18N.fr, kind: 'sim' };
  const none = renderToStaticMarkup(h(Stage, { ...base, showPath: false, target: null }));
  assert.ok(!none.includes('class="seg') && !none.includes('class="target"'), 'nothing to guess from');
  const flag = renderToStaticMarkup(h(Stage, { ...base, showPath: false, target: { x: 2, y: 3 } }));
  assert.ok(flag.includes('class="target"') && flag.includes('translate(2 -3)'), 'the flag is where it was put');
  assert.ok(!flag.includes('class="seg'), 'a flag does not show the path');
  const path = renderToStaticMarkup(h(Stage, { ...base, showPath: true, target: null }));
  assert.equal((path.match(/class="seg /g) || []).length, 3, 'three straight steps');
  for (const m of [none, flag, path]) assert.equal(textOf(m), '');
});

test('the real robot backend uses the module and its launcher (not only the whole mode)', async () => {
  const { RobotBackend } = await load('/src/robot/robot-backend.js');
  const backend = new RobotBackend(noop, { doc: new EventTarget(), win: new EventTarget() });
  assert.ok(backend.module, 'a module to install on the robot');
  assert.match(backend.module.name, /^cards_[0-9a-f]{8}$/);
  assert.ok(backend.module.text.length > 5000 && !/^run\(\)/m.test(backend.module.text), 'the mode, without a call at its end');
  assert.equal(typeof backend.launcher, 'function');
  assert.match(backend.launcher(backend.module.name, 'FL', { autoplay: true }), new RegExp(`^import ${backend.module.name}\\n${backend.module.name}\\.run\\("FL", 1, \\d+\\)\\n$`), 'two lines, with where the lights are');
  assert.match(backend.buildScript('FL', { autoplay: true }), /^PROGRAM = "FL"$/m);
});

test('if the interface fails, the screen shows a warning and a reload button instead of going blank', async () => {
  const { default: ErrorBoundary } = await load('/src/components/ErrorBoundary.jsx');
  assert.deepEqual(ErrorBoundary.getDerivedStateFromError(new Error('x')), { failed: true });
  const ok = new ErrorBoundary({ children: h('p', null, 'fine') });
  assert.equal(renderToStaticMarkup(ok.render()), '<p>fine</p>');
  const failed = new ErrorBoundary({ children: h('p', null, 'fine') });
  failed.state = { failed: true };
  const markup = renderToStaticMarkup(failed.render());
  assert.ok(markup.includes('class="crash"') && markup.includes('class="again"'));
  assert.equal(textOf(markup), '', 'no words there either');
});

test('a picture under the mat: laid under the grid over its squares; placing the robot adds two buttons, still no text', async () => {
  const { default: Stage } = await load('/src/components/Stage.jsx');
  const { I18N } = await load('/src/i18n.js');
  for (const [lang, t] of Object.entries(I18N)) {
    const props = {
      program: 'FF', cursor: -1, doneUpTo: -1, showPath: false, target: null, onTarget: noop, canPlace: true, overlay: null, celebrate: 0, t, kind: 'sim',
      floor: { '1,0': 'r' }, ground: true, picture: { url: 'blob:x', cols: 4, rows: 3, sx: 2, sy: 1 },
    };
    const m = renderToStaticMarkup(h(Stage, props));
    const image = m.match(/<image [^>]*>/)?.[0] || '';
    assert.match(image, /class="map-image"/, `the picture (${lang})`);
    assert.match(image, /href="blob:x"/);
    // the robot starts on the square (2, 1) of 4 x 3: the picture's corner is 2.5 squares left of it and 1.5 above it (y is down in SVG, up in the cells)
    assert.match(image, /x="-2\.5"/); assert.match(image, /y="-1\.5"/); assert.match(image, /width="4"/); assert.match(image, /height="3"/);
    assert.ok(m.indexOf('<image') < m.indexOf('fill="url(#cell)"') && m.indexOf('<image') < m.indexOf('class="floor-tile"'), 'under the grid lines and the painted squares');
    assert.ok(m.includes('has-map'));
    assert.ok(!m.includes('placebar') && m.includes('brushbar'), 'the robot is not being placed: no buttons, the brush stays');

    const placing = renderToStaticMarkup(h(Stage, { ...props, placing: true, onPlace: noop, onPlaced: noop, onRecentre: noop }));
    assert.ok(placing.includes(`aria-label="${t.map.recentre}"`) && placing.includes(`aria-label="${t.map.done}"`), `recentre and confirm (${lang})`);
    assert.ok(placing.includes('place-ring') && placing.includes('xMidYMid meet') && !placing.includes('brushbar'));
    const read = renderToStaticMarkup(h(Stage, { ...props, picture: { ...props.picture, cells: { '2,1': 'r', '0,2': 'b' } }, placing: true, onPlace: noop, onPlaced: noop, onRecentre: noop }));
    assert.equal((read.match(/class="read-dot"/g) || []).length, 2, `a dot for each square the robot reads a colour on (${lang})`);
    assert.match(read, /<circle class="read-dot" cx="0" cy="0" r="0.13" fill="#ef4444"/, 'on the start square, in the robot\'s frame');
    assert.match(read, /cx="-2" cy="-1" r="0.13" fill="#3b82f6"/);
    assert.ok(!m.includes('read-dot') && !placing.includes('read-dot'), 'the dots are for placing the robot, and only when there is something read');
    assert.equal(textOf(placing), '', `no text while placing (${lang})`);
  }
  const none = renderToStaticMarkup(h(Stage, { program: 'F', cursor: -1, doneUpTo: -1, onTarget: noop, canPlace: true, t: I18N.en, kind: 'sim', placing: true }));
  assert.ok(!none.includes('<image') && !none.includes('placebar') && !none.includes('has-map'), 'no picture: nothing to place the robot on');
});

test('a real robot reads the real floor: the mat is greyed and a pictogram says the colours are not known', async () => {
  const { default: Stage } = await load('/src/components/Stage.jsx');
  const { I18N } = await load('/src/i18n.js');
  for (const [lang, t] of Object.entries(I18N)) {
    assert.ok(t.stageRealFloor && t.stageRealFloor.length > 20, `a sentence for screen readers (${lang})`);
    const props = { program: 'FrL', cursor: -1, doneUpTo: -1, showPath: false, target: null, onTarget: noop, canPlace: true, overlay: null, celebrate: 0, t, kind: 'live', floor: {} };
    const unknown = renderToStaticMarkup(h(Stage, { ...props, unknownGround: true }));
    assert.ok(unknown.includes('class="stage live') && unknown.includes('class="ground-unknown"') && unknown.includes(`aria-label="${t.stageRealFloor}"`), `the badge on the live mat (${lang})`);
    assert.equal(textOf(unknown), '', `no text (${lang})`);
    assert.ok(!renderToStaticMarkup(h(Stage, props)).includes('ground-unknown'), 'no badge when the program does not look at the ground');
    assert.ok(!renderToStaticMarkup(h(Stage, { ...props, kind: 'sim', unknownGround: false })).includes('ground-unknown'));
    assert.ok(!renderToStaticMarkup(h(Stage, { ...props, ground: false })).includes('brushbar'), 'no brush for a real floor');
  }
  const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  assert.match(css, /\.stage\.live \{ --mat: #[0-9a-f]{6}; --grid: #[0-9a-f]{6}; \}/, 'the live mat has its own grey colours');
});

test('the settings: choose a picture, then its size and the three buttons', async () => {
  const { default: Panel } = await load('/src/components/Panel.jsx');
  const { I18N } = await load('/src/i18n.js');
  for (const [lang, t] of Object.entries(I18N)) {
    const base = {
      t, lang, onLang: noop, sound: true, onSound: noop, speed: 1, onSpeed: noop, live: false, bluetooth: true,
      conn: { status: 'disconnected', device: '', firmware: null, battery: 0 }, cal: null, program: '', lastError: '',
      log: [], onClearLog: noop, onTest: noop, testing: false, canTest: false, onExample: noop, onConnect: noop, onDisconnect: noop, onClose: noop,
      showPath: false, onTogglePath: noop, canReset: true, onResetRobot: noop, mode: 'normal', onMode: noop, kinds: ['F', 'B', 'L', 'R'], custom: ['F', 'B', 'L', 'R'], onToggleCard: noop,
      picture: null, mapImage: null, mapKind: 'none', onMapThymio: noop, canPlace: true, onMapFile: noop, onMapSize: noop, onMapRatio: noop, onMapPlace: noop, onMapRecentre: noop, onMapRemove: noop,
    };
    const none = renderToStaticMarkup(h(Panel, base));
    assert.ok(none.includes(t.map.title) && none.includes(t.map.hint) && none.includes(t.map.choose) && none.includes(t.map.builtin), `choose a picture, or the Thymio map (${lang})`);
    assert.ok(!none.includes(t.map.place) && !none.includes(t.map.remove), 'nothing to place or remove yet');
    assert.match(none, /<input[^>]*type="file"[^>]*accept="image\/\*"/);

    const picture = { url: 'blob:x', cols: 5, rows: 4, sx: 2, sy: 2 };
    const has = renderToStaticMarkup(h(Panel, { ...base, picture, mapKind: 'custom', mapImage: { url: 'blob:x', w: 800, h: 600 } }));
    assert.ok(has.includes(t.map.change) && !has.includes(`>${t.map.choose}<`) && has.includes(t.map.builtin), `change it, or go back to the Thymio map (${lang})`);
    const town = { ...picture, cols: 4, rows: 4, sx: 2, sy: 2 };
    const builtin = renderToStaticMarkup(h(Panel, { ...base, picture: town, mapKind: 'builtin', mapImage: { url: 'blob:x', w: 8, h: 6 } }));
    assert.ok(builtin.includes(t.map.choose) && !builtin.includes(`>${t.map.builtin}<`) && builtin.includes(t.map.place) && builtin.includes(t.map.remove), `the Thymio map is chosen: choose another, place, remove (${lang})`);
    const stretched = renderToStaticMarkup(h(Panel, { ...base, picture, mapKind: 'builtin', mapImage: { url: 'blob:x', w: 8, h: 6 } }));
    assert.ok(stretched.includes(`>${t.map.builtin}<`), `the Thymio map is on but its grid was changed to 5 x 4: the button puts it back to 4 x 4 (${lang})`);
    for (const k of ['size', 'ratio', 'place', 'recentre', 'remove']) assert.ok(has.includes(t.map[k]), `${k} (${lang})`);
    assert.ok(has.includes(`aria-label="${t.map.cols}" value="5"`) && has.includes(`aria-label="${t.map.rows}" value="4"`), `the size (${lang})`);
    assert.ok(has.includes('class="map-thumb"'));
    assert.ok(!has.includes(t.map.virtualOnly), 'no note while the robot is virtual');
    assert.ok(renderToStaticMarkup(h(Panel, { ...base, live: true, canPlace: false, picture, mapImage: { url: 'blob:x', w: 8, h: 6 } })).includes(t.map.virtualOnly), `a real robot is connected: the picture is hidden (${lang})`);
    // said at the top of the section, also before any picture is asked for: with a real robot nothing shows on the mat, whatever button is pressed
    const live = renderToStaticMarkup(h(Panel, { ...base, live: true, canPlace: false }));
    assert.ok(live.includes(`<p class="warn" role="status">${t.map.virtualOnly}</p>`), `a real robot is connected, no picture yet: the note is there (${lang})`);
    assert.ok(live.indexOf(t.map.virtualOnly) < live.indexOf(t.map.choose), 'before the buttons');
    assert.ok(!renderToStaticMarkup(h(Panel, { ...base, live: false })).includes(t.map.virtualOnly));
    assert.match(renderToStaticMarkup(h(Panel, { ...base, picture, mapImage: { url: 'blob:x', w: 8, h: 6 }, canPlace: false })), /<button[^>]*disabled=""[^>]*><svg[^>]*>.*?<\/svg><span>[^<]*<\/span><\/button>/, 'placing is not offered while the robot runs');
  }
});

test('the mat is plain from the start; the Thymio map or a picture of the adult only when chosen', async () => {
  const { default: App } = await load('/src/App.jsx');
  const { I18N } = await load('/src/i18n.js');
  const render = (store) => { globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: noop }; return renderToStaticMarkup(h(App)); };
  assert.ok(!render({}).includes('map-image'), 'no picture to start with');
  assert.ok(!render({ 'cards.mapkind': 'default' }).includes('map-image'), 'the "default" kept by the first version of this page does not bring the map back');
  assert.ok(!render({ 'cards.map': 'null' }).includes('map-image'));
  assert.ok(!render({ 'cards.mapkind': 'custom' }).includes('map-image'), 'a picture of the adult is not there until it is read back from the browser');
  const first = render({ 'cards.mapkind': 'builtin' });
  const image = first.match(/<image [^>]*>/)?.[0] || '';
  assert.match(image, /class="map-image"/);
  assert.match(image, /href="[^"]*Tapis_Thymio[^"]*\.jpg"/, 'the map of the town');
  assert.match(image, /x="-2\.5"/); assert.match(image, /y="-1\.5"/); assert.match(image, /width="4"/); assert.match(image, /height="4"/);
  assert.equal(textOf(first), '', 'still no text on the main screen');
  // moved to another square
  assert.match(render({ 'cards.mapkind': 'builtin', 'cards.map': JSON.stringify({ cols: 4, rows: 4, sx: 0, sy: 3 }) }).match(/<image [^>]*>/)[0], /x="-0\.5"/);
  delete globalThis.localStorage;
  assert.ok(Object.keys(I18N).every((l) => I18N[l].map.builtin), 'named in every language');
});

test('the custom mode: the palette holds the cards that were given, the brush only if a card looks at the ground', async () => {
  const { default: App } = await load('/src/App.jsx');
  const { I18N } = await load('/src/i18n.js');
  const render = (store) => { globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: noop }; return renderToStaticMarkup(h(App)); };
  const palette = (markup) => [...markup.matchAll(/class="pcard (c-\w+)"/g)].map((m) => m[1]);
  for (const lang of Object.keys(I18N)) {
    const turns = render({ 'cards.lang': lang, 'cards.mode': 'custom', 'cards.custom': JSON.stringify(['F', 'L', 'repeat']) });
    assert.deepEqual(palette(turns), ['c-F', 'c-L', 'c-repeat'], `three cards (${lang})`);
    assert.ok(turns.includes('--cols:4'));
    assert.ok(!turns.includes('brushbar'), 'no card looks at the ground: no brush');
    assert.equal(textOf(turns), '', `still no text on the main screen (${lang})`);
    const ground = render({ 'cards.lang': lang, 'cards.mode': 'custom', 'cards.custom': JSON.stringify(['F', 'B', 'L', 'R', 'if']), 'cards.floor': '{"0,1":"r"}' });
    assert.deepEqual(palette(ground), ['c-F', 'c-B', 'c-L', 'c-R', 'c-if']);
    assert.ok(ground.includes('--cols:5'), 'five cards in one row');
    assert.ok(ground.includes('brushbar') && ground.includes('floor-tile'), 'an "if" card is given: the brush and the painted floor');
  }
  const colourLoop = render({ 'cards.mode': 'custom', 'cards.custom': JSON.stringify(['F', 'while']) });
  assert.deepEqual(palette(colourLoop), ['c-F', 'c-repeat'], 'a loop on a colour is a card of the repeat colour');
  assert.ok(colourLoop.includes('brushbar'), 'a loop on a colour looks at the ground');
  // from before the modes: the "advanced" key; once a mode is kept it wins
  assert.equal(palette(render({ 'cards.advanced': '1' })).length, 8);
  assert.equal(palette(render({ 'cards.advanced': '0' })).length, 4);
  assert.equal(palette(render({ 'cards.mode': 'normal', 'cards.advanced': '1' })).length, 4);
  assert.equal(palette(render({ 'cards.mode': 'advanced' })).length, 8);
  assert.equal(palette(render({ 'cards.mode': 'custom' })).length, 4, 'nothing chosen yet: the four steps');
  assert.equal(palette(render({ 'cards.mode': 'custom', 'cards.custom': 'garbage' })).length, 4);
  assert.equal(palette(render({ 'cards.mode': 'whatever' })).length, 4);
  // a card that the mode does not give stays in the program that has it
  const kept = render({ 'cards.mode': 'custom', 'cards.custom': JSON.stringify(['F']), 'cards.program': 'F(F)3F' });
  assert.equal((kept.match(/class="slot/g) || []).length, 6, 'the six cards of the program are there');
  delete globalThis.localStorage;
});

test('the palette of a tablet held upright: its own number of columns, and a layout that is not made of squares a quarter wide', async () => {
  const { Palette } = await load('/src/components/Dock.jsx');
  const { I18N } = await load('/src/i18n.js');
  const markup = (codes) => renderToStaticMarkup(h(Palette, { onPointerDown: noop, onKeyTap: noop, t: I18N.en, disabled: false, codes }));
  assert.ok(markup(['F', 'B', 'L', 'R']).includes('--cols:4;--tcols:4'));
  assert.ok(markup(['F', 'B', 'L', 'R', '(', ')', '2', 'r']).includes('--cols:4;--tcols:8'), 'eight cards, one row on a tablet');
  assert.ok(markup(['F', 'L', 'R']).includes('--tcols:4'), 'three cards do not get a width of a third of the screen');
  const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  const block = css.slice(css.indexOf('@media (min-width: 600px) and (orientation: portrait) {'));
  const rules = block.slice(0, block.indexOf('\n}\n'));
  assert.ok(rules.includes('grid-template-columns: repeat(var(--tcols, 4)') && rules.includes('.pcard { aspect-ratio: auto; height: var(--pcard)'), 'one row of cards that are not square');
  assert.ok(css.indexOf('@media (min-width: 600px) and (orientation: portrait)') > css.indexOf('.pcard {'), 'after the base rules, so that it wins');
});

test('the choices of a repeat card follow the cards given: numbers, colours, or both', async () => {
  const { default: Track } = await load('/src/components/Track.jsx');
  const { I18N } = await load('/src/i18n.js');
  const t = I18N.en;
  const render = (code, kinds) => renderToStaticMarkup(h(Track, { cards: [{ id: 1, code }], cursor: -1, doneUpTo: -1, selected: 0, phase: 'idle', t, kinds, onPointerDown: noop, onRemove: noop, onSetCode: noop }));
  const rows = (m) => (m.match(/class="pick-row"/g) || []).length, picks = (m) => (m.match(/class="pick /g) || []).length;
  assert.deepEqual([rows(render('3', ['F', 'repeat'])), picks(render('3', ['F', 'repeat']))], [1, 8], 'numbers only');
  assert.deepEqual([rows(render('E', ['F', 'while'])), picks(render('E', ['F', 'while']))], [1, 8], 'colours only');
  assert.deepEqual([rows(render('3', ['F', 'repeat', 'while'])), picks(render('3', ['F', 'repeat', 'while']))], [2, 16], 'both');
  assert.deepEqual([rows(render('r', ['F', 'if'])), picks(render('r', ['F', 'if']))], [1, 8], 'an "if" has its eight colours');
  assert.equal(rows(render('3', ['F', 'while'])), 2, 'a number that is in the program can still be seen, and changed for a colour');
  assert.doesNotThrow(() => render('3', undefined), 'no kinds given: does not break');
});

test('two buttons next to the settings: the QR code of the page and the scanner of another, pictograms only', async () => {
  const { default: TopBar } = await load('/src/components/TopBar.jsx');
  const { I18N } = await load('/src/i18n.js');
  for (const [lang, t] of Object.entries(I18N)) {
    for (const key of ['show', 'scan', 'close', 'bad', 'tooBig', 'denied', 'noCamera', 'fromImage', 'applied']) assert.ok(t.qr[key], `${key} (${lang})`);
    const props = { t, conn: { status: 'disconnected', device: '', firmware: null, battery: 0 }, live: false, bluetooth: true, busy: false, syncing: false, modeUp: false, failed: false, onConnect: noop, onPanel: noop, onShowQr: noop, onScanQr: noop, canScan: true };
    const bar = renderToStaticMarkup(h(TopBar, props));
    assert.equal(textOf(bar), '', `no text in the top bar (${lang})`);
    assert.ok(bar.includes(`aria-label="${t.qr.show}"`) && bar.includes(`aria-label="${t.qr.scan}"`), `named for screen readers (${lang})`);
    assert.ok(bar.indexOf('class="logo"') < bar.indexOf(t.qr.show) && bar.indexOf(t.qr.show) < bar.indexOf(t.qr.scan) && bar.indexOf(t.qr.scan) < bar.indexOf('class="spacer"') && bar.indexOf('class="spacer"') < bar.indexOf('class="robot-btn'), 'the settings, the code and the scan together on the left, the robot on the right');
    const buttonsOf = (markup) => [...markup.matchAll(/<button class="(top-btn[^"]*)"([^>]*)>/g)].map((m) => ({ classes: m[1].split(' '), attrs: m[2] }));
    const [show, scan] = buttonsOf(bar);
    assert.deepEqual([show.classes, scan.classes], [['top-btn'], ['top-btn', 'scan']], 'the scan button is the blue one');
    assert.ok(!show.attrs.includes('disabled'), 'the code can always be shown');
    const busy = renderToStaticMarkup(h(TopBar, { ...props, busy: true, canScan: false }));
    const [busyShow, busyScan] = buttonsOf(busy);
    assert.ok(busyScan.attrs.includes('disabled') && busyScan.attrs.includes(`aria-label="${t.qr.scan}"`) && !busyShow.attrs.includes('disabled'), `no scanning while the robot plays (${lang})`);
  }
});

test('the QR code over the page: as large as it can be, the code of the text, a warning when the text does not fit', async () => {
  const { default: QrShow } = await load('/src/components/QrShow.jsx');
  const { qrMatrix } = await load('/src/qr.js');
  const { I18N } = await load('/src/i18n.js');
  for (const [lang, t] of Object.entries(I18N)) {
    const text = 'T3C1;l=fr;p=FF(FR)3F;t=1,2';
    const m = qrMatrix(text);
    const shown = renderToStaticMarkup(h(QrShow, { text, t, onClose: noop }));
    assert.ok(shown.includes('class="qr-back"') && shown.includes('aria-modal="true"'), 'over the page');
    assert.ok(shown.includes(`viewBox="-4 -4 ${m.size + 8} ${m.size + 8}"`), `the code with its quiet zone of four modules (${lang})`);
    assert.ok(shown.includes('fill="#fff"') && shown.includes('fill="#000"'), 'black on white, whatever the theme');
    assert.ok(shown.includes(`aria-label="${t.qr.close}"`));
    assert.equal(textOf(shown), '', `no text over a code that is shown (${lang})`);
    const big = renderToStaticMarkup(h(QrShow, { text: 'x'.repeat(5000), t, onClose: noop }));
    assert.ok(big.includes(t.qr.tooBig) && !big.includes('<svg class="qr-code"'), `too much: it says so (${lang})`);
  }
});

test('the scanner: a viewfinder, a way to give a photo of the code, a way out', async () => {
  const { default: QrScan } = await load('/src/components/QrScan.jsx');
  const { I18N } = await load('/src/i18n.js');
  for (const [lang, t] of Object.entries(I18N)) {
    const m = renderToStaticMarkup(h(QrScan, { t, onText: noop, onClose: noop }));
    assert.ok(m.includes('<video') && /playsinline/i.test(m) && /muted/.test(m), 'the camera, inline on an iPhone');
    assert.ok(m.includes('class="scan-frame"') && m.includes('type="file"') && m.includes('accept="image/*"'));
    assert.ok(m.includes(`aria-label="${t.qr.fromImage}"`) && m.includes(`aria-label="${t.qr.close}"`), `(${lang})`);
    assert.equal(textOf(m), '', `no text while the camera starts (${lang})`);
  }
});
