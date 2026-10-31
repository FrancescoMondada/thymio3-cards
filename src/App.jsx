import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar from './components/TopBar.jsx';
import Stage from './components/Stage.jsx';
import Track, { CardFace } from './components/Track.jsx';
import { Palette, Dock } from './components/Dock.jsx';
import Panel from './components/Panel.jsx';
import ConfirmDisconnect from './components/ConfirmDisconnect.jsx';
import { I18N, detectLang } from './i18n.js';
import { cleanProgram, MAX_STEPS, isRepeat, isColor, isWhile } from './spec.js';
import { MODES, cardsOf, cleanCustom, hasGround, hasGroundCards, paletteCodes, toggleKind } from './modes.js';
import { APP_LINKS, decodeConfig, encodeConfig, mapPlan } from './share.js';
import { cleanName, formatWhen, randomName } from './names.js';
import QrShow from './components/QrShow.jsx';
import QrScan from './components/QrScan.jsx';
import { SimBackend } from './sim/sim-backend.js';
import { RobotBackend } from './robot/robot-backend.js';
import { RobotSync } from './robot/sync.js';
import { Homing, PoseAnimator, homePose } from './robot/pose-anim.js';
import { supportsBluetooth } from './api.js';
import { play as sfx, setSoundEnabled } from './sound.js';
import { useDrag } from './useDrag.js';
import { THYMIO_MAP, centerCell, cleanMap, shiftCells, shiftPoint, suggestRows } from './worldmap.js';
import defaultMapUrl from './assets/Tapis_Thymio.jpg';
import { groundAt } from './picturecolor.js';
import { clearImage, loadImage, prepareImage, saveImage, scanPicture } from './mapStore.js';

let nextId = 1;
const mk = (code) => ({ id: nextId++, code });
const toCards = (s) => cleanProgram(s).split('').map(mk);
const toProgram = (cards) => cards.map((c) => c.code).join('');

const load = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };

const EMPTY_FLOOR = {};
const BUILTIN_MAP_IMAGE = { url: defaultMapUrl, w: 1280, h: 1280 };     // the map of the Thymio town, offered in the settings
const reduceMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export default function App() {
  const [lang, setLang] = useState(detectLang);
  const t = I18N[lang] || I18N.fr;
  const [sound, setSound] = useState(() => load('cards.sound', '1') === '1');
  const [name, setName] = useState(() => { const kept = load('cards.name', null); return kept === null ? randomName(lang) : cleanName(kept); });   // beside the QR code of the page, drawn at random the first time
  const [speed, setSpeed] = useState(1);
  // The cards the children have at hand: normal (the four steps), advanced (all) or custom (the cards the adult picked).
  // (A page from before the modes kept only "advanced" or not, in cards.advanced.)
  const [mode, setMode] = useState(() => { const m = load('cards.mode', ''); return MODES.includes(m) ? m : load('cards.advanced', '0') === '1' ? 'advanced' : 'normal'; });
  const [picked, setPicked] = useState(() => { try { return cleanCustom(JSON.parse(load('cards.custom', 'null'))); } catch { return cleanCustom(null); } });   // the cards of the custom mode
  const kinds = useMemo(() => cardsOf(mode, picked), [mode, picked]);
  const ground = hasGround(kinds);                  // a card looks at the ground: the brush, the picture's colours
  const [floor, setFloor] = useState(() => { try { return JSON.parse(load('cards.floor', '{}')) || {}; } catch { return {}; } });   // "x,y" -> colour letter: the floor of the virtual robot
  const [brush, setBrush] = useState(null);             // painting the floor: null, a colour letter, or 'erase'
  const [check, setCheck] = useState(null);             // what the last "if" saw: { index, taken, key }
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
  const [startFailed, setStartFailed] = useState(false); // the mode could not be started on the robot that was just connected
  const [confirmDisc, setConfirmDisc] = useState(false);
  const [target, setTarget] = useState(null);           // a flag on the mat, only to be seen
  const [map, setMap] = useState(() => { try { return cleanMap(JSON.parse(load('cards.map', 'null'))) || THYMIO_MAP; } catch { return THYMIO_MAP; } });   // the picture under the grid: squares covered, and the start square on it
  const [mapKind, setMapKind] = useState(() => { const k = load('cards.mapkind', 'none'); return k === 'custom' || k === 'builtin' ? k : 'none'; });   // a plain mat (the start), the Thymio map, or a picture the adult chose
  const [custom, setCustom] = useState(null);           // the picture the adult chose, kept in IndexedDB: { url, w, h }
  const mapRequest = useRef(0);                         // each choice of what is under the mat takes a number: a big picture still being prepared must not undo a later choice
  const mapImage = mapKind === 'builtin' ? BUILTIN_MAP_IMAGE : mapKind === 'custom' ? custom : null;
  const [placing, setPlacing] = useState(false);        // the robot is being dragged to its start square on the picture
  const [qr, setQr] = useState(null);                    // over the page: { show: the text of its QR code } or { scan: true }
  const [scan, setScan] = useState(null);               // the colour of each square of the picture, as the virtual robot reads it: { url, cols, rows, cells }

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
  const wasHome = useRef(true);             // (the animation loop) it was on the start square at the last frame
  const shown = useRef(homePose());         // the pose drawn at the last frame
  const homing = useRef(null);              // the glide back to the start square, while there is one
  const sync = useRef(null);                // keeps the robot's program equal to the cards (robot/sync.js)
  const syncCallbacks = useRef({});
  const S = useRef({});
  // The colours of the ground are those of the virtual robot's world. A real robot reads the real floor, which the page cannot
  // know: with one connected nothing painted or pictured is shown or used, and the mat is greyed.
  const activeFloor = useMemo(() => (ground && !live ? floor : EMPTY_FLOOR), [ground, live, floor]);
  // The picture is the ground of the virtual robot only: with a real robot connected (which reads the real ground)
  // it is not shown and not read, so that it cannot be taken for the robot's own.
  const cells = scan && map && mapImage && scan.url === mapImage.url && scan.cols === map.cols && scan.rows === map.rows ? scan.cells : null;
  const mapPicture = useMemo(() => (map && mapImage ? { url: mapImage.url, ...map, cells } : null), [map, mapImage, cells]);
  const picture = live ? null : mapPicture;
  // The colour of the ground at a cell of the robot's frame: what the brush painted, else what the picture has there.
  const colourAt = useMemo(() => {
    if (!ground || live) return null;
    return groundAt(activeFloor, live ? null : cells, map ? map.sx : 0, map ? map.sy : 0);
  }, [ground, activeFloor, live, cells, map]);
  S.current = { cards, program, phase, live, speed, selected, syncing, modeUp, floor: activeFloor, colourAt, brush, map, mapKind, placing, kinds, qr };

  useEffect(() => { setSoundEnabled(sound); save('cards.sound', sound ? '1' : '0'); }, [sound]);
  useEffect(() => { save('cards.name', name); }, [name]);
  useEffect(() => { save('cards.mode', mode); }, [mode]);
  useEffect(() => { save('cards.custom', JSON.stringify(picked)); }, [picked]);
  useEffect(() => { if (!ground) setBrush(null); }, [ground]);
  useEffect(() => { save('cards.floor', JSON.stringify(floor)); }, [floor]);
  useEffect(() => { save('cards.map', JSON.stringify(map)); }, [map]);
  useEffect(() => { save('cards.mapkind', mapKind); }, [mapKind]);
  useEffect(() => { if (phase !== 'idle' || live) setPlacing(false); }, [phase, live]);

  // A picture the adult chose comes back from the browser's storage; without it, a plain mat.
  useEffect(() => {
    if (mapKind !== 'custom') return undefined;
    let alive = true, url = null;
    loadImage().then((rec) => {
      if (!alive || S.current.mapKind !== 'custom') return;          // (the adult asked for something else in the meantime)
      if (!rec) { setMapKind('none'); return; }
      url = URL.createObjectURL(rec.blob);
      setCustom({ url, w: rec.w, h: rec.h });
    });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, []);

  // What the picture is made of, square by square, again when the picture or the squares it covers change.
  const mapUrl = mapImage ? mapImage.url : null, mapCols = map ? map.cols : 0, mapRows = map ? map.rows : 0;
  useEffect(() => {
    if (!mapUrl || !mapCols) { setScan(null); return undefined; }
    let alive = true;
    scanPicture(mapUrl, mapCols, mapRows).then(
      (found) => { if (alive) setScan({ url: mapUrl, cols: mapCols, rows: mapRows, cells: found }); },
      () => { if (alive) setScan(null); },
    );
    return () => { alive = false; };
  }, [mapUrl, mapCols, mapRows]);
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
        setDoneUpTo((d) => (e.index <= d ? e.index - 1 : d));        // a card done again (a repeat): not done any more
        anim.current.onStep(e.index, e.code, performance.now());
        sfx('pick', e.code);
        break;
      case 'moved': setDoneUpTo(e.index); anim.current.onMoved(e.index); break;
      case 'sense':                                                   // an "if" is looking at the ground
        setCursor(e.index);
        setDoneUpTo((d) => (e.index <= d ? e.index - 1 : d));
        break;
      case 'if':                                                      // the ground was read: the card is done (it has no "moved"), not active
        setCheck({ index: e.index, taken: e.taken, key: Date.now() });
        setCursor(-1);
        setDoneUpTo((d) => Math.max(d, e.index));
        break;
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
      onState: ({ syncing: on, modeUp: up, failed }) => { setSyncing(on); setModeUp(up); setStartFailed(Boolean(failed)); },
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
      let leds;
      if (!s.live) {
        sim.current.advance(dt * s.speed);
        const l = sim.current.leds();
        leds = { pulse: l && sim.current.running ? l.front[0] / 16 : 0, circle: l && sim.current.running ? l.circle : [] };
      } else {
        leds = anim.current.leds(now);
        if (s.phase !== 'playing') leds = { pulse: 0, circle: [] };
      }
      // Where the robot is. Sent back to the start square (the cards were touched), it does not jump
      // there: the mat glides and turns back under it, and the robot gives a little pop when it arrives.
      let pose;
      if (home.current) {
        if (!wasHome.current && !reduceMotion() && Homing.needed(shown.current)) homing.current = new Homing(shown.current, now);
        pose = homePose();
        if (homing.current) {
          const h = homing.current.at(now);
          if (h.done) { homing.current = null; stageRef.current?.arrive(); } else pose = h.pose;
        }
      } else {
        homing.current = null;
        pose = s.live ? anim.current.pose(now) : sim.current.pose();
      }
      wasHome.current = home.current;
      shown.current = pose;
      stageRef.current?.setPose(pose, leds);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- editing the program ---------------------------------------------------------------------
  const edited = useCallback((keepSelection) => {
    setDoneNote(false);
    setDoneUpTo(-1);
    setCursor(-1);
    if (keepSelection !== true) setSelected(null);
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
    const where = Math.max(0, Math.min(S.current.cards.length, at ?? S.current.cards.length));
    setCards((cs) => { const i = Math.max(0, Math.min(cs.length, at ?? cs.length)); return [...cs.slice(0, i), mk(code), ...cs.slice(i)]; });
    sfx('drop', code);
    edited();
    if (isRepeat(code) || isColor(code) || isWhile(code)) setSelected(where);      // a card with a value: its choices are there at once
  }, [edited, refuseWhenFull]);

  // The value of a repeat ("2".."9") or of an "if" (a colour) card: the card stays selected, to be changed again.
  const setCode = useCallback((i, code) => {
    setCards((cs) => cs.map((c, k) => (k === i ? { ...c, code } : c)));
    sfx('pick', code);
    edited(true);
  }, [edited]);

  // The brush: a touch on the mat paints that cell of the virtual floor, or clears it (the same colour again, or the eraser).
  const paintFloor = useCallback((cell) => {
    const b = S.current.brush;
    if (!b) return;
    sfx('pick', 'F');
    setFloor((f) => {
      const key = `${cell.x},${cell.y}`;
      const next = { ...f };
      if (b === 'erase' || f[key] === b) delete next[key]; else next[key] = b;
      return next;
    });
  }, []);

  // The picture under the grid. The robot's own frame stays the frame of the program (its start square is
  // (0, 0)), so when the start square moves on the picture, what was painted or planted is moved the other
  // way: it stays on the same square of the picture.
  const changeMap = useCallback((patch) => {
    const cur = S.current.map;
    const next = cleanMap({ ...cur, ...patch });
    setMap(next);
    if (cur && (next.sx !== cur.sx || next.sy !== cur.sy)) {
      setFloor((f) => shiftCells(f, cur.sx - next.sx, cur.sy - next.sy));
      setTarget((tg) => shiftPoint(tg, cur.sx - next.sx, cur.sy - next.sy));
      edited();
    }
  }, [edited]);

  const pickMapFile = useCallback(async (file) => {
    const mine = ++mapRequest.current;
    const prepared = await prepareImage(file);                       // rejects when the file is not a picture
    if (mine !== mapRequest.current) return;                         // another choice was made while it was prepared (a photo takes seconds on a tablet)
    const rec = { blob: prepared.blob, w: prepared.w, h: prepared.h };
    await saveImage(rec);
    if (mine !== mapRequest.current) return;                         // (a choice made while it was saved clears it after this save)
    const url = URL.createObjectURL(rec.blob);
    setCustom((old) => { if (old) URL.revokeObjectURL(old.url); return { url, w: rec.w, h: rec.h }; });
    setMapKind('custom');
    const cols = S.current.map.cols;
    const rows = suggestRows(cols, rec.w, rec.h);
    setMap(cleanMap({ cols, rows, ...centerCell(cols, rows) }));      // a new picture: the robot in the middle of it; the floor and the flag stay where they are around the robot
    setPlacing(false);
  }, []);

  const sizeMap = useCallback((patch) => changeMap(patch), [changeMap]);
  const keepProportions = useCallback(() => {
    const img = mapImage, cur = S.current.map;
    if (img && cur) changeMap({ rows: suggestRows(cur.cols, img.w, img.h) });
  }, [mapImage, changeMap]);
  const recentreRobot = useCallback(() => {
    const cur = S.current.map;
    if (cur) changeMap(centerCell(cur.cols, cur.rows));
  }, [changeMap]);
  const forgetCustom = useCallback(() => {
    clearImage();
    setCustom((old) => { if (old) URL.revokeObjectURL(old.url); return null; });
    setPlacing(false);
  }, []);
  const removeMap = useCallback(() => { mapRequest.current++; forgetCustom(); setMapKind('none'); }, [forgetCustom]);                       // a plain mat
  const thymioMap = useCallback(() => { mapRequest.current++; forgetCustom(); setMapKind('builtin'); setMap(THYMIO_MAP); }, [forgetCustom]);   // the map of the Thymio town
  // ---- the QR code of the page: what it shows, and what a scanned one sets up (share.js) -----------
  const showQr = () => setQr({ show: encodeConfig({ lang, sound, speed, mode, picked, showPath, program, target, floor, mapKind, map }), caption: { name: name.trim(), when: formatWhen(new Date(), lang) } });
  const showLink = useCallback((kind) => { if (APP_LINKS[kind]) { setPanel(false); setQr({ show: APP_LINKS[kind], link: kind }); } }, []);   // from the settings: the link to the demo, for the tablets of the class
  const scanQr = useCallback(() => { if (S.current.phase === 'idle') { setPlacing(false); setPanel(false); setQr({ scan: true }); } }, []);
  const applyScanned = useCallback((text) => {
    const cfg = decodeConfig(text);
    if (!cfg || S.current.phase !== 'idle') { sfx('oops'); return false; }
    if (cfg.lang) setLang(cfg.lang);
    if (cfg.sound !== undefined) setSound(cfg.sound);
    if (cfg.speed) setSpeed(cfg.speed);
    if (cfg.mode) setMode(cfg.mode);
    if (cfg.picked) setPicked(cfg.picked);
    if (cfg.showPath !== undefined) setShowPath(cfg.showPath);
    if (cfg.program !== undefined) setCards(toCards(cfg.program));
    if (cfg.target !== undefined) setTarget(cfg.target);
    if (cfg.floor) setFloor(cfg.floor);
    const plan = mapPlan(cfg.map, S.current.mapKind);
    if (plan) {
      mapRequest.current++;
      if (plan.kind === 'none') { clearImage(); setCustom((old) => { if (old) URL.revokeObjectURL(old.url); return null; }); setMapKind('none'); }
      else if (plan.kind === 'builtin') { clearImage(); setCustom((old) => { if (old) URL.revokeObjectURL(old.url); return null; }); setMapKind('builtin'); setMap(plan.geometry ? cleanMap(plan.geometry) : THYMIO_MAP); }
      else if (plan.geometry) setMap(cleanMap(plan.geometry));
    }
    setBrush(null);
    setPlacing(false);
    edited();
    sfx('done');
    setTimeout(() => setQr(null), 700);                   // the frame goes green for a moment
    return true;
  }, [edited]);

  const startPlacing = useCallback(() => {
    if (S.current.phase !== 'idle' || S.current.live || S.current.mapKind === 'none') return;
    setPanel(false);
    setBrush(null);
    setPlacing(true);
  }, []);

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

  // The two shortcuts that have no button on the main screen (the keys D and R, and the buttons of the
  // settings page, for a smartphone without a keyboard): show or hide the path, robot back to the start.
  const togglePath = useCallback(() => setShowPath((v) => !v), []);
  const resetRobot = useCallback(() => {
    if (S.current.phase !== 'idle') return;
    edited();
    sfx('pick', 'L');
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

  const loadExample = useCallback((ex) => {
    setCards(toCards(ex.program));
    if (ex.floor) setFloor(Object.fromEntries(ex.floor.map(([x, y, c]) => [`${x},${y}`, c])));     // the floor the example is made for
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
      sim.current.play(s.program, s.colourAt || (() => undefined));
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
  const enabled = phase === 'idle' && !panel && !placing;
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
      if (S.current.qr) { if (e.key === 'Escape') setQr(null); return; }
      if (panel || confirmDisc || e.metaKey || e.ctrlKey || e.altKey) return;
      if (S.current.placing) {                       // the robot is being placed: Enter or Esc is done, nothing else
        if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); setPlacing(false); }
        return;
      }
      const onButton = e.target?.tagName === 'BUTTON';
      const map = { ArrowUp: 'F', ArrowDown: 'B', ArrowLeft: 'L', ArrowRight: 'R' };
      if (map[e.key]) { if (S.current.phase === 'idle' && S.current.kinds.includes(map[e.key])) { e.preventDefault(); append(map[e.key]); } }
      else if (e.key === 'Enter' && !onButton) { e.preventDefault(); go(); }
      else if ((e.key === 'Backspace' || e.key === 'Delete') && S.current.phase === 'idle') { e.preventDefault(); eraseLast(); }
      else if (e.key === 'd' || e.key === 'D') togglePath();
      else if (e.key === 'r' || e.key === 'R') resetRobot();
      else if (e.key === 'Escape') stop();
    };
    const onDown = (e) => { if (!e.target.closest?.('.slot, .picker')) setSelected(null); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [panel, confirmDisc, append, go, stop, eraseLast, togglePath, resetRobot]);

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
    <div className={`app ${phase !== 'idle' ? 'running' : ''} ${live ? 'is-live' : 'is-sim'} ${placing ? 'placing' : ''}`}>
      <TopBar t={t} conn={conn} live={live} bluetooth={bluetooth} busy={phase !== 'idle'} syncing={syncing} modeUp={modeUp} failed={startFailed} onConnect={connect} onPanel={() => setPanel(true)} onShowQr={showQr} onScanQr={scanQr} canScan={phase === 'idle'} name={name.trim()} />
      <main className="board">
        <section className="left">
          <Stage
            ref={stageRef} program={program} cursor={cursor} doneUpTo={doneUpTo}
            showPath={showPath && !(live && hasGroundCards(program))} target={target} canPlace={phase === 'idle' && !panel && !confirmDisc}
            onTarget={(cell) => setTarget((cur) => (cur && cur.x === cell.x && cur.y === cell.y ? null : cell))}
            overlay={overlay} celebrate={celebrate && finished ? celebrate : 0} t={t} kind={live ? 'live' : 'sim'}
            floor={activeFloor} colourAt={colourAt} ground={ground && !live} unknownGround={live && hasGroundCards(program)} brush={brush} onBrush={setBrush} onFloor={paintFloor}
            picture={picture} placing={placing} onPlace={changeMap} onPlaced={() => setPlacing(false)} onRecentre={recentreRobot}
          />
        </section>
        <section className="right">
          <Track
            ref={trackRef} cards={cards} cursor={cursor} doneUpTo={doneUpTo} selected={selected} phase={phase}
            dragFrom={drag?.kind === 'move' ? drag.from : null} dropIndex={drag ? drag.target : null}
            onPointerDown={onPointerDown} onRemove={removeAt} onSetCode={setCode} check={check} t={t} shake={shake} kinds={kinds}
          />
          <div className="dock">
            <Palette onPointerDown={onPointerDown} onKeyTap={append} t={t} disabled={!enabled} codes={paletteCodes(kinds)} />
            <Dock
              eraserRef={eraserRef} canErase={enabled && cards.length > 0} running={phase !== 'idle'} canGo={cards.length > 0 && phase === 'idle' && !placing}
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
      {qr && qr.show !== undefined && <QrShow text={qr.show} t={t} label={qr.link ? { web: t.qr.link, ios: t.qr.linkIos }[qr.link] : t.qr.show} caption={qr.caption} onClose={() => setQr(null)} />}
      {qr && qr.scan && <QrScan t={t} onText={applyScanned} onClose={() => setQr(null)} />}
      {confirmDisc && <ConfirmDisconnect t={t} onYes={disconnect} onNo={() => setConfirmDisc(false)} />}
      {panel && (
        <Panel
          t={t} lang={lang} onLang={setLang} sound={sound} onSound={setSound} speed={speed} onSpeed={setSpeed}
          live={live} bluetooth={bluetooth} conn={conn} cal={cal} program={program} lastError={lastError}
          log={log} onClearLog={() => setLog([])} onTest={testRobot} testing={testing} canTest={live && phase === 'idle'}
          showPath={showPath} onTogglePath={togglePath} canReset={phase === 'idle'} onResetRobot={resetRobot} mode={mode} onMode={setMode} kinds={kinds} custom={picked} onToggleCard={(k) => setPicked((c) => toggleKind(c, k))}
          picture={mapPicture} mapImage={mapImage} mapKind={mapKind} onMapThymio={thymioMap} canPlace={phase === 'idle' && !live} onMapFile={pickMapFile} onMapSize={sizeMap} onMapRatio={keepProportions}
          onMapPlace={startPlacing} onMapRecentre={recentreRobot} onMapRemove={removeMap}
          name={name} onName={(v) => setName(cleanName(v))} onNewName={() => setName(randomName(lang))} onShowLink={showLink} onExample={loadExample} onConnect={() => { setPanel(false); connect(); }} onDisconnect={disconnect} onClose={() => setPanel(false)}
        />
      )}
    </div>
  );
}
