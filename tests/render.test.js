// Renders the real components on the server side: catches what a build cannot (a prop that is not
// destructured, a missing string in one language) and checks the rule of the main screen: no text.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
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

test('the settings: the advanced mode switch, and its examples only when it is on', async () => {
  const { default: Panel } = await load('/src/components/Panel.jsx');
  const { I18N } = await load('/src/i18n.js');
  for (const [lang, t] of Object.entries(I18N)) {
    const base = {
      t, lang, onLang: noop, sound: true, onSound: noop, speed: 1, onSpeed: noop, live: false, bluetooth: true,
      conn: { status: 'disconnected', device: '', firmware: null, battery: 0 }, cal: null, program: '', lastError: '',
      log: [], onClearLog: noop, onTest: noop, testing: false, canTest: false, onExample: noop, onConnect: noop, onDisconnect: noop, onClose: noop,
      showPath: false, onTogglePath: noop, canReset: true, onResetRobot: noop, advanced: false, onAdvanced: noop,
    };
    const off = renderToStaticMarkup(h(Panel, base));
    const on = renderToStaticMarkup(h(Panel, { ...base, advanced: true }));
    assert.ok(off.includes(t.panel.advanced) && off.includes(t.panel.advancedHint), `the switch and what it does (${lang})`);
    assert.ok(off.indexOf(t.panel.quick) < off.indexOf(t.panel.advanced), `after the shortcuts (${lang})`);
    assert.ok(!off.includes(t.examples.loopSquare), `no advanced example in the basic mode (${lang})`);
    for (const id of ['loopSquare', 'zigzag', 'turnOnRed', 'backOnGreen', 'alongRed']) assert.ok(on.includes(t.examples[id]), `${id} (${lang})`);
    assert.equal((on.match(/class="mini"/g) || []).length, 11, `eleven examples (${lang})`);
    assert.equal((off.match(/class="mini"/g) || []).length, 6);
  }
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
    assert.equal(buttons.length, 2, `the logo and the robot are the only buttons (${lang})`);
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
      floor: { '1,0': 'r' }, advanced: true, picture: { url: 'blob:x', cols: 4, rows: 3, sx: 2, sy: 1 },
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

test('the settings: choose a picture, then its size and the three buttons', async () => {
  const { default: Panel } = await load('/src/components/Panel.jsx');
  const { I18N } = await load('/src/i18n.js');
  for (const [lang, t] of Object.entries(I18N)) {
    const base = {
      t, lang, onLang: noop, sound: true, onSound: noop, speed: 1, onSpeed: noop, live: false, bluetooth: true,
      conn: { status: 'disconnected', device: '', firmware: null, battery: 0 }, cal: null, program: '', lastError: '',
      log: [], onClearLog: noop, onTest: noop, testing: false, canTest: false, onExample: noop, onConnect: noop, onDisconnect: noop, onClose: noop,
      showPath: false, onTogglePath: noop, canReset: true, onResetRobot: noop, advanced: false, onAdvanced: noop,
      picture: null, mapImage: null, mapKind: 'none', onMapThymio: noop, canPlace: true, onMapFile: noop, onMapSize: noop, onMapRatio: noop, onMapPlace: noop, onMapRecentre: noop, onMapRemove: noop,
    };
    const none = renderToStaticMarkup(h(Panel, base));
    assert.ok(none.includes(t.map.title) && none.includes(t.map.hint) && none.includes(t.map.choose) && none.includes(t.map.builtin), `choose a picture, or the Thymio map (${lang})`);
    assert.ok(!none.includes(t.map.place) && !none.includes(t.map.remove), 'nothing to place or remove yet');
    assert.match(none, /<input[^>]*type="file"[^>]*accept="image\/\*"/);

    const picture = { url: 'blob:x', cols: 5, rows: 4, sx: 2, sy: 2 };
    const has = renderToStaticMarkup(h(Panel, { ...base, picture, mapKind: 'custom', mapImage: { url: 'blob:x', w: 800, h: 600 } }));
    assert.ok(has.includes(t.map.change) && !has.includes(`>${t.map.choose}<`) && has.includes(t.map.builtin), `change it, or go back to the Thymio map (${lang})`);
    const builtin = renderToStaticMarkup(h(Panel, { ...base, picture, mapKind: 'builtin', mapImage: { url: 'blob:x', w: 8, h: 6 } }));
    assert.ok(builtin.includes(t.map.choose) && !builtin.includes(`>${t.map.builtin}<`) && builtin.includes(t.map.place) && builtin.includes(t.map.remove), `the Thymio map is chosen: choose another, place, remove (${lang})`);
    for (const k of ['size', 'ratio', 'place', 'recentre', 'remove']) assert.ok(has.includes(t.map[k]), `${k} (${lang})`);
    assert.ok(has.includes(`aria-label="${t.map.cols}" value="5"`) && has.includes(`aria-label="${t.map.rows}" value="4"`), `the size (${lang})`);
    assert.ok(has.includes('class="map-thumb"'));
    assert.ok(!has.includes(t.map.virtualOnly), 'no note while the robot is virtual');
    assert.ok(renderToStaticMarkup(h(Panel, { ...base, live: true, canPlace: false, picture, mapImage: { url: 'blob:x', w: 8, h: 6 } })).includes(t.map.virtualOnly), `a real robot is connected: the picture is hidden (${lang})`);
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
