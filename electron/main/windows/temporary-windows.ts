// Logic to create temporary windows like countdown, saving, selection.

import { BrowserWindow } from 'electron';
import path from 'node:path';
import { appState } from '../state';
import { VITE_DEV_SERVER_URL, RENDERER_DIST } from '../lib/constants';

function createTemporaryWindow(options: Electron.BrowserWindowConstructorOptions, htmlPath: string) {
  const win = new BrowserWindow({
    ...options,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  
  const url = VITE_DEV_SERVER_URL
    ? path.join(process.env.APP_ROOT!, `public/${htmlPath}`)
    : path.join(RENDERER_DIST, htmlPath);

  win.loadFile(url);
  return win;
}

export function createCountdownWindow() {
  appState.countdownWin = createTemporaryWindow({ width: 380, height: 380 }, 'countdown/index.html');
  appState.countdownWin.on('closed', () => { appState.countdownWin = null; });
}

export function createSavingWindow() {
  appState.savingWin = createTemporaryWindow({ width: 350, height: 200 }, 'saving/index.html');
  appState.savingWin.on('closed', () => { appState.savingWin = null; });
}

export function createSelectionWindow() {
  appState.selectionWin = createTemporaryWindow({ fullscreen: true }, 'selection/index.html');
  appState.selectionWin.on('closed', () => { appState.selectionWin = null; });
}