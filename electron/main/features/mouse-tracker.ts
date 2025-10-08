/* eslint-disable @typescript-eslint/no-explicit-any */
// Contains logic to track mouse on different platforms.

import log from 'electron-log/main';
import { EventEmitter } from 'node:events';
import { dialog } from 'electron';
import { createRequire } from 'node:module';
import { MOUSE_RECORDING_FPS } from '../lib/constants';
import { MOUSE_BUTTONS, MACOS_API } from '../lib/system-constants';

const require = createRequire(import.meta.url);


// --- Dynamic Imports for Platform-Specific Modules ---
let X11Module: any;
let mouseEvents: any;
let ApplicationServices: any;

export function initializeMouseTrackerDependencies() {
  if (process.platform === 'linux') {
    try {
      X11Module = require('x11');
      log.info('[MouseTracker] Successfully loaded x11 module for Linux.');
    } catch (e) {
      log.error('[MouseTracker] Failed to load x11 module. Mouse tracking on Linux will be disabled.', e);
    }
  }

  if (process.platform === 'win32') {
    try {
      mouseEvents = require('global-mouse-events');
      log.info('[MouseTracker] Successfully loaded global-mouse-events for Windows.');
    } catch (e) {
      log.error('[MouseTracker] Failed to load global-mouse-events. Mouse tracking on Windows will be disabled.', e);
    }
  }

  if (process.platform === 'darwin') {
    try {
      ApplicationServices = require('ffi-rs');
      ApplicationServices.open({
        library: "ApplicationServices",
        path: "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices",
      });
      log.info('[MouseTracker] Successfully loaded ApplicationServices for macOS.');
    } catch (e) {
      log.error('[MouseTracker] Failed to load ApplicationServices. Mouse tracking on macOS will be disabled.', e);
    }
  }
}


// --- Interfaces and Classes ---
export interface IMouseTracker extends EventEmitter {
  start(): void;
  stop(): void;
}

class LinuxMouseTracker extends EventEmitter implements IMouseTracker {
  private intervalId: NodeJS.Timeout | null = null;
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
        this.X.QueryPointer(root, (err: any, pointer: any) => {
          if (err) {
            log.error('[MouseTracker-Linux] Error querying pointer:', err);
            return;
          }
          const timestamp = Date.now();
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

  private createClient(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!X11Module) return reject(new Error("x11 module is not available."));
      X11Module.createClient((err: Error, display: any) => err ? reject(err) : resolve(display));
    });
  }

  private mapButton = (code: number) => {
    switch (code) {
      case MOUSE_BUTTONS.LINUX_X11_MASK.LEFT: return 'left';
      case MOUSE_BUTTONS.LINUX_X11_MASK.MIDDLE: return 'middle';
      case MOUSE_BUTTONS.LINUX_X11_MASK.RIGHT: return 'right';
      default: return 'unknown';
    }
  };
}

class WindowsMouseTracker extends EventEmitter implements IMouseTracker {
  private mouseEvents: any | null = null;
  start() {
    this.mouseEvents = mouseEvents;
    this.mouseEvents.on('mousemove', (event: any) => this.emit('data', { timestamp: Date.now(), x: event.x, y: event.y, type: 'move' }));
    this.mouseEvents.on('mousedown', (event: any) => this.emit('data', { timestamp: Date.now(), x: event.x, y: event.y, type: 'click', button: this.mapButton(event.button), pressed: true }));
    this.mouseEvents.on('mouseup', (event: any) => this.emit('data', { timestamp: Date.now(), x: event.x, y: event.y, type: 'click', button: this.mapButton(event.button), pressed: false }));
    log.info('[MouseTracker-Windows] Started.');
  }
  stop() {
    this.mouseEvents?.removeAllListeners();
    this.mouseEvents = null;
    log.info('[MouseTracker-Windows] Stopped.');
  }
  private mapButton = (code: number) => {
    switch (code) {
      case MOUSE_BUTTONS.WINDOWS.LEFT: return 'left';
      case MOUSE_BUTTONS.WINDOWS.RIGHT: return 'right';
      case MOUSE_BUTTONS.WINDOWS.MIDDLE: return 'middle';
      default: return 'unknown';
    }
  };
}

class MacosMouseTracker extends EventEmitter implements IMouseTracker {
  private intervalId: NodeJS.Timeout | null = null;
  private lastButtonState = { left: false, right: false, middle: false };

  async start() {
    if (!ApplicationServices) {
      log.error("[MouseTracker-macOS] Cannot start, ApplicationServices module not loaded.");
      return;
    }
    this.intervalId = setInterval(this.pollMouseState, 1000 / MOUSE_RECORDING_FPS);
    log.info('[MouseTracker-macOS] Started.');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    log.info('[MouseTracker-macOS] Stopped.');
  }

  private pollMouseState = async () => {
    try {
      const event = await ApplicationServices.load({
        library: "ApplicationServices",
        funcName: "CGEventCreate",
        retType: ApplicationServices.DataType.External,
        paramsType: [ApplicationServices.DataType.External],
        paramsValue: [null],
      });

      const location = await ApplicationServices.load({
        library: "ApplicationServices",
        funcName: "CGEventGetLocation",
        retType: ApplicationServices.DataType.DoubleArray,
        paramsType: [ApplicationServices.DataType.External],
        paramsValue: [event],
      });

      if (!Array.isArray(location) || location.length < 2) return;
      
      const pos = { x: location[0], y: location[1] };
      const timestamp = Date.now();
      this.emit('data', { timestamp, ...pos, type: 'move' });

      // Check button states
      const leftPressed = await this.isButtonPressed(MOUSE_BUTTONS.MACOS.LEFT);
      const rightPressed = await this.isButtonPressed(MOUSE_BUTTONS.MACOS.RIGHT);

      if (leftPressed !== this.lastButtonState.left) {
        this.emit('data', { timestamp, ...pos, type: 'click', button: 'left', pressed: leftPressed });
        this.lastButtonState.left = leftPressed;
      }
      if (rightPressed !== this.lastButtonState.right) {
        this.emit('data', { timestamp, ...pos, type: 'click', button: 'right', pressed: rightPressed });
        this.lastButtonState.right = rightPressed;
      }

    } catch (error) {
      log.error('[MouseTracker-macOS] Error polling mouse state:', error);
      this.stop();
    }
  };

  private isButtonPressed = (button: number): Promise<boolean> => {
    return ApplicationServices.load({
      library: "ApplicationServices",
      funcName: "CGEventSourceButtonState",
      retType: ApplicationServices.DataType.Boolean,
      paramsType: [ApplicationServices.DataType.I32, ApplicationServices.DataType.I32],
      paramsValue: [MACOS_API.kCGEventSourceStateHIDSystemState, button],
    });
  };
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
    
    case 'darwin':
      if (!ApplicationServices) {
        dialog.showErrorBox('Dependency Missing', 'Could not load the required module for mouse tracking on macOS.');
        return null;
      }
      return new MacosMouseTracker();
    default:
      log.warn(`Mouse tracking not supported on platform: ${process.platform}`);
      return null;
  }
}