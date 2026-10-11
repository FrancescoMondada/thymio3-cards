import React from 'react';
import { RefreshIcon, WarnIcon } from '../icons.jsx';

// If something goes wrong, the screen must not just go blank: a warning and a big button that loads
// the page again. The details are in the console (and in the settings, once it is back).
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error, info) {
    console.error('[cards] the interface failed', error, info?.componentStack);
    try { localStorage.setItem('cards.lastCrash', `${error?.name}: ${error?.message}`); } catch { /* private mode */ }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash" role="alert">
        <div className="sign"><WarnIcon /></div>
        <button className="again" onClick={() => window.location.reload()} aria-label="Reload"><RefreshIcon /></button>
      </div>
    );
  }
}
