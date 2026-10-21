import React from 'react';
import { BatteryIcon, ConnectIcon, QrIcon, RobotIcon, ScanIcon } from '../icons.jsx';

// No words: the logo, which is also the way to the grown-ups' page (settings), next to it the button that shows the QR code of
// the page and the blue one that scans the QR code of another page, and on the right the robot (grey
// and waiting, in colour with a tick once it is connected, waves moving while it is given the cards).
export default function TopBar({ t, conn, live, bluetooth, busy, syncing, modeUp, failed, onConnect, onPanel, onShowQr, onScanQr, canScan }) {
  const connecting = conn.status === 'connecting';
  // One stage, not two: the tick and the battery come together, when the robot is ready (its mode runs
  // and has told its battery). Until then the robot is still being reached: the waves move.
  const ready = live && conn.battery > 0;
  const starting = live && !ready && !failed;
  // ready: the mode runs on the robot ('on'), it is being given the cards ('sync'), or it is not running ('standby')
  const state = !bluetooth ? 'no'
    : live ? (starting ? 'wait' : !ready ? 'standby' : syncing ? 'sync' : modeUp ? 'on' : 'standby')
    : connecting ? 'wait' : 'off';
  const label = connecting || starting ? t.robot.connecting
    : live ? (conn.device || t.robot.connected)
    : conn.status === 'reconnect' ? t.robot.reconnect
    : t.robot.connect;
  const level = conn.battery ? Math.max(0.1, Math.min(1, (conn.battery - 3.3) / 0.9)) : null;
  return (
    <header className="top">
      <button className="logo" onClick={onPanel} aria-label={t.panel.title}><RobotIcon /></button>
      <button className="top-btn" onClick={onShowQr} aria-label={t.qr.show}><QrIcon /></button>
      <button className="top-btn scan" onClick={onScanQr} disabled={!canScan} aria-label={t.qr.scan}><ScanIcon /></button>
      <div className="spacer" />
      <button
        className={`robot-btn ${state} ${ready ? 'live' : ''}`}
        onClick={onConnect}
        disabled={connecting || busy}
        aria-label={label}
      >
        <ConnectIcon state={state} tick={ready} />
        {ready && level != null && <span className="bat"><BatteryIcon level={level} /></span>}
      </button>
    </header>
  );
}
