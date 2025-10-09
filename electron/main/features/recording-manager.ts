// Contains core business logic for recording, stopping, and cleanup.

import log from 'electron-log/main';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
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

  appState.recordingStartTime = Date.now();
  appState.recordedMouseEvents = [];
  appState.runtimeCursorImageMap = new Map();
  appState.mouseTracker = createMouseTracker();

  if (appState.mouseTracker) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appState.mouseTracker.on('data', (data: any) => {
      // --- IMPORTANT DISPLAY FIX ---
      // 1. Native APIs (macOS, Windows) return physical coordinates. Electron and FFmpeg
      //    work with logical coordinates. We must divide by scaleFactor.
      const scaledX = data.x / scaleFactor;
      const scaledY = data.y / scaleFactor;
      
      // 2. Make coordinates relative to the recording screen.
      //    Subtract the top-left corner of the recording screen (in logical coordinates).
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

  const ffmpegErrors: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  appState.ffmpegProcess.stderr.on('data', (data: any) => {
    const message = data.toString();
    log.warn(`[FFMPEG stderr]: ${message}`); // Log as warning instead of info
    ffmpegErrors.push(message);

    // Check for known fatal errors that can occur early
    const fatalErrorKeywords = [
      'Cannot open display',
      'Invalid argument',
      'Device not found',
      'Unknown input format',
      'error opening device'
    ];
    if (fatalErrorKeywords.some(keyword => message.toLowerCase().includes(keyword.toLowerCase()))) {
      log.error(`[FFMPEG] Fatal error detected: ${message}`);
      dialog.showErrorBox('Recording Failed', `A critical error occurred while starting the recording process:\n\n${message}\n\nPlease check your device permissions and configurations.`);
      // Use a small timeout to ensure the process is fully spawned before trying to kill it.
      setTimeout(() => cleanupAndDiscard(), 100);
    }
  });

  createTray();

  return { canceled: false, ...appState.currentRecordingSession };
}

function buildFfmpegArgs(inputArgs: string[], hasWebcam: boolean, hasMic: boolean, screenOut: string, webcamOut?: string): string[] {
  const finalArgs = [...inputArgs];
  const micIndex = hasMic ? 0 : -1;
  const webcamIndex = hasMic ? (hasWebcam ? 1 : -1) : (hasWebcam ? 0 : -1);
  const screenIndex = (hasMic ? 1 : 0) + (hasWebcam ? 1 : 0);

  finalArgs.push('-map', `${screenIndex}:v`);
  if (hasMic) {
    finalArgs.push('-map', `${micIndex}:a`, '-c:a', 'aac', '-b:a', '192k');
  }
  finalArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', screenOut);
  if (hasWebcam) {
    finalArgs.push('-map', `${webcamIndex}:v`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', webcamOut!);
  }
  return finalArgs;
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function startRecording(options: any) { // Type from preload.ts
  const { source, displayId, mic, webcam } = options;
  log.info('[RecordingManager] Received start recording request with options:', options);

  const display = process.env.DISPLAY || ':0.0';
  const baseFfmpegArgs: string[] = [];
  let recordingGeometry: RecordingGeometry;
  let scaleFactor = 1;

  if (mic) {
    switch (process.platform) {
      case 'linux': baseFfmpegArgs.push('-f', 'alsa', '-i', 'default'); break;
      case 'win32': baseFfmpegArgs.push('-f', 'dshow', '-i', `audio=${mic.deviceLabel}`); break; // Use `audio=` not `audio=`
      case 'darwin': baseFfmpegArgs.push('-f', 'avfoundation', '-i', `:${mic.index}`); break;
    }
  }
  if (webcam) {
    switch (process.platform) {
      case 'linux': baseFfmpegArgs.push('-f', 'v4l2', '-i', `/dev/video${webcam.index}`); break;
      case 'win32': baseFfmpegArgs.push('-f', 'dshow', '-i', `video=${webcam.deviceLabel}`); break; // Use `video=` not `video=`
      case 'darwin': baseFfmpegArgs.push('-f', 'avfoundation', '-i', `${webcam.index}:none`); break;
    }
  }

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selectedGeometry = await new Promise<any | undefined>((resolve) => {
      ipcMain.once('selection:complete', (_e, geo) => { appState.selectionWin?.close(); resolve(geo); });
      ipcMain.once('selection:cancel', () => { appState.selectionWin?.close(); appState.recorderWin?.show(); resolve(undefined); });
    });
    if (!selectedGeometry) return { canceled: true };

    scaleFactor = screen.getPrimaryDisplay().scaleFactor;

    // Ensure width and height are even numbers for FFmpeg compatibility
    const safeWidth = Math.floor(selectedGeometry.width / 2) * 2;
    const safeHeight = Math.floor(selectedGeometry.height / 2) * 2;
    recordingGeometry = { x: selectedGeometry.x, y: selectedGeometry.y, width: safeWidth, height: safeHeight };
    
    switch (process.platform) {
      case 'linux': baseFfmpegArgs.push('-f', 'x11grab', '-draw_mouse', '0', '-video_size', `${safeWidth}x${safeHeight}`, '-i', `${display}+${selectedGeometry.x},${selectedGeometry.y}`); break;
      case 'win32': baseFfmpegArgs.push('-f', 'gdigrab', '-draw_mouse', '0', '-offset_x', selectedGeometry.x.toString(), '-offset_y', selectedGeometry.y.toString(), '-video_size', `${safeWidth}x${safeHeight}`, '-i', 'desktop'); break;
      // macOS area recording would require different logic
    }
  } else { /* window source logic here if re-enabled */
    return { canceled: true };
  }

  appState.originalCursorScale = await getCursorScale();
  
  log.info('[RecordingManager] Starting actual recording with args:', baseFfmpegArgs, 'scaleFactor:', scaleFactor);
  return startActualRecording(baseFfmpegArgs, !!webcam, !!mic, recordingGeometry, scaleFactor);
}

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
    await cleanupEditorFiles(session); // Use existing function to delete bad files
    appState.currentRecordingSession = null;
    appState.savingWin?.close();
    resetCursorScale();
    appState.recorderWin?.show(); // Re-open the recorder for the user
    return; // Abort opening the editor
  }

  // If validation passes, proceed as normal
  await new Promise(resolve => setTimeout(resolve, 500));
  appState.savingWin?.close();
  resetCursorScale();

  appState.currentRecordingSession = null;
  if (session) {
    createEditorWindow(session.screenVideoPath, session.metadataPath, session.webcamVideoPath);
  }
  appState.recorderWin?.close();
}

export async function cancelRecording() {
  log.info('Cancelling recording and deleting files...');
  await cleanupAndDiscard();
  appState.recorderWin?.show();
}

async function cleanupAndSave(): Promise<void> {
  // 1. Stop tracker
  if (appState.mouseTracker) {
    appState.mouseTracker.stop();
    appState.mouseTracker = null;
  }

  // 2. Write metadata file
  if (appState.currentRecordingSession) {
    const metadataPath = appState.currentRecordingSession.metadataPath;
    const primaryDisplay = screen.getPrimaryDisplay();
    const recordingGeometry = { x: 0, y: 0, width: primaryDisplay.bounds.width, height: primaryDisplay.bounds.height }; // This needs to be the actual geometry

    const finalMetadata = {
      screenSize: primaryDisplay.size,
      geometry: recordingGeometry, // TODO: Pass actual geometry here
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

  // 3. Stop FFmpeg gracefully
  return new Promise((resolve) => {
    if (appState.ffmpegProcess) {
      const ffmpeg = appState.ffmpegProcess;
      appState.ffmpegProcess = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ffmpeg.on('close', (code: any) => {
        log.info(`FFmpeg process exited with code ${code}`);
        resolve();
      });
      if (process.platform === 'win32') {
        log.info('Sending "q" to FFmpeg for graceful shutdown on Windows...');
        ffmpeg.stdin?.write('q');
        ffmpeg.stdin?.end();
      } else {
        log.info('Sending SIGINT to FFmpeg for graceful shutdown...');
        ffmpeg.kill('SIGINT');
      }
    } else {
      resolve();
    }
  });
}

export async function cleanupAndDiscard() {
  if (!appState.currentRecordingSession) return;
  log.warn('[Cleanup] Discarding current recording session.');
  const sessionToDiscard = { ...appState.currentRecordingSession };
  appState.currentRecordingSession = null;

  if (appState.ffmpegProcess) {
    appState.ffmpegProcess.kill('SIGKILL');
    appState.ffmpegProcess = null;
  }
  if (appState.mouseTracker) {
    appState.mouseTracker.stop();
    appState.mouseTracker = null;
  }
  
  appState.recordedMouseEvents = [];
  appState.runtimeCursorImageMap = new Map();

  restoreOriginalCursorScale();
  appState.tray?.destroy();
  appState.tray = null;

  setTimeout(async () => {
    await cleanupEditorFiles(sessionToDiscard);
  }, 200);
}

export async function cleanupOrphanedRecordings() {
  log.info('[Cleanup] Starting orphaned recording cleanup...');
  const recordingDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.screenarc');

  // 1. Collect all file paths that are currently in use and should NOT be deleted.
  const protectedFiles = new Set<string>();
  if (appState.currentEditorSessionFiles) {
    protectedFiles.add(appState.currentEditorSessionFiles.screenVideoPath);
    protectedFiles.add(appState.currentEditorSessionFiles.metadataPath);
    if (appState.currentEditorSessionFiles.webcamVideoPath) {
      protectedFiles.add(appState.currentEditorSessionFiles.webcamVideoPath);
    }
  }
  if (appState.currentRecordingSession) {
    protectedFiles.add(appState.currentRecordingSession.screenVideoPath);
    protectedFiles.add(appState.currentRecordingSession.metadataPath);
    if (appState.currentRecordingSession.webcamVideoPath) {
      protectedFiles.add(appState.currentRecordingSession.webcamVideoPath);
    }
  }

  try {
    const allFiles = await fsPromises.readdir(recordingDir);
    const filePattern = /^ScreenArc-recording-\d+(-screen\.mp4|-webcam\.mp4|\.json)$/;

    const filesToDelete = allFiles
      .filter(file => filePattern.test(file)) // Only target files matching our naming convention
      .map(file => path.join(recordingDir, file)) // Get the full path
      .filter(fullPath => !protectedFiles.has(fullPath)); // Exclude files from the current session

    if (filesToDelete.length === 0) {
      log.info('[Cleanup] No orphaned files found.');
      return;
    }

    log.warn(`[Cleanup] Found ${filesToDelete.length} orphaned files to delete.`);

    let deletedCount = 0;
    for (const filePath of filesToDelete) {
      try {
        await fsPromises.unlink(filePath);
        log.info(`[Cleanup] Deleted orphaned file: ${filePath}`);
        deletedCount++;
      } catch (unlinkError) {
        log.error(`[Cleanup] Failed to delete orphaned file: ${filePath}`, unlinkError);
      }
    }
    log.info(`[Cleanup] Successfully deleted ${deletedCount} of ${filesToDelete.length} orphaned files.`);

  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.error('[Cleanup] Error during orphaned file cleanup:', error);
    }
  }
}


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

export async function loadVideoFromFile() {
  log.info('[RecordingManager] Received load video from file request.');

  // The recorder window should be the parent for the dialog
  const recorderWindow = appState.recorderWin;
  if (!recorderWindow) {
    log.error('[RecordingManager] Cannot show open dialog, recorder window is not available.');
    return { canceled: true };
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(recorderWindow, {
    title: 'Select a video file to edit',
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'mkv'] }],
  });

  if (canceled || filePaths.length === 0) {
    log.info('[RecordingManager] File selection was cancelled.');
    return { canceled: true };
  }

  const sourceVideoPath = filePaths[0];
  log.info(`[RecordingManager] User selected video file: ${sourceVideoPath}`);

  recorderWindow.hide();
  createSavingWindow(); // Reuse this for a "Loading..." feel

  try {
    const recordingDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.screenarc');
    await ensureDirectoryExists(recordingDir);
    const baseName = `ScreenArc-recording-${Date.now()}`;

    const screenVideoPath = path.join(recordingDir, `${baseName}-screen.mp4`);
    const metadataPath = path.join(recordingDir, `${baseName}.json`);

    // 1. Copy the selected video file to our app's directory
    await fsPromises.copyFile(sourceVideoPath, screenVideoPath);
    log.info(`[RecordingManager] Copied video to: ${screenVideoPath}`);

    // 2. Create an empty metadata file with the new structure
    // The editor will populate geometry and screenSize from the video itself.
    await fsPromises.writeFile(metadataPath, '{"events":[], "cursorImages": {}}', 'utf-8');
    log.info(`[RecordingManager] Created empty metadata file at: ${metadataPath}`);

    const session: RecordingSession = { screenVideoPath, metadataPath, webcamVideoPath: undefined };

    // 3. Validate the new file
    const isValid = await validateRecordingFiles(session);
    if (!isValid) {
      log.error('[RecordingManager] Loaded video file is invalid. Cleaning up.');
      await cleanupEditorFiles(session);
      appState.savingWin?.close();
      recorderWindow.show();
      return { canceled: true };
    }

    // 4. Proceed to open the editor
    await new Promise(resolve => setTimeout(resolve, 500)); // Short delay for UX
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