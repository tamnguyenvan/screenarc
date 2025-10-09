/* eslint-disable @typescript-eslint/no-explicit-any */
// Manages global application state in a centralized way.

import { BrowserWindow, Tray } from 'electron';
import { ChildProcessWithoutNullStreams } from 'node:child_process'
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
  renderWorker: BrowserWindow | null;
  savingWin: BrowserWindow | null;
  selectionWin: BrowserWindow | null;

  // System
  tray: Tray | null;

  // Processes & Streams
  ffmpegProcess: ChildProcessWithoutNullStreams | null;
  mouseTracker: IMouseTracker | null;
  
  // In-memory recording data
  recordedMouseEvents: any[];
  runtimeCursorImageMap: Map<string, any>;

  // Recording State
  recordingStartTime: number;
  ffmpegFirstFrameTime: number | null;
  originalCursorScale: number | null;
  currentRecordingSession: RecordingSession | null;
  currentEditorSessionFiles: RecordingSession | null;

  // Flags
  isCleanupInProgress: boolean;
}

export const appState: AppState = {
  recorderWin: null,
  editorWin: null,
  renderWorker: null,
  savingWin: null,
  selectionWin: null,
  tray: null,
  ffmpegProcess: null,
  mouseTracker: null,
  recordedMouseEvents: [],
  runtimeCursorImageMap: new Map(),
  recordingStartTime: 0,
  ffmpegFirstFrameTime: null, // ADDED: Initial value
  originalCursorScale: null,
  currentRecordingSession: null,
  currentEditorSessionFiles: null,
  isCleanupInProgress: false,
};