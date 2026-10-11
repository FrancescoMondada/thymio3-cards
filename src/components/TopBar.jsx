import React from 'react';
import { BatteryIcon, ConnectIcon, RobotIcon } from '../icons.jsx';

// No words: the logo, which is also the way to the grown-ups' page (settings), and the robot (grey
// and waiting, in colour with a tick once it is connected, waves moving while it is given the cards).
export default function TopBar({ t, conn, live, bluetooth, busy, syncing, modeUp, onConnect, onPanel }) {
  const connecting = conn.status === 'connecting';
  // connected: the mode runs on the robot ('on'), it is being given the cards ('sync'), or it is not running ('standby')
  const state = !bluetooth ? 'no' : live ? (syncing ? 'sync' : modeUp ? 'on' : 'standby') : connecting ? 'wait' : 'off';
  const label = connecting ? t.robot.connecting
    : live ? (conn.device || t.robot.connected)
    : conn.status === 'reconnect' ? t.robot.reconnect
    : t.robot.connect;
  const level = conn.battery ? Math.max(0.1, Math.min(1, (conn.battery - 3.3) / 0.9)) : null;
  return (
    <header className="top">
      <button className="logo" onClick={onPanel} aria-label={t.panel.title}><RobotIcon /></button>
      <div className="spacer" />
      <button
        className={`robot-btn ${state} ${live ? 'live' : ''}`}
        onClick={onConnect}
        disabled={connecting || busy}
        aria-label={label}
      >
        <ConnectIcon state={state} />
        {live && level != null && <span className="bat"><BatteryIcon level={level} /></span>}
      </button>
    </header>
  );
}
