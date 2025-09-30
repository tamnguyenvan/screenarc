// Contains logic to track mouse on different platforms.

import log from 'electron-log/main';
import { EventEmitter } from 'node:events';
import { dialog } from 'electron';
import { MOUSE_RECORDING_FPS } from '../lib/constants';

// --- Dynamic Imports for Platform-Specific Modules ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let X11Module: any;
if (process.platform === 'linux') {
  try {
    X11Module = require('x11');
    log.info('[MouseTracker] Successfully loaded x11 module for Linux.');
  } catch (e) {
    log.error('[MouseTracker] Failed to load x11 module. Mouse tracking on Linux will be disabled.', e);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mouseEvents: any;
if (process.platform === 'win32') {
  try {
    mouseEvents = require('global-mouse-events');
    log.info('[MouseTracker] Successfully loaded global-mouse-events for Windows.');
  } catch (e) {
    log.error('[MouseTracker] Failed to load global-mouse-events. Mouse tracking on Windows will be disabled.', e);
  }
}

// --- Interfaces and Classes ---
export interface IMouseTracker extends EventEmitter {
  start(): void;
  stop(): void;
}

class LinuxMouseTracker extends EventEmitter implements IMouseTracker {
  private intervalId: NodeJS.Timeout | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private X: any | null = null;

  async start() {
    if (!X11Module) {
      log.error("[MouseTracker-Linux] Cannot start, x11 module not loaded.");
      return;
    }
    try {
      const display = await this.createClient();
      this.X = display.client;
      const root = display.screen[0].root;

      const queryPointer = () => {
        if (!this.X) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.X.QueryPointer(root, (err: any, pointer: any) => {
          if (err) {
            log.error('[MouseTracker-Linux] Error querying pointer:', err);
            return;
          }
          const timestamp = Date.now();
          // ... (rest of the logic is identical)
          switch (pointer.keyMask) {
            case 0:
              this.emit('data', { timestamp, x: pointer.rootX, y: pointer.rootY, type: 'move' });
              break;
            case 256: case 512: case 1024:
              this.emit('data', { timestamp, x: pointer.rootX, y: pointer.rootY, type: 'click', button: this.mapButton(pointer.keyMask), pressed: true });
              break;
          }
        });
      };
      this.intervalId = setInterval(queryPointer, 1000 / MOUSE_RECORDING_FPS);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.X.on('error', (err: any) => log.error('[MouseTracker-Linux] X11 client error:', err));
    } catch (err) {
      log.error('[MouseTracker-Linux] Failed to start:', err);
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.X?.close();
    this.X = null;
    log.info('[MouseTracker-Linux] Stopped.');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private createClient(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!X11Module) return reject(new Error("x11 module is not available."));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      X11Module.createClient((err: Error, display: any) => err ? reject(err) : resolve(display));
    });
  }

  private mapButton = (code: number) => ({ 256: 'left', 512: 'middle', 1024: 'right' })[code] || 'unknown';
}

class WindowsMouseTracker extends EventEmitter implements IMouseTracker {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mouseEvents: any | null = null;
  start() {
    this.mouseEvents = mouseEvents;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.mouseEvents.on('mousemove', (event: any) => this.emit('data', { timestamp: Date.now(), x: event.x, y: event.y, type: 'move' }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.mouseEvents.on('mousedown', (event: any) => this.emit('data', { timestamp: Date.now(), x: event.x, y: event.y, type: 'click', button: this.mapButton(event.button), pressed: true }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.mouseEvents.on('mouseup', (event: any) => this.emit('data', { timestamp: Date.now(), x: event.x, y: event.y, type: 'click', button: this.mapButton(event.button), pressed: false }));
    log.info('[MouseTracker-Windows] Started.');
  }
  stop() {
    this.mouseEvents?.removeAllListeners();
    this.mouseEvents = null;
    log.info('[MouseTracker-Windows] Stopped.');
  }
  private mapButton = (code: number) => ({ 1: 'left', 2: 'right', 3: 'middle' })[code] || 'unknown';
}

// --- Factory Function ---
export function createMouseTracker(): IMouseTracker | null {
  switch (process.platform) {
    case 'linux':
      if (!X11Module) {
        dialog.showErrorBox('Dependency Missing', 'Could not load the required module for mouse tracking on Linux.');
        return null;
      }
      return new LinuxMouseTracker();
    case 'win32':
      if (!mouseEvents) {
        dialog.showErrorBox('Dependency Missing', 'Could not load the required module for mouse tracking on Windows.');
        return null;
      }
      return new WindowsMouseTracker();
    default:
      log.warn(`Mouse tracking not supported on platform: ${process.platform}`);
      return null;
  }
}