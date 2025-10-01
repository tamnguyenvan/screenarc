// Logic to create and manage the editor window.

import log from 'electron-log/main';
import { BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import Store from 'electron-store';
import { format as formatUrl } from 'node:url';
import { appState } from '../state';
import { cleanupOrphanedRecordings } from '../features/recording-manager'; 
import { checkForUpdates } from '../features/update-checker';
import { VITE_DEV_SERVER_URL, RENDERER_DIST, PRELOAD_SCRIPT } from '../lib/constants';

const store = new Store(); // Can be configured with schema if needed

export function createEditorWindow(videoPath: string, metadataPath: string, webcamVideoPath?: string) {
  const bounds = store.get('windowBounds', { width: 1280, height: 800 }) as { x?: number, y?: number, width: number, height: number };

  appState.currentEditorSessionFiles = { screenVideoPath: videoPath, metadataPath, webcamVideoPath };
  log.info('[EditorWindow] Stored session files for cleanup:', appState.currentEditorSessionFiles);

  appState.editorWin = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC!, 'screenarc-appicon.png'),
    autoHideMenuBar: true,
    ...bounds,
    minWidth: 1024,
    minHeight: 768,
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: PRELOAD_SCRIPT,
      webSecurity: !VITE_DEV_SERVER_URL,
    },
  });

  // Cleanup orphaned recordings
  cleanupOrphanedRecordings();

  // Save bounds logic
  let resizeTimeout: NodeJS.Timeout;
  const saveBounds = () => {
    if (appState.editorWin && !appState.editorWin.isDestroyed()) {
      store.set('windowBounds', appState.editorWin.getBounds());
    }
  };
  const debouncedSaveBounds = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(saveBounds, 500);
  };
  appState.editorWin.on('resize', debouncedSaveBounds);
  appState.editorWin.on('move', debouncedSaveBounds);
  appState.editorWin.on('close', saveBounds);

  // if (process.env.NODE_ENV === 'development') {
  //   editorWin.webContents.openDevTools();
  // }

  appState.editorWin.on('closed', () => {
    if (appState.currentEditorSessionFiles) {
      cleanupEditorFiles(appState.currentEditorSessionFiles);
      appState.currentEditorSessionFiles = null;
    }
    appState.editorWin = null;
  });
  
  appState.editorWin.show();

  const editorUrl = VITE_DEV_SERVER_URL
    ? `${VITE_DEV_SERVER_URL}#editor`
    : formatUrl({ pathname: path.join(RENDERER_DIST, 'index.html'), protocol: 'file:', slashes: true, hash: 'editor' });

  log.info(`[EditorWindow] Loading URL: ${editorUrl}`);
  appState.editorWin.loadURL(editorUrl);

  appState.editorWin.webContents.on('did-finish-load', () => {
    log.info(`[EditorWindow] Finished loading. Sending project data.`);
    appState.editorWin?.webContents.send('project:open', { videoPath, metadataPath, webcamVideoPath });
    checkForUpdates(appState.editorWin);
  });
}

export async function cleanupEditorFiles(files: { screenVideoPath: string, metadataPath: string, webcamVideoPath?: string }) {
  log.info('[EditorWindow] Cleaning up session files:', files);
  const unlinkPromises = [
    files.screenVideoPath,
    files.webcamVideoPath,
    files.metadataPath
  ].filter(Boolean).map(filePath => 
    fsSync.existsSync(filePath!) ? fs.unlink(filePath!) : Promise.resolve()
  );
  try {
    await Promise.all(unlinkPromises);
    log.info('[EditorWindow] Session files deleted successfully.');
  } catch (error) {
    log.error('[EditorWindow] Could not delete session files:', error);
  }
}