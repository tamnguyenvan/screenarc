// Contains utility functions for the main process.

import log from 'electron-log/main';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { exec } from 'node:child_process';
import { ResolutionKey, RESOLUTIONS } from './constants';

export function getFFmpegPath(): string {
  const platform = process.platform === 'win32' ? 'windows' : 'linux';
  const executableName = platform === 'windows' ? 'ffmpeg.exe' : 'ffmpeg';

  if (app.isPackaged) {
    const ffmpegPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'binaries', platform, executableName);
    log.info(`[Production] Using bundled FFmpeg at: ${ffmpegPath}`);
    return ffmpegPath;
  } else {
    const ffmpegPath = path.join(process.env.APP_ROOT!, 'binaries', platform, executableName);
    log.info(`[Development] Using local FFmpeg at: ${ffmpegPath}`);
    return ffmpegPath;
  }
}

export async function ensureDirectoryExists(dirPath: string) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    log.error('Error creating directory:', error);
    throw error;
  }
}

export function getLinuxDE(): 'GNOME' | 'KDE' | 'XFCE' | 'Unknown' {
  const de = process.env.XDG_CURRENT_DESKTOP?.toUpperCase();
  if (de?.includes('GNOME') || de?.includes('UNITY')) return 'GNOME';
  if (de?.includes('KDE') || de?.includes('PLASMA')) return 'KDE';
  if (de?.includes('XFCE')) return 'XFCE';
  log.warn(`[Main] Unknown or unsupported desktop environment: ${de}`);
  return 'Unknown';
}

export async function checkLinuxTools(): Promise<{ [key: string]: boolean }> {
  log.info('Checking Linux tools...');
  if (process.platform !== 'linux') {
    return { wmctrl: true, xwininfo: true, import: true };
  }
  const tools = ['wmctrl', 'xwininfo', 'import'];
  const results: { [key: string]: boolean } = {};
  for (const tool of tools) {
    results[tool] = await new Promise((resolve) => {
      exec(`command -v ${tool}`, (error) => resolve(!error));
    });
  }
  log.info('Linux tools check results:', results);
  return results;
}

export function calculateExportDimensions(resolutionKey: ResolutionKey, aspectRatio: string): { width: number; height: number } {
  const baseHeight = RESOLUTIONS[resolutionKey].height;
  const [ratioW, ratioH] = aspectRatio.split(':').map(Number);
  const width = Math.round(baseHeight * (ratioW / ratioH));
  const finalWidth = width % 2 === 0 ? width : width + 1;
  return { width: finalWidth, height: baseHeight };
}