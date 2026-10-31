import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BluetoothOffIcon, CheckIcon, CloseIcon, DiceIcon, FlagIcon, MapIcon, PathIcon, QrIcon, TargetIcon } from '../icons.jsx';
import { LANGS } from '../i18n.js';
import { EXAMPLES } from '../program.js';
import { cardClass } from '../spec.js';
import { CARD_KINDS, MODES, NORMAL_KINDS, PALETTE_CODE, fitsCards } from '../modes.js';
import { THYMIO_MAP } from '../worldmap.js';
import { APP_URL } from '../share.js';
import { NAME_MAX } from '../names.js';
import { buildRobotScript } from '../script.js';
import { ArrowIcon } from '../icons.jsx';

const SPEEDS = [1, 2, 4];

// A number of squares: it can be emptied while typing, and goes back to the real value when left.
function SizeField({ value, label, onCommit }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <input
      type="text" inputMode="numeric" pattern="[0-9]*" aria-label={label} value={text}
      onChange={(e) => { setText(e.target.value); const n = parseInt(e.target.value, 10); if (n >= 1) onCommit(n); }}
      onBlur={() => setText(String(value))}
    />
  );
}
const BLUEFY_URL = 'https://apps.apple.com/app/id1492822055';   // a browser with Web Bluetooth, for iPhone and iPad

// The page for the adult: language, sounds, the robot, examples, and the Python that runs.
export default function Panel({
  t, lang, onLang, sound, onSound, speed, onSpeed, live, bluetooth, conn, cal, program, lastError,
  showPath, onTogglePath, canReset, onResetRobot, mode = 'normal', onMode, kinds = NORMAL_KINDS, custom = NORMAL_KINDS, onToggleCard,
  picture, mapImage, mapKind, onMapThymio, canPlace, onMapFile, onMapSize, onMapRatio, onMapPlace, onMapRecentre, onMapRemove,
  name = '', onName, onNewName, showName = true, onShowName, log, onClearLog, onTest, testing, canTest, onShowLink, onExample, onConnect, onDisconnect, onClose,
}) {
  const [showScript, setShowScript] = useState(false);
  const [copied, setCopied] = useState(false);
  const logText = useMemo(() => {
    const t0 = log.length ? log[0].at : 0;
    const mark = { in: '⇦', out: '⇨', err: '✖', info: '·' };
    return log.map((l) => `+${((l.at - t0) / 1000).toFixed(2).padStart(7)}s ${mark[l.kind] || '·'} ${l.text}`).join('\n');
  }, [log]);
  const logBox = useRef(null);
  useEffect(() => { if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight; }, [logText]);
  const [logCopied, setLogCopied] = useState(false);
  const [mapBad, setMapBad] = useState(false);
  const fileInput = useRef(null);
  const chooseFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';                                  // the same file can be chosen again
    if (!file) return;
    setMapBad(false);
    try { await onMapFile(file); } catch { setMapBad(true); }
  };
  const copyLog = async () => {
    try { await navigator.clipboard.writeText(logText); setLogCopied(true); setTimeout(() => setLogCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  const script = showScript ? buildRobotScript(program, { autoplay: true, minified: false }) : '';

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(script); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([script], { type: 'text/x-python' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'thymio3_sequence_mode.py' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="panel-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="panel" role="dialog" aria-modal="true" aria-label={t.panel.title}>
        <header>
          <h2>{t.panel.title}</h2>
          <button className="close" onClick={onClose} aria-label={t.panel.close}><CloseIcon /></button>
        </header>

        {!bluetooth && (
          <div className="nobt" role="alert">
            <span className="nobt-icon"><BluetoothOffIcon /></span>
            <div>
              <b>{t.panel.noBluetoothTitle}</b>
              <p>{t.panel.noBluetooth}</p>
              <a className="nobt-link" href={BLUEFY_URL} target="_blank" rel="noopener noreferrer">Bluefy · App Store</a>
            </div>
          </div>
        )}

        <div className="rows">
          <div className="row">
            <label>{t.panel.language}</label>
            <div className="seg-ctl">
              {LANGS.map((l) => (
                <button key={l.id} className={lang === l.id ? 'on' : ''} onClick={() => onLang(l.id)}>{l.label}</button>
              ))}
            </div>
          </div>
          <div className="row">
            <label>{t.panel.sound}</label>
            <div className="seg-ctl">
              <button className={sound ? 'on' : ''} onClick={() => onSound(true)}>{t.panel.on}</button>
              <button className={!sound ? 'on' : ''} onClick={() => onSound(false)}>{t.panel.off}</button>
            </div>
          </div>
          <div className="row">
            <label>{t.qr.linkRow}</label>
            <div className="quick">
              <button className="tile-btn" onClick={() => onShowLink('web')}><QrIcon /><span>{t.qr.linkButton}</span></button>
              <button className="tile-btn" onClick={() => onShowLink('ios')}><QrIcon /><span>{t.qr.linkIos}</span></button>
            </div>
          </div>
          <p className="hint">{t.qr.linkHint} <a className="app-link" href={APP_URL} target="_blank" rel="noopener noreferrer">{APP_URL.replace(/^https:\/\//, '')}</a></p>
          <div className="row">
            <label htmlFor="qr-name">{t.qr.nameRow}</label>
            <div className="name-field">
              <input id="qr-name" type="text" value={name} maxLength={NAME_MAX} autoComplete="off" spellCheck="false" aria-label={t.qr.nameField} onChange={(e) => onName(e.target.value)} />
              <button className="tile-btn" onClick={onNewName} aria-label={t.qr.nameDraw} title={t.qr.nameDraw}><DiceIcon /></button>
            </div>
          </div>
          <div className="row">
            <label>{t.qr.nameShow}</label>
            <div className="seg-ctl">
              <button className={showName ? 'on' : ''} aria-pressed={showName} onClick={() => onShowName(true)}>{t.panel.on}</button>
              <button className={!showName ? 'on' : ''} aria-pressed={!showName} onClick={() => onShowName(false)}>{t.panel.off}</button>
            </div>
          </div>
          <p className="hint">{t.qr.nameHint}</p>
          <div className="row">
            <label>{t.panel.quick}</label>
            <div className="quick">
              <button className={`tile-btn ${showPath ? 'on' : ''}`} aria-pressed={Boolean(showPath)} onClick={() => { onTogglePath(); onClose(); }}>
                <PathIcon /><span>{t.panel.pathBtn}</span>
              </button>
              <button className="tile-btn reset" disabled={!canReset} onClick={() => { onResetRobot(); onClose(); }}>
                <FlagIcon /><span>{t.panel.resetBtn}</span>
              </button>
            </div>
          </div>
          <div className="row">
            <label>{t.panel.mode}</label>
            <div className="seg-ctl">
              {MODES.map((m) => <button key={m} className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => onMode(m)}>{t.panel.modes[m]}</button>)}
            </div>
          </div>
          <p className="hint">{t.panel.modeHints[mode]}</p>
          {mode === 'custom' && (
            <div className="custom-cards" role="group" aria-label={t.panel.customCards}>
              {CARD_KINDS.map((k) => {
                const on = custom.includes(k), code = PALETTE_CODE[k];
                return (
                  <button
                    key={k} className={`custom-card ${cardClass(code)} ${on ? 'on' : ''}`} aria-pressed={on} aria-label={t.card[k]} title={t.card[k]}
                    disabled={on && custom.length === 1} onClick={() => onToggleCard(k)}
                  >
                    <ArrowIcon code={code} />
                    {on && <span className="tick" aria-hidden="true"><CheckIcon /></span>}
                  </button>
                );
              })}
            </div>
          )}
          {!live && (
            <div className="row">
              <label>{t.panel.speed}</label>
              <div className="seg-ctl">
                {SPEEDS.map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => onSpeed(s)}>×{s}</button>)}
              </div>
            </div>
          )}
        </div>

        <h3>{t.map.title}</h3>
        <p className="hint">{t.map.hint}</p>
        {live && <p className="warn" role="status">{t.map.virtualOnly}</p>}
        <div className="map-box">
          <div className="map-top">
            {picture && mapImage && <img className="map-thumb" src={mapImage.url} alt="" />}
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={chooseFile} />
            <button className="tile-btn" onClick={() => fileInput.current?.click()}><MapIcon /><span>{mapKind === 'custom' ? t.map.change : t.map.choose}</span></button>
            {(mapKind !== 'builtin' || (picture && (picture.cols !== THYMIO_MAP.cols || picture.rows !== THYMIO_MAP.rows))) && <button className="tile-btn" onClick={onMapThymio}><MapIcon /><span>{t.map.builtin}</span></button>}
          </div>
          {mapBad && <p className="warn" role="alert">{t.map.bad}</p>}
          {picture && (
            <>
              <div className="row">
                <label>{t.map.size}</label>
                <div className="size">
                  <SizeField value={picture.cols} label={t.map.cols} onCommit={(n) => onMapSize({ cols: n })} />
                  <span aria-hidden="true">×</span>
                  <SizeField value={picture.rows} label={t.map.rows} onCommit={(n) => onMapSize({ rows: n })} />
                  <button className="plain" onClick={onMapRatio}>{t.map.ratio}</button>
                </div>
              </div>
              <div className="quick">
                <button className="tile-btn" disabled={!canPlace} onClick={onMapPlace}><TargetIcon /><span>{t.map.place}</span></button>
                <button className="tile-btn" onClick={onMapRecentre}><FlagIcon /><span>{t.map.recentre}</span></button>
                <button className="tile-btn" onClick={onMapRemove}><CloseIcon /><span>{t.map.remove}</span></button>
              </div>
            </>
          )}
        </div>

        <h3>{t.panel.examples}</h3>
        <div className="examples">
          {EXAMPLES.filter((ex) => fitsCards(ex.program, kinds)).map((ex) => (
            <button key={ex.id} onClick={() => onExample(ex)}>
              <span className="mini">{ex.program.split('').map((c, i) => <span key={i} className={cardClass(c)}><ArrowIcon code={c} /></span>)}</span>
              <b>{t.examples[ex.id]}</b>
            </button>
          ))}
        </div>

        <h3>{t.panel.robot}</h3>
        {lastError && <p className="warn"><b>{t.panel.lastError}</b><br />{lastError}</p>}
        {live ? (
          <dl className="facts">
            <dt>{t.panel.device}</dt><dd>{conn.device}</dd>
            {conn.firmware && <><dt>{t.panel.firmware}</dt><dd>{typeof conn.firmware === 'string' ? conn.firmware : JSON.stringify(conn.firmware)}</dd></>}
            {conn.battery ? <><dt>{t.panel.battery}</dt><dd>{conn.battery.toFixed(2)} V</dd></> : null}
            {cal ? <><dt>{t.panel.calib}</dt><dd>{(cal.fw / 5000).toFixed(0)} ms / {(cal.bw / 5000).toFixed(0)} ms</dd></> : null}
          </dl>
        ) : null}
        {live && <button className="plain" onClick={onDisconnect}>{t.panel.disconnect}</button>}
        {!live && bluetooth && (
          <>
            <p className="hint">{t.robot.virtualHint}</p>
            <button className="plain" onClick={onConnect}>{t.robot.connect}</button>
          </>
        )}

        <h3>{t.panel.log}</h3>
        <p className="hint">{t.panel.logHint}</p>
        <div className="script-actions">
          <button className="plain" onClick={onTest} disabled={!canTest || testing}>{testing ? t.panel.logTesting : t.panel.logTest}</button>
          <button className="plain" onClick={copyLog} disabled={!log.length}>{logCopied ? t.panel.copied : t.panel.logCopy}</button>
          <button className="plain" onClick={onClearLog} disabled={!log.length}>{t.panel.logClear}</button>
        </div>
        {live && <p className="hint">{t.panel.logTestHint}</p>}
        <pre className="script log" ref={logBox} tabIndex={0}>{logText || t.panel.logEmpty}</pre>

        <h3>{t.panel.script}</h3>
        <p className="hint">{t.panel.scriptHint}</p>
        <div className="script-actions">
          <button className="plain" onClick={() => setShowScript((v) => !v)}>{showScript ? '▾' : '▸'} sequence_mode.py</button>
          {showScript && <><button className="plain" onClick={copy}>{copied ? t.panel.copied : t.panel.copy}</button><button className="plain" onClick={download}>{t.panel.download}</button></>}
        </div>
        {showScript && <pre className="script" tabIndex={0}>{script}</pre>}

        <h3>{t.panel.shortcutsTitle}</h3>
        <dl className="keys">
          {t.panel.shortcuts.map(([k, what]) => (
            <React.Fragment key={k}><dt><kbd>{k}</kbd></dt><dd>{what}</dd></React.Fragment>
          ))}
        </dl>

        <p className="about">{t.panel.mapHelp}</p>
        <p className="about">{t.panel.about}</p>
      </section>
    </div>
  );
}
