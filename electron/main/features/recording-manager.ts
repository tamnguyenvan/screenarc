// Contains core business logic for recording, stopping, and cleanup.

import log from 'electron-log/main';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { Menu, Tray, nativeImage, screen, ipcMain } from 'electron';
import { appState } from '../state';
import { getFFmpegPath, ensureDirectoryExists } from '../lib/utils';
import { VITE_PUBLIC } from '../lib/constants';
import { createMouseTracker } from './mouse-tracker';
import { getCursorScale, restoreOriginalCursorScale, resetCursorScale } from './cursor-manager';
import { createEditorWindow, cleanupEditorFiles } from '../windows/editor-window';
import { createCountdownWindow, createSavingWindow, createSelectionWindow } from '../windows/temporary-windows';
import { app } from 'electron';

const FFMPEG_PATH = getFFmpegPath();

async function startActualRecording(inputArgs: string[], hasWebcam: boolean, hasMic: boolean) {
  const recordingDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.screenarc');
  await ensureDirectoryExists(recordingDir);
  const baseName = `ScreenArc-recording-${Date.now()}`;

  const screenVideoPath = path.join(recordingDir, `${baseName}-screen.mp4`);
  const webcamVideoPath = hasWebcam ? path.join(recordingDir, `${baseName}-webcam.mp4`) : undefined;
  const metadataPath = path.join(recordingDir, `${baseName}.json`);

  appState.currentRecordingSession = { screenVideoPath, webcamVideoPath, metadataPath };

  appState.recorderWin?.hide();
  createCountdownWindow();

  setTimeout(() => {
    appState.countdownWin?.close();

    appState.firstChunkWritten = true;
    appState.recordingStartTime = Date.now();
    appState.mouseTracker = createMouseTracker();
    appState.metadataStream = fs.createWriteStream(metadataPath);
    appState.metadataStream.write('[\n');

    if (appState.mouseTracker) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      appState.mouseTracker.on('data', (data: any) => {
        const relativeTimestampData = { ...data, timestamp: data.timestamp - appState.recordingStartTime };
        if (appState.metadataStream?.writable) {
          if (!appState.firstChunkWritten) appState.metadataStream.write(',\n');
          appState.metadataStream.write(JSON.stringify(relativeTimestampData));
          appState.firstChunkWritten = false;
        }
      });
      appState.mouseTracker.start();
    }

    const finalArgs = buildFfmpegArgs(inputArgs, hasWebcam, hasMic, screenVideoPath, webcamVideoPath);
    log.info(`Starting FFmpeg with args: ${finalArgs.join(' ')}`);
    appState.ffmpegProcess = spawn(FFMPEG_PATH, finalArgs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appState.ffmpegProcess.stderr.on('data', (data: any) => log.info(`FFmpeg: ${data}`));

    createTray();
  }, 3800);

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
    { label: 'Stop Recording', click: async () => {
        await stopRecording();
        appState.recorderWin?.webContents.send('recording-finished', { canceled: false, ...appState.currentRecordingSession });
    }},
    { label: 'Cancel Recording', click: async () => {
        await cancelRecording();
        appState.recorderWin?.webContents.send('recording-finished', { canceled: true });
    }},
  ]);
  appState.tray.setToolTip('ScreenArc is recording...');
  appState.tray.setContextMenu(contextMenu);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function startRecording(options: any) { // Type from preload.ts
  const { source, displayId, mic, webcam } = options;
  const display = process.env.DISPLAY || ':0.0';
  const baseFfmpegArgs: string[] = [];
  
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

  if (source === 'fullscreen') {
    const allDisplays = screen.getAllDisplays();
    const targetDisplay = allDisplays.find(d => d.id === displayId) || screen.getPrimaryDisplay();
    const { x, y, width, height } = targetDisplay.bounds;
    const safeWidth = Math.floor(width / 2) * 2;
    const safeHeight = Math.floor(height / 2) * 2;
    switch (process.platform) {
      case 'linux': baseFfmpegArgs.push('-f', 'x11grab', '-video_size', `${safeWidth}x${safeHeight}`, '-i', `${display}+${x},${y}`); break;
      case 'win32': baseFfmpegArgs.push('-f', 'gdigrab', '-offset_x', x.toString(), '-offset_y', y.toString(), '-video_size', `${safeWidth}x${safeHeight}`, '-i', 'desktop'); break;
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
    baseFfmpegArgs.push('-f', 'x11grab', '-video_size', `${selectedGeometry.width}x${selectedGeometry.height}`, '-i', `${display}+${selectedGeometry.x},${selectedGeometry.y}`);
  } else { /* window source logic here if re-enabled */
    return { canceled: true };
  }
  
  appState.originalCursorScale = await getCursorScale();
  return startActualRecording(baseFfmpegArgs, !!webcam, !!mic);
}

export async function stopRecording() {
  restoreOriginalCursorScale();
  log.info('Stopping recording, preparing to save...');
  appState.tray?.destroy();
  appState.tray = null;
  createSavingWindow();
  await cleanupAndSave();
  log.info('Files saved successfully.');

  await new Promise(resolve => setTimeout(resolve, 500));
  appState.savingWin?.close();
  resetCursorScale();
  
  const session = appState.currentRecordingSession;
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
  return new Promise((resolve) => {
    if (appState.mouseTracker) {
      appState.mouseTracker.stop();
      appState.mouseTracker = null;
    }
    if (appState.metadataStream) {
      if (!appState.metadataStream.writableEnded) {
        appState.metadataStream.write('\n]');
        appState.metadataStream.end();
      }
      appState.metadataStream = null;
    }
    if (appState.ffmpegProcess) {
      const ffmpeg = appState.ffmpegProcess;
      appState.ffmpegProcess = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ffmpeg.on('close', (code: any) => {
        log.info(`FFmpeg process exited with code ${code}`);
        resolve();
      });
      log.info('Sending SIGINT to FFmpeg...');
      ffmpeg.stdin.write('q');
      ffmpeg.stdin.end();
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
  if (appState.metadataStream?.writable) {
    appState.metadataStream.end();
    appState.metadataStream = null;
  }
  restoreOriginalCursorScale();
  appState.tray?.destroy();
  appState.tray = null;

  setTimeout(async () => {
    await cleanupEditorFiles(sessionToDiscard);
  }, 200);
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