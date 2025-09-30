// Handlers for export-related IPC (export video).

import { IpcMainInvokeEvent, ipcMain } from 'electron';
import { startExport } from '../../features/export-manager';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleStartExport(event: IpcMainInvokeEvent, payload: any) {
  return startExport(event, payload);
}

export function handleCancelExport() {
  // The export manager listens for this event directly.
  ipcMain.emit('export:cancel');
}