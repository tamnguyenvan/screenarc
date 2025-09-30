// Handlers for settings-related IPC (settings and presets).

import Store from 'electron-store';

const store = new Store(); // Should be initialized once and exported if needed elsewhere

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadPresets() {
  return store.get('presets', {});
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function savePresets(_event: any, presets: unknown) {
  store.set('presets', presets);
  return { success: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSetting(_event: any, key: string) {
  return store.get(key);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setSetting(_event: any, key: string, value: unknown) {
  store.set(key, value);
}