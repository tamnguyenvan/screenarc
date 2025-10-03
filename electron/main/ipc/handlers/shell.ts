/* eslint-disable @typescript-eslint/no-explicit-any */
// Handlers for shell-related IPC (electron.shell).

import { shell } from 'electron';

export function showItemInFolder(_event: any, filePath: string) {
  shell.showItemInFolder(filePath);
}

export function openExternal(_event: any, url: string) {
  shell.openExternal(url);
}