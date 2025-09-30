// Handlers for shell-related IPC (electron.shell).

import { shell } from 'electron';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function showItemInFolder(_event: any, filePath: string) {
  shell.showItemInFolder(filePath);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function openExternal(_event: any, url: string) {
  shell.openExternal(url);
}