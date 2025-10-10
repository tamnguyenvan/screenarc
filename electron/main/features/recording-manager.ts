/* eslint-disable @typescript-eslint/no-explicit-any */
// Contains core business logic for recording, stopping, and cleanup.

import log from 'electron-log/main';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { app, Menu, Tray, nativeImage, screen, ipcMain, dialog } from 'electron';
import { appState } from '../state';
import { getFFmpegPath, ensureDirectoryExists } from '../lib/utils';
import { VITE_PUBLIC } from '../lib/constants';
import { createMouseTracker } from './mouse-tracker';
import { getCursorScale, restoreOriginalCursorScale, resetCursorScale } from './cursor-manager';
import { createEditorWindow, cleanupEditorFiles } from '../windows/editor-window';
import { createSavingWindow, createSelectionWindow } from '../windows/temporary-windows';
import type { RecordingSession } from '../state';

const FFMPEG_PATH = getFFmpegPath();

/**
 * Validates the generated recording files to ensure they exist and are not empty.
 * @param session - The recording session containing file paths to validate.
 * @returns A promise that resolves to true if files are valid, false otherwise.
 */
async function validateRecordingFiles(session: RecordingSession): Promise<boolean> {
  log.info('[Validation] Validating recorded files...');
  const filesToValidate = [session.screenVideoPath];
  if (session.webcamVideoPath) {
    filesToValidate.push(session.webcamVideoPath);
  }

  for (const filePath of filesToValidate) {
    try {
      const stats = await fsPromises.stat(filePath);
      if (stats.size === 0) {
        const errorMessage = `The recording produced an empty video file (${path.basename(filePath)}). This could be due to incorrect permissions, lack of disk space, or a hardware issue.`;
        log.error(`[Validation] ${errorMessage}`);
        dialog.showErrorBox('Recording Validation Failed', errorMessage);
        return false;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const errorMessage = `The recording process failed to create the video file: ${path.basename(filePath)}.`;
        log.error(`[Validation] ${errorMessage}`);
        dialog.showErrorBox('Recording Validation Failed', errorMessage);
      } else {
        const errorMessage = `Could not access the recorded file (${path.basename(filePath)}). Error: ${(error as Error).message}`;
        log.error(`[Validation] ${errorMessage}`, error);
        dialog.showErrorBox('File Error', errorMessage);
      }
      return false;
    }
  }

  log.info('[Validation] All recorded files appear valid (exist and are not empty).');
  return true;
}

interface RecordingGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The core function that spawns FFmpeg and the mouse tracker to begin recording.
 * @param inputArgs - Platform-specific FFmpeg input arguments.
 * @param hasWebcam - Flag indicating if webcam recording is enabled.
 * @param hasMic - Flag indicating if microphone recording is enabled.
 * @param recordingGeometry - The logical dimensions and position of the recording area.
 * @param scaleFactor - The display scale factor for coordinate conversion.
 */
async function startActualRecording(
  inputArgs: string[],
  hasWebcam: boolean,
  hasMic: boolean,
  recordingGeometry: RecordingGeometry,
  scaleFactor: number
) {
  const recordingDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.screenarc');
  await ensureDirectoryExists(recordingDir);
  const baseName = `ScreenArc-recording-${Date.now()}`;

  const screenVideoPath = path.join(recordingDir, `${baseName}-screen.mp4`);
  const webcamVideoPath = hasWebcam ? path.join(recordingDir, `${baseName}-webcam.mp4`) : undefined;
  const metadataPath = path.join(recordingDir, `${baseName}.json`);

  appState.currentRecordingSession = { screenVideoPath, webcamVideoPath, metadataPath };
  appState.recorderWin?.hide();

  // Reset state for the new session
  appState.recordingStartTime = Date.now();
  appState.ffmpegFirstFrameTime = null;
  appState.recordedMouseEvents = [];
  appState.runtimeCursorImageMap = new Map();
  appState.mouseTracker = createMouseTracker();

  if (appState.mouseTracker) {
    appState.mouseTracker.on('data', (data: any) => {
      // Coordinate Conversion:
      // 1. Native APIs (macOS, Windows) provide physical pixel coordinates.
      // 2. Electron and FFmpeg operate on logical (scaled) coordinates.
      // 3. We must divide by the scaleFactor to normalize the coordinates.
      // 4. We then make the coordinates relative to the recording area's top-left corner.
      const scaledX = data.x / scaleFactor;
      const scaledY = data.y / scaleFactor;
      
      const relativeEvent = {
        ...data,
        x: scaledX - recordingGeometry.x,
        y: scaledY - recordingGeometry.y,
        timestamp: data.timestamp - appState.recordingStartTime,
      };
      appState.recordedMouseEvents.push(relativeEvent);
    });
    appState.mouseTracker.start(appState.runtimeCursorImageMap);
  }

  const finalArgs = buildFfmpegArgs(inputArgs, hasWebcam, hasMic, screenVideoPath, webcamVideoPath);
  log.info(`[FFMPEG] Starting FFmpeg with args: ${finalArgs.join(' ')}`);
  appState.ffmpegProcess = spawn(FFMPEG_PATH, finalArgs);

  // Monitor FFmpeg's stderr for progress, errors, and sync timing
  appState.ffmpegProcess.stderr.on('data', (data: any) => {
    const message = data.toString();
    log.warn(`[FFMPEG stderr]: ${message}`);

    // Capture the timestamp of the first frame for mouse/video synchronization
    if (!appState.ffmpegFirstFrameTime && message.includes('frame=')) {
      appState.ffmpegFirstFrameTime = Date.now();
      const syncOffset = appState.ffmpegFirstFrameTime - appState.recordingStartTime;
      log.info(`[SYNC] FFmpeg first frame detected. Sync offset: ${syncOffset}ms`);
    }

    // Early detection of fatal errors to provide immediate feedback
    const fatalErrorKeywords = ['Cannot open display', 'Invalid argument', 'Device not found', 'Unknown input format', 'error opening device'];
    if (fatalErrorKeywords.some(keyword => message.toLowerCase().includes(keyword.toLowerCase()))) {
      log.error(`[FFMPEG] Fatal error detected: ${message}`);
      dialog.showErrorBox('Recording Failed', `A critical error occurred while starting the recording process:\n\n${message}\n\nPlease check your device permissions and configurations.`);
      setTimeout(() => cleanupAndDiscard(), 100);
    }
  });

  createTray();
  return { canceled: false, ...appState.currentRecordingSession };
}

/**
 * Constructs the final FFmpeg command arguments by mapping input streams to output files.
 */
function buildFfmpegArgs(inputArgs: string[], hasWebcam: boolean, hasMic: boolean, screenOut: string, webcamOut?: string): string[] {
  const finalArgs = [...inputArgs];
  // Determine the index of each input stream (mic, webcam, screen)
  const micIndex = hasMic ? 0 : -1;
  const webcamIndex = hasMic ? (hasWebcam ? 1 : -1) : (hasWebcam ? 0 : -1);
  const screenIndex = (hasMic ? 1 : 0) + (hasWebcam ? 1 : 0);

  // Map screen video stream
  finalArgs.push('-map', `${screenIndex}:v`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', screenOut);
  
  // Map audio stream if present
  if (hasMic) {
    finalArgs.push('-map', `${micIndex}:a`, '-c:a', 'aac', '-b:a', '192k');
  }
  
  // Map webcam video stream if present
  if (hasWebcam && webcamOut) {
    finalArgs.push('-map', `${webcamIndex}:v`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', webcamOut);
  }

  return finalArgs;
}

/**
 * Creates the system tray icon and context menu for controlling an active recording.
 */
function createTray() {
  const icon = nativeImage.createFromPath(path.join(VITE_PUBLIC, 'screenarc-appicon-tray.png'));
  appState.tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Stop Recording', click: async () => {
        await stopRecording();
        appState.recorderWin?.webContents.send('recording-finished', { canceled: false, ...appState.currentRecordingSession });
      }
    },
    {
      label: 'Cancel Recording', click: async () => {
        await cancelRecording();
        appState.recorderWin?.webContents.send('recording-finished', { canceled: true });
      }
    },
  ]);
  appState.tray.setToolTip('ScreenArc is recording...');
  appState.tray.setContextMenu(contextMenu);
}

/**
 * Orchestrates the start of a recording based on user options from the renderer.
 * @param options - The recording configuration selected by the user.
 */
export async function startRecording(options: any) {
  const { source, displayId, mic, webcam } = options;
  log.info('[RecordingManager] Received start recording request with options:', options);

  const display = process.env.DISPLAY || ':0.0';
  const baseFfmpegArgs: string[] = [];
  let recordingGeometry: RecordingGeometry;
  let scaleFactor = 1;

  // --- Add Microphone and Webcam inputs first ---
  if (mic) {
    switch (process.platform) {
      case 'linux': baseFfmpegArgs.push('-f', 'alsa', '-i', 'default'); break;
      case 'win32': baseFfmpegArgs.push('-f', 'dshow', '-i', `audio=${mic.deviceLabel}`); break;
      case 'darwin': baseFfmpegArgs.push('-f', 'avfoundation', '-i', `:${mic.index}`); break;
    }
  }
  if (webcam) {
    switch (process.platform) {
      case 'linux': baseFfmpegArgs.push('-f', 'v4l2', '-i', `/dev/video${webcam.index}`); break;
      case 'win32': baseFfmpegArgs.push('-f', 'dshow', '-i', `video=${webcam.deviceLabel}`); break;
      case 'darwin': baseFfmpegArgs.push('-f', 'avfoundation', '-i', `${webcam.index}:none`); break;
    }
  }

  // --- Add Screen input last ---
  if (source === 'fullscreen') {
    const allDisplays = screen.getAllDisplays();
    const targetDisplay = allDisplays.find(d => d.id === displayId) || screen.getPrimaryDisplay();
    scaleFactor = targetDisplay.scaleFactor;
    const { x, y, width, height } = targetDisplay.bounds;
    const safeWidth = Math.floor(width / 2) * 2;
    const safeHeight = Math.floor(height / 2) * 2;
    recordingGeometry = { x, y, width: safeWidth, height: safeHeight };
    switch (process.platform) {
      case 'linux': baseFfmpegArgs.push('-f', 'x11grab', '-draw_mouse', '0', '-video_size', `${safeWidth}x${safeHeight}`, '-i', `${display}+${x},${y}`); break;
      case 'win32': baseFfmpegArgs.push('-f', 'gdigrab', '-draw_mouse', '0', '-offset_x', x.toString(), '-offset_y', y.toString(), '-video_size', `${safeWidth}x${safeHeight}`, '-i', 'desktop'); break;
      case 'darwin': baseFfmpegArgs.push('-f', 'avfoundation', '-i', `${allDisplays.findIndex(d => d.id === targetDisplay.id) || 0}:none`); break;
    }
  } else if (source === 'area') {
    appState.recorderWin?.hide();
    createSelectionWindow();
    const selectedGeometry = await new Promise<any | undefined>((resolve) => {
      ipcMain.once('selection:complete', (_e, geo) => { appState.selectionWin?.close(); resolve(geo); });
      ipcMain.once('selection:cancel', () => { appState.selectionWin?.close(); appState.recorderWin?.show(); resolve(undefined); });
    });
    if (!selectedGeometry) return { canceled: true };

    scaleFactor = screen.getPrimaryDisplay().scaleFactor;
    const safeWidth = Math.floor(selectedGeometry.width / 2) * 2;
    const safeHeight = Math.floor(selectedGeometry.height / 2) * 2;
    recordingGeometry = { x: selectedGeometry.x, y: selectedGeometry.y, width: safeWidth, height: safeHeight };
    
    switch (process.platform) {
      case 'linux': baseFfmpegArgs.push('-f', 'x11grab', '-draw_mouse', '0', '-video_size', `${safeWidth}x${safeHeight}`, '-i', `${display}+${selectedGeometry.x},${selectedGeometry.y}`); break;
      case 'win32': baseFfmpegArgs.push('-f', 'gdigrab', '-draw_mouse', '0', '-offset_x', selectedGeometry.x.toString(), '-offset_y', selectedGeometry.y.toString(), '-video_size', `${safeWidth}x${safeHeight}`, '-i', 'desktop'); break;
    }
  } else {
    return { canceled: true };
  }

  appState.originalCursorScale = await getCursorScale();
  log.info('[RecordingManager] Starting actual recording with args:', baseFfmpegArgs, 'scaleFactor:', scaleFactor);
  return startActualRecording(baseFfmpegArgs, !!webcam, !!mic, recordingGeometry, scaleFactor);
}

/**
 * Handles the graceful stop of a recording, saves files, validates them, and opens the editor.
 */
export async function stopRecording() {
  restoreOriginalCursorScale();
  log.info('Stopping recording, preparing to save...');
  appState.tray?.destroy();
  appState.tray = null;
  createSavingWindow();
  await cleanupAndSave();
  log.info('FFmpeg process finished.');

  const session = appState.currentRecordingSession;
  if (!session) {
    log.error('[StopRecord] No recording session found after cleanup. Aborting.');
    appState.savingWin?.close();
    appState.recorderWin?.show();
    return;
  }

  const isValid = await validateRecordingFiles(session);
  if (!isValid) {
    log.error('[StopRecord] Recording validation failed. Discarding files.');
    await cleanupEditorFiles(session);
    appState.currentRecordingSession = null;
    appState.savingWin?.close();
    resetCursorScale();
    appState.recorderWin?.show();
    return;
  }

  await new Promise(resolve => setTimeout(resolve, 500));
  appState.savingWin?.close();
  resetCursorScale();

  appState.currentRecordingSession = null;
  if (session) {
    createEditorWindow(session.screenVideoPath, session.metadataPath, session.webcamVideoPath);
  }
  appState.recorderWin?.close();
}

/**
 * Cancels the recording and discards all associated files and processes.
 */
export async function cancelRecording() {
  log.info('Cancelling recording and deleting files...');
  await cleanupAndDiscard();
  appState.recorderWin?.show();
}

/**
 * Stops trackers, writes metadata, and gracefully shuts down FFmpeg.
 */
async function cleanupAndSave(): Promise<void> {
  if (appState.mouseTracker) {
    appState.mouseTracker.stop();
    appState.mouseTracker = null;
  }

  if (appState.currentRecordingSession) {
    const { metadataPath } = appState.currentRecordingSession;
    const primaryDisplay = screen.getPrimaryDisplay();
    
    const syncOffset = appState.ffmpegFirstFrameTime
      ? appState.ffmpegFirstFrameTime - appState.recordingStartTime : 0;
    if (syncOffset > 500) {
      log.warn(`[SYNC] High sync offset detected: ${syncOffset}ms. This might indicate system load.`);
    }

    const finalMetadata = {
      screenSize: primaryDisplay.size,
      geometry: { width: primaryDisplay.bounds.width, height: primaryDisplay.bounds.height }, // TODO: Pass actual geometry
      syncOffset,
      cursorImages: Object.fromEntries(appState.runtimeCursorImageMap || []),
      events: appState.recordedMouseEvents,
    };

    try {
      await fsPromises.writeFile(metadataPath, JSON.stringify(finalMetadata));
      log.info(`Metadata saved to ${metadataPath}`);
    } catch (err) {
      log.error(`Failed to write metadata file: ${err}`);
    }
  }

  return new Promise((resolve) => {
    if (appState.ffmpegProcess) {
      const ffmpeg = appState.ffmpegProcess;
      appState.ffmpegProcess = null;
      ffmpeg.on('close', (code: any) => {
        log.info(`FFmpeg process exited with code ${code}`);
        resolve();
      });
      // Send 'q' for graceful shutdown on Windows, SIGINT on others
      if (process.platform === 'win32') {
        ffmpeg.stdin?.write('q');
        ffmpeg.stdin?.end();
      } else {
        ffmpeg.kill('SIGINT');
      }
    } else {
      resolve();
    }
  });
}

/**
 * Forcefully terminates all recording processes and deletes any temporary files.
 */
export async function cleanupAndDiscard() {
  if (!appState.currentRecordingSession) return;
  log.warn('[Cleanup] Discarding current recording session.');
  const sessionToDiscard = { ...appState.currentRecordingSession };
  appState.currentRecordingSession = null;

  appState.ffmpegProcess?.kill('SIGKILL');
  appState.ffmpegProcess = null;
  
  appState.mouseTracker?.stop();
  appState.mouseTracker = null;
  
  appState.recordedMouseEvents = [];
  appState.runtimeCursorImageMap = new Map();

  restoreOriginalCursorScale();
  appState.tray?.destroy();
  appState.tray = null;

  // Asynchronously delete files to not block the UI
  setTimeout(async () => {
    await cleanupEditorFiles(sessionToDiscard);
  }, 200);
}

/**
 * Scans the recording directory for leftover files from crashed sessions and deletes them.
 */
export async function cleanupOrphanedRecordings() {
  log.info('[Cleanup] Starting orphaned recording cleanup...');
  const recordingDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.screenarc');
  const protectedFiles = new Set<string>();

  // Protect files from the currently active editor or recording session
  if (appState.currentEditorSessionFiles) {
    Object.values(appState.currentEditorSessionFiles).forEach(file => file && protectedFiles.add(file));
  }
  if (appState.currentRecordingSession) {
    Object.values(appState.currentRecordingSession).forEach(file => file && protectedFiles.add(file));
  }

  try {
    const allFiles = await fsPromises.readdir(recordingDir);
    const filePattern = /^ScreenArc-recording-\d+(-screen\.mp4|-webcam\.mp4|\.json)$/;
    const filesToDelete = allFiles
      .filter(file => filePattern.test(file))
      .map(file => path.join(recordingDir, file))
      .filter(fullPath => !protectedFiles.has(fullPath));

    if (filesToDelete.length === 0) {
      log.info('[Cleanup] No orphaned files found.');
      return;
    }
    log.warn(`[Cleanup] Found ${filesToDelete.length} orphaned files to delete.`);
    for (const filePath of filesToDelete) {
      try {
        await fsPromises.unlink(filePath);
        log.info(`[Cleanup] Deleted orphaned file: ${filePath}`);
      } catch (unlinkError) {
        log.error(`[Cleanup] Failed to delete orphaned file: ${filePath}`, unlinkError);
      }
    }
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.error('[Cleanup] Error during orphaned file cleanup:', error);
    }
  }
}

/**
 * Event handler for application quit, ensuring recordings are cleaned up before exit.
 */
export async function onAppQuit(event: Electron.Event) {
  if (appState.currentRecordingSession && !appState.isCleanupInProgress) {
    log.warn('[AppQuit] Active session detected. Cleaning up before exit...');
    event.preventDefault();
    appState.isCleanupInProgress = true;
    try {
      await cleanupAndDiscard();
      log.info('[AppQuit] Cleanup finished.');
    } catch (error) {
      log.error('[AppQuit] Error during cleanup:', error);
    } finally {
      app.quit();
    }
  }
}

/**
 * Opens a file dialog to allow the user to import an existing video file for editing.
 */
export async function loadVideoFromFile() {
  log.info('[RecordingManager] Received load video from file request.');
  const recorderWindow = appState.recorderWin;
  if (!recorderWindow) return { canceled: true };

  const { canceled, filePaths } = await dialog.showOpenDialog(recorderWindow, {
    title: 'Select a video file to edit',
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'mkv'] }],
  });

  if (canceled || filePaths.length === 0) return { canceled: true };

  const sourceVideoPath = filePaths[0];
  log.info(`[RecordingManager] User selected video file: ${sourceVideoPath}`);
  recorderWindow.hide();
  createSavingWindow();

  try {
    const recordingDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.screenarc');
    await ensureDirectoryExists(recordingDir);
    const baseName = `ScreenArc-recording-${Date.now()}`;
    const screenVideoPath = path.join(recordingDir, `${baseName}-screen.mp4`);
    const metadataPath = path.join(recordingDir, `${baseName}.json`);

    await fsPromises.copyFile(sourceVideoPath, screenVideoPath);
    await fsPromises.writeFile(metadataPath, '{"events":[], "cursorImages": {}, "syncOffset": 0}', 'utf-8');

    const session: RecordingSession = { screenVideoPath, metadataPath, webcamVideoPath: undefined };
    const isValid = await validateRecordingFiles(session);
    if (!isValid) {
      await cleanupEditorFiles(session);
      appState.savingWin?.close();
      recorderWindow.show();
      return { canceled: true };
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    appState.savingWin?.close();
    createEditorWindow(screenVideoPath, metadataPath, undefined);
    recorderWindow.close();
    return { canceled: false, filePath: screenVideoPath };
  } catch (error) {
    log.error('[RecordingManager] Error loading video from file:', error);
    dialog.showErrorBox('Error Loading Video', `An error occurred while loading the video: ${(error as Error).message}`);
    appState.savingWin?.close();
    if (recorderWindow && !recorderWindow.isDestroyed()) {
      recorderWindow.show();
    }
    return { canceled: true };
  }
}