// Contains business logic for video export.

import log from 'electron-log/main';
import { BrowserWindow, IpcMainInvokeEvent, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { appState } from '../state';
import { getFFmpegPath, calculateExportDimensions } from '../lib/utils';
import { VITE_DEV_SERVER_URL, RENDERER_DIST } from '../lib/constants';

const FFMPEG_PATH = getFFmpegPath();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function startExport(event: IpcMainInvokeEvent, { projectState, exportSettings, outputPath }: any) {
  log.info('[ExportManager] Starting export process...');
  const editorWindow = BrowserWindow.fromWebContents(event.sender);
  if (!editorWindow) return;

  if (appState.renderWorker) {
    appState.renderWorker.close();
  }
  appState.renderWorker = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(process.env.APP_ROOT!, 'dist-electron/preload.mjs'),
      offscreen: true,
    },
  });
  const renderUrl = VITE_DEV_SERVER_URL ? `${VITE_DEV_SERVER_URL}#renderer` : path.join(RENDERER_DIST, 'index.html#renderer');
  appState.renderWorker.loadURL(renderUrl);
  log.info(`[ExportManager] Loading render worker URL: ${renderUrl}`);

  const { resolution, fps, format } = exportSettings;
  const { width: outputWidth, height: outputHeight } = calculateExportDimensions(resolution, projectState.aspectRatio);
  
  const ffmpegArgs = [
    '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo',
    '-pix_fmt', 'rgba', '-s', `${outputWidth}x${outputHeight}`,
    '-r', fps.toString(), '-i', '-',
  ];
  if (format === 'mp4') {
    ffmpegArgs.push('-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p');
  } else {
    ffmpegArgs.push('-vf', 'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse');
  }
  ffmpegArgs.push(outputPath);

  log.info('[ExportManager] Spawning FFmpeg with args:', ffmpegArgs.join(' '));
  const ffmpeg = spawn(FFMPEG_PATH, ffmpegArgs);
  let ffmpegClosed = false;

  ffmpeg.stderr.on('data', (data) => log.info(`[FFmpeg stderr]: ${data.toString()}`));

  const cancellationHandler = () => {
    log.warn('[ExportManager] Received "export:cancel". Terminating export.');
    if (!ffmpegClosed && ffmpeg) ffmpeg.kill('SIGKILL');
    if (appState.renderWorker) appState.renderWorker.close();
    if (fs.existsSync(outputPath)) fsPromises.unlink(outputPath);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const frameListener = (_e: any, { frame, progress }: { frame: Buffer, progress: number }) => {
    if (!ffmpegClosed && ffmpeg.stdin.writable) ffmpeg.stdin.write(frame);
    editorWindow.webContents.send('export:progress', { progress, stage: 'Rendering...' });
  };
  
  const finishListener = () => {
    log.info('[ExportManager] Render finished. Closing FFmpeg stdin.');
    if (!ffmpegClosed) ffmpeg.stdin.end();
  };

  ipcMain.on('export:frame-data', frameListener);
  ipcMain.on('export:render-finished', finishListener);
  ipcMain.on('export:cancel', cancellationHandler);

  ffmpeg.on('close', (code) => {
    ffmpegClosed = true;
    log.info(`[ExportManager] FFmpeg process exited with code ${code}.`);
    appState.renderWorker?.close();
    appState.renderWorker = null;

    if (code === null) { // Cancelled
      editorWindow.webContents.send('export:complete', { success: false, error: 'Export cancelled.' });
    } else if (code === 0) {
      editorWindow.webContents.send('export:complete', { success: true, outputPath });
    } else {
      editorWindow.webContents.send('export:complete', { success: false, error: `FFmpeg exited with code ${code}` });
    }
    
    ipcMain.removeListener('export:frame-data', frameListener);
    ipcMain.removeListener('export:render-finished', finishListener);
    ipcMain.removeListener('export:cancel', cancellationHandler);
  });

  ipcMain.once('render:ready', () => {
    log.info('[ExportManager] Worker ready. Sending project state.');
    appState.renderWorker?.webContents.send('render:start', { projectState, exportSettings });
  });
}