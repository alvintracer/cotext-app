import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './index.css';

// ─── Service-worker lifecycle (white-screen fix, v1.0.26) ──────────────────
// The Capacitor WebView (Android default `https://localhost`) lets the PWA
// service worker register and persist across APK upgrades. When the user
// installs a new APK, the old SW intercepts requests for new hashed chunks
// that no longer exist in the bundle → blank screen on launch (v1.0.25).
//
// Fix: register the SW only on the real web. On native, aggressively
// unregister any persisted SW and wipe caches so a single launch of v1.0.26
// self-heals an already-broken install.
const isNative = Capacitor.isNativePlatform();
if ('serviceWorker' in navigator) {
  if (isNative) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => { /* best effort — never block boot */ });
    if (typeof caches !== 'undefined') {
      caches.keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => { /* best effort */ });
    }
  } else {
    // Defer registration so it never competes with first paint.
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .catch((err) => console.warn('[sw] register failed:', err));
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
