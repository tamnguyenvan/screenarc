/* eslint-disable @typescript-eslint/no-explicit-any */
// electron/main/lib/win-cursor-manager.ts

import log from 'electron-log/main';
import { createRequire } from 'node:module';
import { getBinaryPath } from './utils';
import { parseCursorFile, CursorFrame } from './win-cursor-parser';

const require = createRequire(import.meta.url);

let WinAPI: any;
let Winreg: any;

const CURSOR_DLL_PATH = getBinaryPath('CursorLib.dll');

const CURSOR_IDS = {
    IDC_ARROW: 32512, IDC_IBEAM: 32513, IDC_WAIT: 32514, IDC_CROSS: 32515,
    IDC_UPARROW: 32516, IDC_SIZE: 32640, IDC_ICON: 32641, IDC_SIZENWSE: 32642,
    IDC_SIZENESW: 32643, IDC_SIZEWE: 32644, IDC_SIZENS: 32645, IDC_SIZEALL: 32646,
    IDC_NO: 32648, IDC_HAND: 32649, IDC_APPSTARTING: 32650, IDC_HELP: 32651,
};

const REGISTRY_TO_IDC_MAP: Record<string, string> = {
    'Arrow': 'IDC_ARROW', 'AppStarting': 'IDC_APPSTARTING', 'Crosshair': 'IDC_CROSS',
    'Hand': 'IDC_HAND', 'Help': 'IDC_HELP', 'IBeam': 'IDC_IBEAM', 'No': 'IDC_NO',
    'SizeAll': 'IDC_SIZEALL', 'SizeNESW': 'IDC_SIZENESW', 'SizeNS': 'IDC_SIZENS',
    'SizeNWSE': 'IDC_SIZENWSE', 'SizeWE': 'IDC_SIZEWE', 'UpArrow': 'IDC_UPARROW', 'Wait': 'IDC_WAIT',
};

const handleToNameMap: Record<number, string> = {};
let isInitialized = false;

// Cache for parsed cursor files per scale
const cursorFileCache = new Map<number, Map<string, CursorFrame[]>>();

export function initializeWinCursorManager() {
    try {
        WinAPI = require('ffi-rs');
        Winreg = require('winreg');

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
    if (!isInitialized) return 'IDC_ARROW';
    try {
        const curHandle = WinAPI.load({
            library: 'cursorlib', funcName: 'GetCurrentCursorHandle', retType: WinAPI.DataType.U64,
            paramsType: [], paramsValue: []
        });
        return handleToNameMap[Number(curHandle)] || 'IDC_ARROW';
    } catch (e) {
        log.warn('[WinCursorManager] Could not get current cursor handle:', e);
        return 'IDC_ARROW';
    }
}

export async function loadCursorStylesFromRegistry(scale: number): Promise<void> {
    if (!isInitialized || cursorFileCache.has(scale)) return;
    
    log.info(`[WinCursorManager] Loading cursor styles for scale ${scale}x...`);
    const scaleCache = new Map<string, CursorFrame[]>();
    cursorFileCache.set(scale, scaleCache);

    const regKey = new Winreg({ hive: Winreg.HKCU, key: '\\Control Panel\\Cursors' });
    const items = await new Promise<any[]>((resolve, reject) => {
        regKey.values((err: any, items: any) => err ? reject(err) : resolve(items));
    });

    for (const item of items) {
        const idcName = REGISTRY_TO_IDC_MAP[item.name];
        if (idcName) {
            const filePath = item.value.replace(/%SystemRoot%/i, process.env.SystemRoot || 'C:\\Windows');
            const frames = await parseCursorFile(filePath);
            if (frames.length > 0) {
                scaleCache.set(idcName, frames);
            }
        }
    }
    log.info(`[WinCursorManager] Cached ${scaleCache.size} cursor styles for scale ${scale}x.`);
}

export function getCursorData(name: string, scale: number): CursorFrame[] | undefined {
    return cursorFileCache.get(scale)?.get(name);
}