import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar from './components/TopBar.jsx';
import Stage from './components/Stage.jsx';
import Track, { CardFace } from './components/Track.jsx';
import { Palette, Dock } from './components/Dock.jsx';
import Panel from './components/Panel.jsx';
import ConfirmDisconnect from './components/ConfirmDisconnect.jsx';
import { I18N, detectLang } from './i18n.js';
import { cleanProgram, MAX_STEPS } from './spec.js';
import { SimBackend } from './sim/sim-backend.js';
import { RobotBackend } from './robot/robot-backend.js';
import { RobotSync } from './robot/sync.js';
import { PoseAnimator, homePose } from './robot/pose-anim.js';
import { supportsBluetooth } from './api.js';
import { play as sfx, setSoundEnabled } from './sound.js';
import { useDrag } from './useDrag.js';

let nextId = 1;
const mk = (code) => ({ id: nextId++, code });
const toCards = (s) => cleanProgram(s).split('').map(mk);
const toProgram = (cards) => cards.map((c) => c.code).join('');

const load = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };

export default function App() {
  const [lang, setLang] = useState(detectLang);
  const t = I18N[lang] || I18N.fr;
  const [sound, setSound] = useState(() => load('cards.sound', '1') === '1');
  const [speed, setSpeed] = useState(1);
  const [cards, setCards] = useState(() => toCards(load('cards.program', '')));
  const [selected, setSelected] = useState(null);
  const [phase, setPhase] = useState('idle');           // idle | sending | playing
  const [cursor, setCursor] = useState(-1);             // the card being played
  const [doneUpTo, setDoneUpTo] = useState(-1);         // the last card whose movement is over
  const [conn, setConn] = useState({ status: 'disconnected', device: '', firmware: null, battery: 0 });
  const [cal, setCal] = useState(null);
  const [panel, setPanel] = useState(false);
  const [showPath, setShowPath] = useState(false);     // the path is for the child to imagine; shown on request only
  const [toast, setToast] = useState(null);           // { kind: 'warn' | 'link', key } shown as a pictogram
  const [lastError, setLastError] = useState('');     // the words go to the adults' page
  const [trashWobble, setTrashWobble] = useState(false);
  const [announce, setAnnounce] = useState('');         // for screen readers only
  const [log, setLog] = useState([]);                  // the connection journal of the adults' page
  const [testing, setTesting] = useState(false);
  const [celebrate, setCelebrate] = useState(0);
  const [shake, setShake] = useState(false);
  const [doneNote, setDoneNote] = useState(false);     // "Bravo!" / "put the robot back"
  const [syncing, setSyncing] = useState(false);       // the robot is being given the cards' program
  const [modeUp, setModeUp] = useState(false);         // the mode runs on the robot
  const [confirmDisc, setConfirmDisc] = useState(false);
  const [target, setTarget] = useState(null);           // a flag on the mat, only to be seen

  const live = conn.status === 'connected';
  const bluetooth = supportsBluetooth();
  const program = toProgram(cards);

  const stageRef = useRef(null);
  const trackRef = useRef(null);
  const eraserRef = useRef(null);
  const sim = useRef(null);
  const robot = useRef(null);
  const anim = useRef(new PoseAnimator());
  const home = useRef(true);                // the avatar waits on the start square
  const sync = useRef(null);                // keeps the robot's program equal to the cards (robot/sync.js)
  const syncCallbacks = useRef({});
  const S = useRef({});
  S.current = { cards, program, phase, live, speed, selected, syncing, modeUp };

  useEffect(() => { setSoundEnabled(sound); save('cards.sound', sound ? '1' : '0'); }, [sound]);
  useEffect(() => { save('cards.lang', lang); document.documentElement.lang = lang; document.title = t.title; }, [lang, t.title]);
  useEffect(() => { save('cards.program', program); }, [program]);

  // Everything that happens on the link goes to the journal (and to the console, for DevTools).
  const addLog = useCallback((kind, text) => {
    console.info(`[robot] ${kind} ${text}`);
    setLog((l) => [...l.slice(-399), { at: performance.now(), kind, text }]);
  }, []);
  const addLogRef = useRef(addLog);
  addLogRef.current = addLog;

  // The screen has no words: a message is a pictogram on the mat (and a line for screen readers).
  // Problems also keep their text for the adults' page.
  const note = useCallback((kind, text, { problem = false } = {}) => {
    setToast({ kind, key: Date.now() });
    setAnnounce(text);
    if (problem) setLastError(text);
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  // ---- what the robot (virtual or real) tells us -----------------------------------------------
  const finish = useCallback((ok) => {
    const s = S.current;
    setPhase('idle');
    setCursor(-1);
    if (ok) {
      setDoneUpTo(s.cards.length - 1);
      setDoneNote(true);
      setCelebrate((n) => n + 1);
      sfx('done');
    } else {
      setDoneUpTo(-1);
    }
  }, []);

  const onEvent = useCallback((e) => {
    const s = S.current;
    sync.current?.onEvent(e);                   // the robot's program, whether its mode runs...
    switch (e.type) {
      case 'hello':
        // a run that plays starts at its hello; one that only waits (the robot is being given the cards) does not
        if (s.live && sync.current?.kind === 'play') { home.current = false; anim.current.begin(performance.now()); setPhase('playing'); }
        break;
      case 'cal': setCal(e); anim.current.setCal(e); break;
      case 'battery': setConn((c) => ({ ...c, battery: e.volts })); break;
      case 'state':
        // A replay started on the robot (the hand over its rear sensors, the remote): follow it.
        if (e.state === 'play' && s.live && s.phase === 'idle' && !s.syncing) {
          anim.current.reset(s.program, cal);
          anim.current.begin(performance.now());
          home.current = false;
          setDoneUpTo(-1);
          setPhase('playing');
        }
        break;
      case 'step':
        setCursor(e.index);
        anim.current.onStep(e.index, e.code, performance.now());
        sfx('pick', e.code);
        break;
      case 'moved': setDoneUpTo(e.index); anim.current.onMoved(e.index); break;
      case 'end': anim.current.onEnd(); finish(true); break;
      case 'bye': case 'script-ended': case 'exit':
        // while a script is being replaced ('sending') the old one ending is expected
        if (s.phase === 'playing') finish(false);
        break;
      case 'error':
        if (s.phase !== 'idle') finish(false);
        note('warn', /AttributeError|ImportError|NameError/.test(e.message) ? `${t.err.script} (${e.message})` : e.message, { problem: true });
        break;
      case 'conn':
        setConn((c) => ({ ...c, status: e.status, device: e.device ?? (e.status === 'connected' ? c.device : ''), firmware: e.firmware ?? c.firmware, battery: e.status === 'connected' ? c.battery : 0 }));
        if (e.status === 'disconnected') {
          if (s.phase !== 'idle' && s.live) { finish(false); note('link', t.err.link, { problem: true }); }
          anim.current.reset('', null);
          setConfirmDisc(false);
        }
        if (e.error && !/cancel|chosen|NotFound/i.test(`${e.errorName} ${e.error}`)) {
          const gatt = /NotSupported|GATT|NetworkError|InvalidState/i.test(`${e.errorName} ${e.error}`);
          note('link', `${t.err.connect} (${e.errorName}: ${e.error})${gatt ? ` ${t.err.gatt}` : ''}`, { problem: true });
          if (gatt) addLogRef.current('err', t.err.gatt);
        }
        break;
      default: break;
    }
  }, [finish, note, t]);

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // The robot and the cards hold the same program at all moments (see robot/sync.js): what changes on
  // the robot reaches the cards ("@@prog"); what changes in the cards is given to the robot by starting
  // its mode again, a moment after the last change. The same start makes a robot that has just been
  // connected show its colours, and gives it its mode back after Stop.
  syncCallbacks.current = {
    adopt: (program) => {
      setCards((cs) => {
        const keep = cs.filter((c, i) => program[i] === c.code);
        return [...keep, ...toCards(program.slice(keep.length))];
      });
      home.current = true;
      setDoneUpTo(-1);
      setCursor(-1);
    },
    failed: (err) => note('warn', `${/no-answer/.test(String(err?.message)) ? t.err.noAnswer : t.err.upload} (${String(err?.message || err)})`, { problem: true }),
  };

  useEffect(() => {
    const emit = (e) => onEventRef.current(e);
    sim.current = new SimBackend(emit);
    robot.current = new RobotBackend(emit, { onLog: (k, t) => addLogRef.current(k, t) });
    robot.current.attach();
    sync.current = new RobotSync({
      backend: robot.current,
      onState: ({ syncing: on, modeUp: up }) => { setSyncing(on); setModeUp(up); },
      onAdopt: (program) => syncCallbacks.current.adopt(program),
      onError: (err) => syncCallbacks.current.failed(err),
      onLog: (kind, text) => addLogRef.current(kind, text),
    });
    return () => robot.current.detach();
  }, []);

  useEffect(() => {
    sync.current?.update({ program, live, busy: phase !== 'idle' });
  }, [program, live, phase]);

  // A safety net: while a robot is connected the decision is made again every second, so that a start
  // that was missed for any reason is made up for (it is idempotent, and writes to the journal only
  // when something changes).
  useEffect(() => {
    if (!live) return undefined;
    const id = setInterval(() => sync.current?.evaluate(), 1000);
    return () => clearInterval(id);
  }, [live]);

  // ---- the animation loop: the virtual robot moves, the avatar follows -------------------------
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now) => {
      const dt = Math.min(100, now - last);
      last = now;
      const s = S.current;
      let pose, leds;
      if (!s.live) {
        sim.current.advance(dt * s.speed);
        const l = sim.current.leds();
        pose = home.current ? homePose() : sim.current.pose();
        leds = { pulse: l && sim.current.running ? l.front[0] / 16 : 0, circle: l && sim.current.running ? l.circle : [] };
      } else {
        pose = home.current ? homePose() : anim.current.pose(now);
        leds = anim.current.leds(now);
        if (s.phase !== 'playing') leds = { pulse: 0, circle: [] };
      }
      stageRef.current?.setPose(pose, leds);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- editing the program ---------------------------------------------------------------------
  const edited = useCallback(() => {
    setDoneNote(false);
    setDoneUpTo(-1);
    setCursor(-1);
    setSelected(null);
    home.current = true;
  }, []);

  const refuseWhenFull = useCallback(() => {
    sfx('full');
    setAnnounce(t.full);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }, [t.full]);

  const insert = useCallback((code, at) => {
    if (S.current.cards.length >= MAX_STEPS) { refuseWhenFull(); return; }
    setCards((cs) => { const i = Math.max(0, Math.min(cs.length, at ?? cs.length)); return [...cs.slice(0, i), mk(code), ...cs.slice(i)]; });
    sfx('drop', code);
    edited();
  }, [edited, refuseWhenFull]);

  const append = useCallback((code) => insert(code, undefined), [insert]);

  const removeAt = useCallback((i) => {
    setCards((cs) => cs.filter((_, k) => k !== i));
    sfx('remove');
    edited();
  }, [edited]);

  const moveCard = useCallback((from, to) => {
    // `to` is a gap in the list as it is now; dropping next to itself changes nothing
    if (to === from || to === from + 1) { sfx('drop', S.current.cards[from]?.code); return; }
    setCards((cs) => {
      const next = cs.slice();
      const [c] = next.splice(from, 1);
      next.splice(to > from ? to - 1 : to, 0, c);
      return next;
    });
    sfx('drop', S.current.cards[from]?.code);
    edited();
  }, [edited]);

  const eraseLast = useCallback(() => {
    if (!S.current.cards.length) return;
    removeAt(S.current.cards.length - 1);
  }, [removeAt]);

  const clearAll = useCallback(() => {
    if (!S.current.cards.length) return;
    setCards([]);
    sfx('clear');
    edited();
  }, [edited]);

  const loadExample = useCallback((p) => {
    setCards(toCards(p));
    edited();
    setPanel(false);
    sfx('go');
  }, [edited]);

  // ---- running ---------------------------------------------------------------------------------
  const go = useCallback(async () => {
    const s = S.current;
    if (s.phase !== 'idle') return;
    if (!s.program) { sfx('oops'); setAnnounce(t.needCards); setShake(true); setTimeout(() => setShake(false), 500); return; }
    setSelected(null);
    setCursor(-1);
    setDoneUpTo(-1);
    setDoneNote(false);
    home.current = true;
    sfx('go');
    if (s.live) {
      setPhase('sending');
      anim.current.reset(s.program, cal);
      try {
        await sync.current.play(s.program);
      } catch (err) {
        setPhase('idle');
        home.current = true;
        note('warn', `${/no-answer/.test(String(err?.message)) ? t.err.noAnswer : t.err.upload} (${String(err?.message || err)})`, { problem: true });
        console.warn('run failed', err);
      }
    } else {
      home.current = false;
      setPhase('playing');
      sim.current.play(s.program);
    }
  }, [cal, note, t]);

  const stop = useCallback(async () => {
    if (S.current.phase !== 'playing') return;
    sfx('stop');
    if (S.current.live) await robot.current.stop(); else sim.current.stop();
    finish(false);
  }, [finish]);

  const connect = useCallback(async () => {
    if (S.current.live) { setConfirmDisc(true); return; }
    if (!bluetooth) { setPanel(true); return; }
    try { await robot.current.connect(); } catch { /* reported by the backend */ }
  }, [bluetooth]);

  const disconnect = useCallback(async () => { setConfirmDisc(false); await robot.current.disconnect(); setPanel(false); }, []);

  // The tiny script of the settings page: tells a broken link from a broken mode.
  const testRobot = useCallback(async () => {
    if (!S.current.live || S.current.phase !== 'idle') return;
    setTesting(true);
    const report = await robot.current.selfTest();
    setTesting(false);
    if (report.done == null) note('warn', `self test failed: ${JSON.stringify(report)}`, { problem: true });
    sync.current.reset();                         // the robot is back in its firmware: start the mode again
  }, [note]);

  // ---- drag and drop, keyboard -----------------------------------------------------------------
  const enabled = phase === 'idle' && !panel;
  const { drag, onPointerDown } = useDrag({
    trackRef, eraserRef, enabled,
    onTapNew: append,
    onTapCard: (i) => setSelected((s) => (s === i ? null : i)),
    onInsert: insert,
    onMove: moveCard,
    onRemove: removeAt,
  });

  useEffect(() => {
    const onKey = (e) => {
      if (panel || confirmDisc || e.metaKey || e.ctrlKey || e.altKey) return;
      const onButton = e.target?.tagName === 'BUTTON';
      const map = { ArrowUp: 'F', ArrowDown: 'B', ArrowLeft: 'L', ArrowRight: 'R' };
      if (map[e.key]) { if (S.current.phase === 'idle') { e.preventDefault(); append(map[e.key]); } }
      else if (e.key === 'Enter' && !onButton) { e.preventDefault(); go(); }
      else if ((e.key === 'Backspace' || e.key === 'Delete') && S.current.phase === 'idle') { e.preventDefault(); eraseLast(); }
      else if (e.key === 'd' || e.key === 'D') { setShowPath((v) => !v); }
      else if ((e.key === 'r' || e.key === 'R') && S.current.phase === 'idle') { edited(); sfx('pick', 'L'); }      // the robot is back on the start square
      else if (e.key === 'Escape') stop();
    };
    const onDown = (e) => { if (!e.target.closest?.('.slot')) setSelected(null); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [panel, confirmDisc, append, go, stop, eraseLast, edited]);

  // ---- what the stage says ---------------------------------------------------------------------
  const finished = phase === 'idle' && cards.length > 0 && doneUpTo === cards.length - 1;
  // With a real robot the reminder to put it back stays until the child does something; the
  // congratulation of the virtual one goes away by itself.
  useEffect(() => {
    if (!doneNote || live) return undefined;
    const id = setTimeout(() => setDoneNote(false), 4500);
    return () => clearTimeout(id);
  }, [doneNote, live]);
  const overlay = useMemo(() => {
    if (toast) return { kind: toast.kind, key: `t${toast.key}` };
    if (phase === 'sending') return { kind: 'sending', key: 'sending', text: t.sending };
    if (finished && doneNote) return live ? { kind: 'putBack', key: 'done', text: t.putBack } : { kind: 'done', key: 'done', text: t.done };
    return null;
  }, [toast, phase, finished, doneNote, live, t]);
  useEffect(() => { if (overlay?.text) setAnnounce(overlay.text); }, [overlay]);

  // short press on the bin: it shakes, "keep your finger down"
  const hintTrash = useCallback(() => {
    setAnnounce(t.eraseAllHint);
    setTrashWobble(true);
    setTimeout(() => setTrashWobble(false), 500);
  }, [t.eraseAllHint]);

  return (
    <div className={`app ${phase !== 'idle' ? 'running' : ''} ${live ? 'is-live' : 'is-sim'}`}>
      <TopBar t={t} conn={conn} live={live} bluetooth={bluetooth} busy={phase !== 'idle'} syncing={syncing} modeUp={modeUp} onConnect={connect} onPanel={() => setPanel(true)} />
      <main className="board">
        <section className="left">
          <Stage
            ref={stageRef} program={program} cursor={cursor} doneUpTo={doneUpTo}
            showPath={showPath} target={target} canPlace={phase === 'idle' && !panel && !confirmDisc}
            onTarget={(cell) => setTarget((cur) => (cur && cur.x === cell.x && cur.y === cell.y ? null : cell))}
            overlay={overlay} celebrate={celebrate && finished ? celebrate : 0} t={t} kind={live ? 'live' : 'sim'}
          />
        </section>
        <section className="right">
          <Track
            ref={trackRef} cards={cards} cursor={cursor} doneUpTo={doneUpTo} selected={selected} phase={phase}
            dragFrom={drag?.kind === 'move' ? drag.from : null} dropIndex={drag ? drag.target : null}
            onPointerDown={onPointerDown} onRemove={removeAt} t={t} shake={shake}
          />
          <div className="dock">
            <Palette onPointerDown={onPointerDown} onKeyTap={append} t={t} disabled={!enabled} />
            <Dock
              eraserRef={eraserRef} canErase={enabled && cards.length > 0} running={phase !== 'idle'} canGo={cards.length > 0 && phase === 'idle'}
              eraserActive={Boolean(drag?.eraser)} onEraseLast={eraseLast} onClear={clearAll}
              onClearHint={hintTrash} wobble={trashWobble} onGo={go} onStop={stop} t={t}
            />
          </div>
        </section>
      </main>
      <div className="sr-only" role="status" aria-live="polite">{announce}</div>
      {drag && (
        <div className={`ghost ${drag.eraser ? 'over-eraser' : ''}`} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <CardFace code={drag.code} label="" />
        </div>
      )}
      {confirmDisc && <ConfirmDisconnect t={t} onYes={disconnect} onNo={() => setConfirmDisc(false)} />}
      {panel && (
        <Panel
          t={t} lang={lang} onLang={setLang} sound={sound} onSound={setSound} speed={speed} onSpeed={setSpeed}
          live={live} bluetooth={bluetooth} conn={conn} cal={cal} program={program} lastError={lastError}
          log={log} onClearLog={() => setLog([])} onTest={testRobot} testing={testing} canTest={live && phase === 'idle'}
          onExample={loadExample} onConnect={() => { setPanel(false); connect(); }} onDisconnect={disconnect} onClose={() => setPanel(false)}
        />
      )}
    </div>
  );
}
