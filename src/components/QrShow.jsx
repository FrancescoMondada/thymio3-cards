import React, { useMemo } from 'react';
import { CloseIcon, WarnIcon } from '../icons.jsx';
import { qrMatrix, qrPath } from '../qr.js';

// The QR code of the page, over the whole application and as large as the screen allows, for the other
// screens of the class to scan. A touch anywhere (or Esc) puts it away.
export default function QrShow({ text, t, onClose }) {
  const code = useMemo(() => qrMatrix(text), [text]);
  const quiet = 4;
  return (
    <div className="qr-back" role="dialog" aria-modal="true" aria-label={t.qr.show} onClick={onClose}>
      {code ? (
        <svg className="qr-code" viewBox={`${-quiet} ${-quiet} ${code.size + 2 * quiet} ${code.size + 2 * quiet}`} shapeRendering="crispEdges" role="img" aria-label={t.qr.show}>
          <rect x={-quiet} y={-quiet} width={code.size + 2 * quiet} height={code.size + 2 * quiet} fill="#fff" />
          <path d={qrPath(code)} fill="#000" />
        </svg>
      ) : (
        <div className="qr-problem" role="alert"><WarnIcon /><p>{t.qr.tooBig}</p></div>
      )}
      <button className="qr-close" onClick={onClose} aria-label={t.qr.close}><CloseIcon /></button>
    </div>
  );
}
