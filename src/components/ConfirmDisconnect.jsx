import React, { useEffect } from 'react';
import { ArrowRightIcon, CheckIcon, CloseIcon, ConnectIcon } from '../icons.jsx';

// "Disconnect the robot?", without a word: the connected robot becomes the grey one; the cross keeps
// it connected, the tick disconnects.
export default function ConfirmDisconnect({ t, onYes, onNo }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onNo(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onNo]);
  return (
    <div className="confirm-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onNo(); }}>
      <div className="confirm" role="alertdialog" aria-label={t.robot.disconnectAsk}>
        <div className="change" aria-hidden="true">
          <ConnectIcon state="on" /><ArrowRightIcon /><ConnectIcon state="off" />
        </div>
        <div className="choices">
          <button className="no" onClick={onNo} aria-label={t.robot.keep} autoFocus><CloseIcon /></button>
          <button className="yes" onClick={onYes} aria-label={t.robot.disconnect}><CheckIcon /></button>
        </div>
      </div>
    </div>
  );
}
