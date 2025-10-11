// Contains utility functions for the main process.

import log from 'electron-log/main';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ResolutionKey, RESOLUTIONS } from './constants';

export function getBinaryPath(name: string): string {
  const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';

  if (app.isPackaged) {
    const binaryPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'binaries', platform, name);
    log.info(`[Production] Using bundled binary at: ${binaryPath}`);
    return binaryPath;
  } else {
    const binaryPath = path.join(process.env.APP_ROOT!, 'binaries', platform, name);
    log.info(`[Development] Using local binary at: ${binaryPath}`);
    return binaryPath;
  }
}

export function getFFmpegPath(): string {
  const name = 'ffmpeg';
  const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';

  // On Windows, most binaries have a .exe, but DLLs don't.
  const executableName = platform === 'windows' ? `${name}.exe` : name;
  const finalName = platform === 'linux' ? name.replace(/\..*$/, '') : executableName;

  return getBinaryPath(finalName);
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

export function calculateExportDimensions(resolutionKey: ResolutionKey, aspectRatio: string): { width: number; height: number } {
  const baseHeight = RESOLUTIONS[resolutionKey].height;
  const [ratioW, ratioH] = aspectRatio.split(':').map(Number);
  const width = Math.round(baseHeight * (ratioW / ratioH));
  const finalWidth = width % 2 === 0 ? width : width + 1;
  return { width: finalWidth, height: baseHeight };
}
