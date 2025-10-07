// Handlers for desktop-related IPC (displays, sources, cursor).

import { IpcMainEvent, IpcMainInvokeEvent, screen, dialog } from 'electron';
import { exec } from 'node:child_process';
import log from 'electron-log/main';
import { getFFmpegPath } from '../../lib/utils';
import { getCursorScale, setCursorScale } from '../../features/cursor-manager';

export function getDisplays() {
  const primaryDisplay = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    name: `Display ${index + 1} (${display.bounds.width}x${display.bounds.height})`,
    bounds: display.bounds,
    isPrimary: display.id === primaryDisplay.id,
  }));
}

export function handleGetCursorScale() {
  return getCursorScale();
}

export function handleSetCursorScale(_event: IpcMainEvent, scale: number) {
  setCursorScale(scale);
}

export function showSaveDialog(_event: IpcMainInvokeEvent, options: Electron.SaveDialogOptions) {
    return dialog.showSaveDialog(options);
}

export async function getVideoFrame(_event: IpcMainInvokeEvent, { videoPath, time }: { videoPath: string, time: number }): Promise<string> {
  const FFMPEG_PATH = getFFmpegPath();
  return new Promise((resolve, reject) => {
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

export async function getDshowDevices(): Promise<{ video: { name: string, alternativeName: string }[], audio: { name: string, alternativeName: string }[] }> {
  if (process.platform !== 'win32') {
    return { video: [], audio: [] };
  }

  const FFMPEG_PATH = getFFmpegPath();
  const command = `"${FFMPEG_PATH}" -hide_banner -list_devices true -f dshow -i dummy`;

  return new Promise((resolve) => {
    exec(command, (_error, _stdout, stderr) => {
      // The command is expected to "fail" and output to stderr, which is normal for this command.
      const lines = stderr.split('\n');
      const video: { name: string, alternativeName: string }[] = [];
      const audio: { name: string, alternativeName: string }[] = [];

      let lastDevice: { name: string, type: 'video' | 'audio' } | null = null;

      for (const line of lines) {
        const friendlyNameMatch = line.match(/\[dshow.*\] "([^"]+)" \((video|audio)\)/);
        if (friendlyNameMatch) {
          const [, name, type] = friendlyNameMatch;
          lastDevice = { name, type: type as 'video' | 'audio' };
          continue;
        }

        const altNameMatch = line.match(/\[dshow.*\]\s+Alternative name "([^"]+)"/);
        if (altNameMatch && lastDevice) {
          const [, alternativeName] = altNameMatch;
          if (lastDevice.type === 'video') {
            video.push({ name: lastDevice.name, alternativeName });
          } else {
            audio.push({ name: lastDevice.name, alternativeName });
          }
          lastDevice = null; // Reset for the next device
        }
      }

      log.info(`[Desktop] Found dshow devices: ${video.length} video, ${audio.length} audio.`);
      resolve({ video, audio });
    });
  });
}