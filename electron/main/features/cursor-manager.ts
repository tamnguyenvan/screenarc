// Contains logic to read and change cursor size on different platforms.

import log from 'electron-log/main';
import { exec } from 'node:child_process';
import { appState } from '../state';
import { getLinuxDE } from '../lib/utils';

// --- Dynamic Imports ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let WinAPI: any | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Winreg: any;

if (process.platform === 'win32') {
  try {
    WinAPI = require('ffi-rs');
    Winreg = require('winreg');
    log.info('[CursorManager] Successfully loaded ffi-rs and winreg for Windows.');
  } catch (e) {
    log.error('[CursorManager] Failed to load Windows-specific modules. Cursor management will be disabled.', e);
  }
}

// --- Functions ---
export async function getCursorSize(): Promise<number> {
  // ... (logic from handleGetCursorSize, unchanged)
  switch (process.platform) {
    case 'win32':
      if (!Winreg) return 32;
      try {
        const regKey = new Winreg({ hive: Winreg.HKCU, key: '\\Control Panel\\Cursors' });
        const item = await new Promise<{ value: string }>((resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          regKey.get('CursorBaseSize', (err: any, item: any) => err ? reject(err) : resolve(item));
        });
        const size = parseInt(item.value, 16);
        if (!isNaN(size)) {
          if (size >= 64) return 64;
          if (size >= 48) return 48;
          return 32;
        }
      } catch (error) {
        log.error('[CursorManager] Failed to get cursor size from Windows Registry:', error);
      }
      return 32;

    case 'linux': {
      const de = getLinuxDE();
      let command: string;
      switch (de) {
        case 'GNOME': command = 'gsettings get org.gnome.desktop.interface cursor-size'; break;
        case 'KDE': command = 'kreadconfig5 --file kcminputrc --group Mouse --key cursorSize'; break;
        case 'XFCE': command = 'xfconf-query -c xsettings -p /Gtk/CursorThemeSize'; break;
        default: return 24;
      }
      return new Promise((resolve) => {
        exec(command, (error, stdout) => {
          if (error) return resolve(24);
          const size = parseInt(stdout.trim(), 10);
          resolve(isNaN(size) ? 24 : size);
        });
      });
    }
    default:
      return 24;
  }
}

export function setCursorSize(scale: number) {
  switch (process.platform) {
    case 'win32': {
      if (!Winreg || !WinAPI) return;
      const size = Math.floor(scale * 32);
      if (![16, 24, 32, 48, 64, 96, 128, 256].includes(size)) return;
      WinAPI.open({ library: 'user32', path: 'user32.dll' });
      const SPI_SETCURSORS = 0x57, SPIF_UPDATEINIFILE = 0x01, SPIF_SENDCHANGE = 0x02;
      const nullPointer = WinAPI.createPointer({ paramsType: [WinAPI.DataType.I32], paramsValue: [0] });
      WinAPI.load({ library: 'user32', funcName: 'SystemParametersInfoW', retType: WinAPI.DataType.Boolean, paramsType: [WinAPI.DataType.U64, WinAPI.DataType.U64, WinAPI.DataType.External, WinAPI.DataType.U64], paramsValue: [SPI_SETCURSORS, 0, WinAPI.unwrapPointer(nullPointer)[0], SPIF_UPDATEINIFILE | SPIF_SENDCHANGE] });
      const sizePointer = WinAPI.createPointer({ paramsType: [WinAPI.DataType.I32], paramsValue: [size] });
      WinAPI.load({ library: 'user32', funcName: 'SystemParametersInfoW', retType: WinAPI.DataType.Boolean, paramsType: [WinAPI.DataType.U64, WinAPI.DataType.U64, WinAPI.DataType.External, WinAPI.DataType.U64], paramsValue: [0x2029, 0, WinAPI.unwrapPointer(sizePointer)[0], SPIF_UPDATEINIFILE] });
      break;
    }
    case 'linux': {
      const size = Math.floor(scale * 24);
      if (![16, 24, 32, 48, 64, 96, 128, 256].includes(size)) return;
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

export function restoreOriginalCursorSize() {
  if (appState.originalCursorSize !== null) {
    log.info(`[CursorManager] Restoring original cursor size to: ${appState.originalCursorSize}`);
    setCursorSize(appState.originalCursorSize);
    appState.originalCursorSize = null;
  }
}

export function resetCursorSize() {
  log.info('[CursorManager] Resetting cursor size to default');
  setCursorSize(1); // Reset to default cursor size
  appState.originalCursorSize = null;
}