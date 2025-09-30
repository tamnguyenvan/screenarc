// Logic to create and manage the recorder window.

import log from 'electron-log/main';
import { BrowserWindow, screen, ipcMain } from 'electron';
import path from 'node:path';
import { appState } from '../state';
import { VITE_DEV_SERVER_URL, RENDERER_DIST } from '../lib/constants';
import { cleanupAndDiscard } from '../features/recording-manager';
import { resetCursorSize } from '../features/cursor-manager';

export function createRecorderWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const windowWidth = 900;
  const windowHeight = 800;
  const x = Math.round((screenWidth - windowWidth) / 2);
  const y = Math.max(0, Math.round(screenHeight / 4));

  appState.recorderWin = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC!, 'screenarc-appicon.png'),
    width: windowWidth,
    height: windowHeight,
    x, y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(process.env.APP_ROOT!, 'dist-electron/preload.mjs'),
    },
  });

  if (VITE_DEV_SERVER_URL) {
    appState.recorderWin.loadURL(VITE_DEV_SERVER_URL);
  } else {
    appState.recorderWin.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  appState.recorderWin.on('close', (event) => {
    if (appState.ffmpegProcess) {
      log.warn('[RecorderWindow] Closed during recording. Cleaning up...');
      event.preventDefault();
      cleanupAndDiscard().then(() => {
        if (appState.recorderWin && !appState.recorderWin.isDestroyed()) {
          appState.recorderWin.close();
        }
      });
    } else {
      log.info('[RecorderWindow] Closed before recording. Resetting cursor size.');
      resetCursorSize();
    }
  });

  appState.recorderWin.on('closed', () => {
    appState.recorderWin = null;
  });

  // This simple IPC handler can stay here as it's tightly coupled to this window.
  ipcMain.on('recorder:set-size', (_event, { width, height }: { width: number, height: number }) => {
    if (appState.recorderWin) {
      log.info(`Resizing recorder window to ${width}x${height}`);
      appState.recorderWin.setSize(width, height, true);
    }
  });
}