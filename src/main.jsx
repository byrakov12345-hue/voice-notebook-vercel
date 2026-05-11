import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

const SW_VERSION = '2026-05-11-notes-fix-2';
const SW_VERSION_KEY = 'smart_notebook_sw_version';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
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
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (window.__SMART_NOTEBOOK_RELOADED__) return;
    window.__SMART_NOTEBOOK_RELOADED__ = true;
    window.location.reload();
  });
}

createRoot(document.getElementById('root')).render(<App />);
