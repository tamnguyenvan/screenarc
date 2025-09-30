// Manages global application state in a centralized way.

import { BrowserWindow, Tray } from 'electron';
import { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { WriteStream } from 'node:fs';
import type { IMouseTracker } from './features/mouse-tracker';

export interface RecordingSession {
  screenVideoPath: string;
  metadataPath: string;
  webcamVideoPath?: string;
}

interface AppState {
  // Windows
  recorderWin: BrowserWindow | null;
  editorWin: BrowserWindow | null;
  countdownWin: BrowserWindow | null;
  renderWorker: BrowserWindow | null;
  savingWin: BrowserWindow | null;
  selectionWin: BrowserWindow | null;

  // System
  tray: Tray | null;

  // Processes & Streams
  ffmpegProcess: ChildProcessWithoutNullStreams | null;
  metadataStream: WriteStream | null;
  mouseTracker: IMouseTracker | null;

  // Recording State
  firstChunkWritten: boolean;
  recordingStartTime: number;
  originalCursorSize: number | null;
  currentRecordingSession: RecordingSession | null;
  currentEditorSessionFiles: RecordingSession | null;

  // Flags
  isCleanupInProgress: boolean;
}

export const appState: AppState = {
  recorderWin: null,
  editorWin: null,
  countdownWin: null,
  renderWorker: null,
  savingWin: null,
  selectionWin: null,
  tray: null,
  ffmpegProcess: null,
  metadataStream: null,
  mouseTracker: null,
  firstChunkWritten: true,
  recordingStartTime: 0,
  originalCursorSize: null,
  currentRecordingSession: null,
  currentEditorSessionFiles: null,
  isCleanupInProgress: false,
};