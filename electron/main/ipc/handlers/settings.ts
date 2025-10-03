/* eslint-disable @typescript-eslint/no-explicit-any */
// Handlers for settings-related IPC (settings and presets).

import Store from 'electron-store';

const store = new Store(); // Should be initialized once and exported if needed elsewhere

export function loadPresets() {
  return store.get('presets', {});
}

export function savePresets(_event: any, presets: unknown) {
  store.set('presets', presets);
  return { success: true };
}

export function getSetting(_event: any, key: string) {
  return store.get(key);
}

export function setSetting(_event: any, key: string, value: unknown) {
  store.set(key, value);
}