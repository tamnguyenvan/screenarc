/* eslint-disable @typescript-eslint/no-explicit-any */
// Manages global application state in a centralized way.

import { BrowserWindow, Tray } from 'electron'
import { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { IMouseTracker } from './features/mouse-tracker'
import type { CursorHelperSession } from './features/cursor-helper'

// ADDED: Define RecordingGeometry type here for better reusability
export interface RecordingGeometry {
  x: number
  y: number
  width: number
  height: number
}

export interface RecordingSession {
  screenVideoPath: string
  metadataPath: string
  webcamVideoPath?: string
  // Set when system-audio capture (renderer-side MediaRecorder) is enabled.
  // Cleared after the post-recording mux merges it into the screen file.
  // On macOS the system audio is folded into screenWebmPath instead, so this
  // stays unset there.
  systemAudioPath?: string
  // True when mic capture is enabled for this session. Drives mux filter graph.
  hasMicAudio?: boolean
  // macOS only: renderer-recorded screen video (WebM/VP9), optionally with an
  // Opus loopback audio track when the user enabled system audio. Cleared
  // after the post-recording mux transcodes it into screenVideoPath (.mp4).
  screenWebmPath?: string
  // True when screenWebmPath contains a system-audio track (renderer added a
  // loopback audio track to the MediaRecorder stream). Drives mux filter graph.
  webmHasSystemAudio?: boolean
  // macOS only: separate AAC/m4a file produced by FFmpeg when only mic capture
  // is requested (since FFmpeg no longer captures the screen there). Cleared
  // after mux folds it into screenVideoPath.
  micAudioPath?: string
  recordingGeometry: RecordingGeometry
  /**
   * Wayland area recording only. The portal can only hand over a whole monitor,
   * so the user's selection is carried here and cut out during the mux, once the
   * captured video's real pixel size is known. Cleared after the crop is applied.
   */
  pendingCrop?: {
    /** What the user drew, in CSS pixels of the selection overlay. */
    selection: { x: number; y: number; width: number; height: number }
    /** The overlay's own size in CSS pixels — the reference for the selection. */
    overlay: { width: number; height: number }
  }
}

interface AppState {
  // Windows
  recorderWin: BrowserWindow | null
  editorWin: BrowserWindow | null
  renderWorker: BrowserWindow | null
  savingWin: BrowserWindow | null
  selectionWin: BrowserWindow | null

  // System
  tray: Tray | null

  // Processes & Streams
  ffmpegProcess: ChildProcessWithoutNullStreams | null
  mouseTracker: IMouseTracker | null
  /**
   * Feeds the webcam into the recording FFmpeg over a pipe. Keeping the camera
   * device in a separate process lets the main FFmpeg finalize cleanly: when
   * this feeder is stopped its pipe EOFs, so the webcam input ends like the
   * screen input does — the encoder finishes normally and writes the mp4
   * container trailer, instead of being SIGKILLed mid-file.
   */
  webcamFeeder: ChildProcessWithoutNullStreams | null

  // In-memory recording data
  recordedMouseEvents: any[]
  runtimeCursorImageMap: Map<string, any>

  /**
   * The Wayland cursor helper, while it is capturing the screen. It owns the
   * frames and the cursor samples for this recording; see features/cursor-helper.ts.
   */
  cursorHelper: CursorHelperSession | null

  // Recording State
  recordingStartTime: number
  originalCursorScale: number | null
  currentRecordingSession: RecordingSession | null
  currentEditorSessionFiles: RecordingSession | null

  // True while the open editor has unsaved project changes. Updated by the
  // renderer over IPC so the main process can warn before replacing a session.
  editorProjectDirty: boolean

  // Flags
  isCleanupInProgress: boolean
}

export const appState: AppState = {
  recorderWin: null,
  editorWin: null,
  renderWorker: null,
  savingWin: null,
  selectionWin: null,
  tray: null,
  ffmpegProcess: null,
  webcamFeeder: null,
  mouseTracker: null,
  recordedMouseEvents: [],
  runtimeCursorImageMap: new Map(),
  cursorHelper: null,
  recordingStartTime: 0,
  originalCursorScale: null,
  currentRecordingSession: null,
  currentEditorSessionFiles: null,
  editorProjectDirty: false,
  isCleanupInProgress: false,
}
