// Handlers for desktop-related IPC (displays, sources, cursor).

import { IpcMainEvent, IpcMainInvokeEvent, screen, desktopCapturer, dialog } from 'electron';
import { exec } from 'node:child_process';
import log from 'electron-log/main';
import { getFFmpegPath } from '../../lib/utils';
import { getCursorSize, setCursorSize } from '../../features/cursor-manager';
import { GRAY_PLACEHOLDER_URL, EXCLUDED_WINDOW_NAMES } from '../../lib/constants';

export function getDisplays() {
  const primaryDisplay = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    name: `Display ${index + 1} (${display.bounds.width}x${display.bounds.height})`,
    bounds: display.bounds,
    isPrimary: display.id === primaryDisplay.id,
  }));
}

export async function getDesktopSources() {
  // ... (logic for Linux and other OS is unchanged)
  if (process.platform === 'linux') {
    return new Promise((resolve, reject) => {
      exec('wmctrl -lG', (error, stdout) => {
        if (error) return reject(error);
        const lines = stdout.trim().split('\n');
        const sourcesPromises = lines.map(line => {
          const match = line.match(/^(0x[0-9a-f]+)\s+[\d-]+\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+[\w-]+\s+(.*)$/);
          if (!match) return null;
          const [, id, x, y, width, height, name] = match;
          if (!name || EXCLUDED_WINDOW_NAMES.some(ex => name.includes(ex)) || parseInt(width) < 50 || parseInt(height) < 50) return null;
          return new Promise(resolveSource => {
            const geometry = { x: parseInt(x), y: parseInt(y), width: parseInt(width), height: parseInt(height) };
            exec(`import -window ${id} -resize 320x180! png:-`, { encoding: 'binary', maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
              const thumbnailUrl = err ? GRAY_PLACEHOLDER_URL : `data:image/png;base64,${Buffer.from(stdout, 'binary').toString('base64')}`;
              resolveSource({ id, name, thumbnailUrl, geometry });
            });
          });
        }).filter(p => p !== null);
        Promise.all(sourcesPromises).then(sources => resolve(sources));
      });
    });
  }
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 320, height: 180 } });
  return sources
    .filter(s => s.name && !EXCLUDED_WINDOW_NAMES.some(ex => s.name.includes(ex)))
    .map(s => ({ id: s.id, name: s.name, thumbnailUrl: s.thumbnail.toDataURL() }));
}

export function handleGetCursorSize() {
  return getCursorSize();
}

export function handleSetCursorSize(_event: IpcMainEvent, size: number) {
  setCursorSize(size);
}

export function showSaveDialog(_event: IpcMainInvokeEvent, options: Electron.SaveDialogOptions) {
    return dialog.showSaveDialog(options);
}

export async function getVideoFrame(_event: IpcMainInvokeEvent, { videoPath, time }: { videoPath: string, time: number }): Promise<string> {
  const FFMPEG_PATH = getFFmpegPath();
  return new Promise((resolve, reject) => {
    log.info(`[Desktop] Extracting frame from "${videoPath}" at ${time}s`);
    const command = `"${FFMPEG_PATH}" -ss ${time} -i "${videoPath}" -vframes 1 -f image2pipe -c:v png -`;
    exec(command, { encoding: 'binary', maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        log.error(`[Desktop] FFmpeg frame extraction error: ${stderr}`);
        return reject(error);
      }
      resolve(`data:image/png;base64,${Buffer.from(stdout, 'binary').toString('base64')}`);
    });
  });
}