/* eslint-disable @typescript-eslint/no-explicit-any */
// electron/main/lib/win-cursor-manager.ts

import log from 'electron-log/main';
import { createRequire } from 'node:module';
import { getBinaryPath } from './utils';

const require = createRequire(import.meta.url);

let WinAPI: any;

const CURSOR_DLL_PATH = getBinaryPath('CursorLib.dll');

// These IDs are standard Windows cursor identifiers.
const CURSOR_IDS = {
    IDC_ARROW: 32512, IDC_IBEAM: 32513, IDC_WAIT: 32514, IDC_CROSS: 32515,
    IDC_UPARROW: 32516, IDC_SIZE: 32640, IDC_ICON: 32641, IDC_SIZENWSE: 32642,
    IDC_SIZENESW: 32643, IDC_SIZEWE: 32644, IDC_SIZENS: 32645, IDC_SIZEALL: 32646,
    IDC_NO: 32648, IDC_HAND: 32649, IDC_APPSTARTING: 32650, IDC_HELP: 32651,
};

// Maps cursor names from the cpack to the standard Windows IDC names.
// This is important because file names might differ from standard constants.
const CPACK_TO_IDC_MAP: Record<string, string> = {
  'Arrow': 'IDC_ARROW', 'AppStarting': 'IDC_APPSTARTING', 'Cross': 'IDC_CROSS',
  'Hand': 'IDC_HAND', 'Help': 'IDC_HELP', 'IBeam': 'IDC_IBEAM', 'NO': 'IDC_NO',
  'SizeAll': 'IDC_SIZEALL', 'SizeNESW': 'IDC_SIZENESW', 'SizeNS': 'IDC_SIZENS',
  'SizeNWSE': 'IDC_SIZENWSE', 'SizeWE': 'IDC_SIZEWE', 'UpArrow': 'IDC_UPARROW', 'Wait': 'IDC_WAIT',
};

// Maps the raw handle returned by the DLL to a standardized name.
const handleToNameMap: Record<number, string> = {};
let isInitialized = false;

export function initializeWinCursorManager() {
    try {
        WinAPI = require('ffi-rs');
        WinAPI.open({ library: 'cursorlib', path: CURSOR_DLL_PATH });

        for (const [name, id] of Object.entries(CURSOR_IDS)) {
            const handle = WinAPI.load({
                library: 'cursorlib', funcName: 'LoadCursorById', retType: WinAPI.DataType.U64,
                paramsType: [WinAPI.DataType.U64], paramsValue: [id]
            });
            if (handle) handleToNameMap[Number(handle)] = name;
        }
        isInitialized = true;
        log.info('[WinCursorManager] Initialized successfully with DLL and created handle map.');
    } catch (e) {
        log.error('[WinCursorManager] Failed to initialize:', e);
    }
}

export function getCurrentCursorName(): string {
    if (!isInitialized) return 'IDC_ARROW'; // Default fallback
    try {
        const curHandle = WinAPI.load({
            library: 'cursorlib', funcName: 'GetCurrentCursorHandle', retType: WinAPI.DataType.U64,
            paramsType: [], paramsValue: []
        });
        // The name from the handle map (e.g., 'IDC_ARROW') is directly compatible with the tracker.
        // We will later map the CPack file names ('Arrow') to these standard names.
        return handleToNameMap[Number(curHandle)] || 'IDC_ARROW';
    } catch (e) {
        log.warn('[WinCursorManager] Could not get current cursor handle:', e);
        return 'IDC_ARROW';
    }
}

/**
 * Maps a cpack file base name (e.g., "Arrow") to a standard IDC name (e.g., "IDC_ARROW").
 * @param cpackName The base name of the cursor file from the cpack.
 * @returns The corresponding IDC_ constant name, or the original name if not found.
 */
export function mapCpackNameToIDC(cpackName: string): string {
    return CPACK_TO_IDC_MAP[cpackName] || cpackName;
}
