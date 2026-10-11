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

test('the connect button shows its states: grey, connecting, in sync, on, standby, unavailable', async () => {
  const { default: TopBar } = await load('/src/components/TopBar.jsx');
  const { I18N } = await load('/src/i18n.js');
  const t = I18N.fr;
  const render = (conn, live, bluetooth, extra = {}) => renderToStaticMarkup(h(TopBar, { t, conn, live, bluetooth, busy: false, syncing: false, modeUp: false, onConnect: noop, onPanel: noop, ...extra }));
  const off = render({ status: 'disconnected' }, false, true);
  const wait = render({ status: 'connecting' }, false, true);
  const on = render({ status: 'connected', device: 'THYMIO-1', battery: 4.0 }, true, true, { modeUp: true });
  const sync = render({ status: 'connected', device: 'THYMIO-1' }, true, true, { modeUp: true, syncing: true });
  const standby = render({ status: 'connected', device: 'THYMIO-1' }, true, true, { modeUp: false });
  const no = render({ status: 'disconnected' }, false, false);
  assert.match(off, /conn-icon off/); assert.match(wait, /conn-icon wait/); assert.match(on, /conn-icon on/);
  assert.match(sync, /conn-icon sync/); assert.match(standby, /conn-icon standby/); assert.match(no, /conn-icon no/);
  for (const m of [on, sync, standby]) assert.ok(m.includes('class="tick"'), 'a tick when connected');
  assert.ok(!off.includes('class="tick"'));
  for (const m of [off, wait, on, sync, standby, no]) assert.equal(textOf(m), '');
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
