// Logic to create and manage the recorder window.

import log from 'electron-log/main';
import { BrowserWindow, screen, ipcMain } from 'electron';
import path from 'node:path';
import { appState } from '../state';
import { VITE_DEV_SERVER_URL, RENDERER_DIST, PRELOAD_SCRIPT } from '../lib/constants';
import { cleanupAndDiscard } from '../features/recording-manager';
import { resetCursorScale } from '../features/cursor-manager';

export function createRecorderWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const windowWidth = 900;
  const windowHeight = 360;
  const x = Math.round((screenWidth - windowWidth) / 2);
  const y = Math.max(0, Math.round(screenHeight / 4));

  appState.recorderWin = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC!, 'screenarc-appicon.png'),
    width: windowWidth,
    height: windowHeight,
    x, y,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      preload: PRELOAD_SCRIPT,
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
      log.info('[RecorderWindow] Closed before recording. Resetting cursor scale.');
      resetCursorScale();
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

  ipcMain.on('recorder:click-through', () => {
    const win = appState.recorderWin;
    if (win && !win.isDestroyed()) {
      // Use Electron's built-in solution for Windows & macOS
      win.setIgnoreMouseEvents(true, { forward: true });
      setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.setIgnoreMouseEvents(false);
        }
      }, 100);
    }
  });
}