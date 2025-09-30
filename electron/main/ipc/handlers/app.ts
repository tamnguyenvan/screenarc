// Handlers for app-related IPC (app, window controls).

import { app, BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron';

export function handleGetPath(_event: IpcMainInvokeEvent, name: 'home' | 'userData' | 'desktop') {
  return app.getPath(name);
}

export function handleGetPlatform() {
  return process.platform;
}

export function minimizeWindow(event: IpcMainEvent) {
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.minimize();
}

export function maximizeWindow(event: IpcMainEvent) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window?.isMaximized()) {
    window.unmaximize();
  } else {
    window?.maximize();
  }
}

export function closeWindow(event: IpcMainEvent) {
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.close();
}