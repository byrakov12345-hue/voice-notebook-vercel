import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

const SW_VERSION = '2026-05-11-notes-fix-2';
const SW_VERSION_KEY = 'smart_notebook_sw_version';
const HARD_RESET_KEY = 'smart_notebook_hard_reset_2026_05_13';

async function hardResetOldClientCaches() {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(HARD_RESET_KEY) === '1') return false;
    sessionStorage.setItem(HARD_RESET_KEY, '1');
  } catch {}

  let changed = false;
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg => reg.unregister().then(() => { changed = true; }).catch(() => {})));
    } catch {}
  }
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key).then(() => { changed = true; }).catch(() => {})));
    } catch {}
  }
  return changed;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    hardResetOldClientCaches()
      .then(changed => {
        if (changed) {
          window.location.reload();
          return;
        }
        navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(SW_VERSION)}`, { updateViaCache: 'none' })
          .then(async registration => {
            try {
              const last = localStorage.getItem(SW_VERSION_KEY);
              if (last !== SW_VERSION) {
                localStorage.setItem(SW_VERSION_KEY, SW_VERSION);
                await registration.update();
              }
            } catch {
              await registration.update();
            }
          })
          .catch(() => {});
      })
      .catch(() => {});
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (window.__SMART_NOTEBOOK_RELOADED__) return;
    window.__SMART_NOTEBOOK_RELOADED__ = true;
    window.location.reload();
  });
}

createRoot(document.getElementById('root')).render(<App />);
