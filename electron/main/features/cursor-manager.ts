import log from 'electron-log/main';
import { exec } from 'node:child_process';
import { createRequire } from 'node:module';
import { appState } from '../state';
import { getLinuxDE } from '../lib/utils';

const require = createRequire(import.meta.url);

const LINUX_SCALES = [1, 1.5, 2];
const LINUX_BASE_SIZE = 24;

// --- Dynamic Imports ---
let WinAPI: any | undefined;
let Winreg: any;

// A new initialization function to handle async imports
export function initializeCursorDependencies() {
  if (process.platform === 'win32') {
    try {
      // Use dynamic import() which is async
      WinAPI = require('ffi-rs');
      Winreg = require('winreg'); // winreg might be a default export
      log.info('[CursorManager] Successfully loaded ffi-rs and winreg for Windows.');
    } catch (e) {
      log.error('[CursorManager] Failed to load Windows-specific modules. Cursor management will be disabled.', e);
    }
  }
}


// --- Functions ---
export async function getCursorScale(): Promise<number> {
  switch (process.platform) {
    case 'win32':
      // This is now only used for pre-recording detection if needed,
      // but the editor will use its own internal setting.
      // We can keep it for potential future features but it's not critical for the new flow.
      return 1;

    case 'linux': {
      const de = getLinuxDE();
      let command: string;
      switch (de) {
        case 'GNOME': command = 'gsettings get org.gnome.desktop.interface cursor-size'; break;
        case 'KDE': command = 'kreadconfig5 --file kcminputrc --group Mouse --key cursorSize'; break;
        case 'XFCE': command = 'xfconf-query -c xsettings -p /Gtk/CursorThemeSize'; break;
        default: return 1;
      }
      return new Promise((resolve) => {
        exec(command, (error, stdout) => {
          if (error) return resolve(1);
          const size = parseInt(stdout.trim(), 10);
          // Convert size back to scale based on Linux base size of 24
          resolve(isNaN(size) ? 1 : (size / LINUX_BASE_SIZE));
        });
      });
    }
    default:
      return 1; // Default scale is 1x
  }
}

export function setCursorScale(scale: number) {
  switch (process.platform) {
    case 'win32':
    case 'darwin': {
      // On Windows and macOS, we no longer change the system cursor size.
      // This function is now a no-op.
      // The cursor size is handled virtually in the editor (post-processing).
      break;
    }
    case 'linux': {
      if (!LINUX_SCALES.includes(scale)) return;

      // Set cursor size
      const size = Math.floor(scale * LINUX_BASE_SIZE); // Calculate size from scale
      const de = getLinuxDE();
      let command: string;
      switch (de) {
        case 'GNOME': command = `gsettings set org.gnome.desktop.interface cursor-size ${size}`; break;
        case 'KDE': command = `kwriteconfig5 --file kcminputrc --group Mouse --key cursorSize ${size}`; break;
        case 'XFCE': command = `xfconf-query -c xsettings -p /Gtk/CursorThemeSize -s ${size}`; break;
        default: return;
      }
      exec(command, (error, _, stderr) => {
        if (error) log.error(`[CursorManager] Error setting cursor size for ${de}:`, error, stderr);
      });
      break;
    }
    default:
      log.warn(`[CursorManager] Setting cursor size not supported on: ${process.platform}`);
  }
}

export function restoreOriginalCursorScale() {
  if (appState.originalCursorScale !== null) {
    log.info(`[CursorManager] Restoring original cursor scale to: ${appState.originalCursorScale}x`);
    setCursorScale(appState.originalCursorScale);
    appState.originalCursorScale = null;
  }
}

export function resetCursorScale() {
  setCursorScale(1); // Reset to default 1x scale
  appState.originalCursorScale = null;
}