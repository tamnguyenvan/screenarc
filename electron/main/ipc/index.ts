import { ipcMain } from 'electron';
import * as appHandlers from './handlers/app';
import * as desktopHandlers from './handlers/desktop';
import * as exportHandlers from './handlers/export';
import * as fsHandlers from './handlers/file-system';
import * as recordingHandlers from './handlers/recording';
import * as settingsHandlers from './handlers/settings';
import * as shellHandlers from './handlers/shell';

export function registerIpcHandlers() {
  // App & Window
  ipcMain.handle('app:getPath', appHandlers.handleGetPath);
  ipcMain.handle('app:getPlatform', appHandlers.handleGetPlatform);
  ipcMain.on('window:minimize', appHandlers.minimizeWindow);
  ipcMain.on('window:maximize', appHandlers.maximizeWindow);
  ipcMain.on('window:close', appHandlers.closeWindow);

  // Desktop
  ipcMain.handle('desktop:get-displays', desktopHandlers.getDisplays);
  ipcMain.handle('desktop:get-sources', desktopHandlers.getDesktopSources);
  ipcMain.handle('desktop:get-cursor-size', desktopHandlers.handleGetCursorSize);
  ipcMain.on('desktop:set-cursor-size', desktopHandlers.handleSetCursorSize);
  ipcMain.handle('dialog:showSaveDialog', desktopHandlers.showSaveDialog);
  ipcMain.handle('video:get-frame', desktopHandlers.getVideoFrame);

  // Recording
  ipcMain.handle('recording:start', recordingHandlers.handleStartRecording);
  ipcMain.handle('linux:check-tools', recordingHandlers.handleLinuxCheckTools);

  // Export
  ipcMain.handle('export:start', exportHandlers.handleStartExport);
  ipcMain.on('export:cancel', exportHandlers.handleCancelExport);
  
  // File System
  ipcMain.handle('fs:readFile', fsHandlers.handleReadFile);

  // Settings & Presets
  ipcMain.handle('presets:load', settingsHandlers.loadPresets);
  ipcMain.handle('presets:save', settingsHandlers.savePresets);
  ipcMain.handle('settings:get', settingsHandlers.getSetting);
  ipcMain.on('settings:set', settingsHandlers.setSetting);
  
  // Shell
  ipcMain.on('shell:showItemInFolder', shellHandlers.showItemInFolder);
  ipcMain.on('shell:openExternal', shellHandlers.openExternal);
}