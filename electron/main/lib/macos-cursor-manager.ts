/* eslint-disable @typescript-eslint/no-explicit-any */

import log from 'electron-log/main';
import { createRequire } from 'node:module';
import { getBinaryPath } from './utils';
import { createHash } from 'node:crypto';

const hash = (buffer: Buffer) => createHash('sha1').update(buffer).digest('hex');
const require = createRequire(import.meta.url);

let AppKitAPI: any;

const CURSOR_DYLIB_PATH = getBinaryPath('libcursor.dylib');

// These IDs are standard macOS cursor identifiers.
const CURSOR_NAMES = [
  'arrow', 'IBeam', 'crosshair', 'closedHand', 'openHand', 'pointingHand'
];

// Maps the raw handle returned by the DLL to a standardized name.
const cursorImageMap: Record<string, string> = {};
let isInitialized = false;

export function initializeMacOSCursorManager() {
    try {
        AppKitAPI = require('ffi-rs');
        AppKitAPI.open({ library: 'cursorlib', path: CURSOR_DYLIB_PATH });

        for (const name of CURSOR_NAMES) {
            const payload = AppKitAPI.load({
                library: 'cursorlib', funcName: 'getCursorImagePngByName',
                retType: AppKitAPI.DataType.U64,
                paramsType: [AppKitAPI.DataType.String], paramsValue: [name]
            });
            const imageLength = payload.readInt32LE(0);
            const imageBuffer = payload.slice(4, imageLength);
            const imageKey = hash(imageBuffer);
            cursorImageMap[imageKey] = name;
        }
        isInitialized = true;
        log.info('[MacOSCursorManager] Initialized successfully with dylib and created image map.');
    } catch (e) {
        log.error('[MacOSCursorManager] Failed to initialize:', e);
    }
}

export function getCurrentCursorName(): string {
    if (!isInitialized) return 'arrow'; // Default fallback
    try {
        const payload: Buffer = AppKitAPI.load({
            library: 'cursorlib',
            funcName: 'getCurrentCursorImagePng',
            retType: AppKitAPI.DataType.U64,
            paramsType: [], paramsValue: []
        });

        const imageLength = payload.readInt32LE(0);
        const imageBuffer = payload.slice(4, imageLength);
        const imageKey = hash(imageBuffer);
        return cursorImageMap[imageKey] || 'arrow';
    } catch (e) {
        log.warn('[MacOSCursorManager] Could not get current cursor image:', e);
        return 'arrow';
    }
}