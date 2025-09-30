// Entry point of the Electron application.

import { app, BrowserWindow, protocol, ProtocolRequest, ProtocolResponse } from 'electron';
import log from 'electron-log/main';
import path from 'node:path';
import fsSync from 'node:fs';
import { VITE_PUBLIC } from './lib/constants';
import { setupLogging } from './lib/logging';
import { registerIpcHandlers } from './ipc';
import { createRecorderWindow } from './windows/recorder-window';
import { onAppQuit } from './features/recording-manager';

// --- Initialization ---
setupLogging();

// --- App Lifecycle Events ---
app.on('window-all-closed', () => {
  log.info('[App] All windows closed. Quitting.');
  app.quit();
});

app.on('before-quit', onAppQuit);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createRecorderWindow();
  }
});

app.whenReady().then(() => {
  log.info('[App] Ready. Initializing...');
  
  // Register custom protocol for media files
  protocol.registerFileProtocol('media', (request: ProtocolRequest, callback: (response: string | ProtocolResponse) => void) => {
    const url = request.url.replace('media://', '');
    const decodedUrl = decodeURIComponent(url);
    const resourcePath = path.join(VITE_PUBLIC, decodedUrl);

    if (path.isAbsolute(decodedUrl) && fsSync.existsSync(decodedUrl)) {
      return callback(decodedUrl);
    }
    if (fsSync.existsSync(resourcePath)) {
      return callback(resourcePath);
    }
    log.error(`[Protocol] Could not find file: ${decodedUrl}`);
    return callback({ error: -6 }); // FILE_NOT_FOUND
  });

  registerIpcHandlers();
  createRecorderWindow();
});