// Contains logic to read and change cursor size on different platforms.

import log from 'electron-log/main';
import { exec } from 'node:child_process';
import { appState } from '../state';
import { getLinuxDE } from '../lib/utils';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const LINUX_SCALES = [1, 1.5, 2];
const LINUX_BASE_SIZE = 24;
const WINDOWS_SCALES = [1, 2, 3];
const WINDOWS_BASE_SIZE = 32;

// --- Dynamic Imports ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let WinAPI: any | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // Check if Winreg was loaded successfully
      if (!Winreg) return 1;
      try {
        const regKey = new Winreg({ hive: Winreg.HKCU, key: '\\Control Panel\\Cursors' });
        const item = await new Promise<{ value: string }>((resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          regKey.get('CursorBaseSize', (err: any, item: any) => err ? reject(err) : resolve(item));
        });
        const size = parseInt(item.value, 16);
        if (!isNaN(size)) {
          // Convert size back to scale based on Windows base size of 32
          return Math.round((size / 32));
        }
      } catch (error) {
        log.error('[CursorManager] Failed to get cursor size from Windows Registry:', error);
      }
      return 1; // Default scale is 1x

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
// ... (rest of the file is unchanged)
export function setCursorScale(scale: number) {
  switch (process.platform) {
    case 'win32': {
      if (!Winreg || !WinAPI) return;
      if (!WINDOWS_SCALES.includes(scale)) return;

      const size = Math.floor(scale * WINDOWS_BASE_SIZE); // Calculate size from scale

      // Open user32.dll
      WinAPI.open({ library: 'user32', path: 'user32.dll' });

      const SPI_SETCURSORS = 0x57;
      const SPIF_UPDATEINIFILE = 0x01;
      const SPIF_SENDCHANGE = 0x02;

      // Set cursor size
      const nullPointer = WinAPI.createPointer({ paramsType: [WinAPI.DataType.I32], paramsValue: [0] });
      WinAPI.load({
        library: 'user32',
        funcName: 'SystemParametersInfoW',
        retType: WinAPI.DataType.Boolean,
        paramsType: [WinAPI.DataType.U64, WinAPI.DataType.U64, WinAPI.DataType.External, WinAPI.DataType.U64],
        paramsValue: [SPI_SETCURSORS, 0, WinAPI.unwrapPointer(nullPointer)[0], SPIF_UPDATEINIFILE | SPIF_SENDCHANGE]
      });

      // Reload cursor theme
      const sizePointer = WinAPI.createPointer({ paramsType: [WinAPI.DataType.I32], paramsValue: [size] });
      WinAPI.load({
        library: 'user32',
        funcName: 'SystemParametersInfoW',
        retType: WinAPI.DataType.Boolean,
        paramsType: [WinAPI.DataType.U64, WinAPI.DataType.U64, WinAPI.DataType.External, WinAPI.DataType.U64],
        paramsValue: [0x2029, 0, WinAPI.unwrapPointer(sizePointer)[0], SPIF_UPDATEINIFILE]
      });
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