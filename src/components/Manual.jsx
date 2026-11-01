import React, { useEffect } from 'react';
import { CloseIcon } from '../icons.jsx';
import { KeysArt, GoArt, StopArt, EraseArt } from './ManualArt.jsx';

// The manual of the robot on its own (no tablet): its buttons and the remote control that has the same, how to start the program, how to
// stop it, how to erase it. Over the whole application, ONE page that fits the screen (no scrolling) and shows a class what to do: four
// drawings, almost no words.
// Esc or the cross puts it away.
function Card({ title, art }) {
  return (
    <section className="m-card">
      <h3>{title}</h3>
      <div className="m-art">{art}</div>
    </section>
  );
}

export default function Manual({ t, onClose }) {
  const m = t.manual;
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="manual-back" role="dialog" aria-modal="true" aria-label={m.title}>
      <div className="manual">
        <header>
          <h2>{m.title}</h2>
          <button className="manual-close" onClick={onClose} aria-label={m.close}><CloseIcon /></button>
        </header>
        <div className="manual-grid">
          <Card title={m.keys.title} art={<KeysArt labels={m.keys} or={m.or} />} />
          <Card title={m.go.title} art={<GoArt or={m.or} />} />
          <Card title={m.stop.title} art={<StopArt or={m.or} />} />
          <Card title={m.erase.title} art={<EraseArt labels={m.erase} or={m.or} />} />
        </div>
      </div>
    </div>
  );
}
