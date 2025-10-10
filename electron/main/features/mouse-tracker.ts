/* eslint-disable @typescript-eslint/no-explicit-any */
// Contains logic to track mouse on different platforms.

import log from 'electron-log/main';
import { EventEmitter } from 'node:events';
import { dialog } from 'electron';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { MOUSE_RECORDING_FPS } from '../lib/constants';
import { MOUSE_BUTTONS, MACOS_API } from '../lib/system-constants';
import * as winCursorManager from '../lib/win-cursor-manager';
import { getCursorScale } from './cursor-manager';


const require = createRequire(import.meta.url);
const hash = (buffer: Buffer) => createHash('sha1').update(buffer).digest('hex');

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
  start(cursorImageMap: Map<string, any>): void;
  stop(): void;
}

class LinuxMouseTracker extends EventEmitter implements IMouseTracker {
  private intervalId: NodeJS.Timeout | null = null;
  private X: any | null = null;
  private Fixes: any | null = null;
  private cursorImageMap: Map<string, any> | null = null;
  private lastButtonMask = 0;

  async start(cursorImageMap: Map<string, any>) {
    this.cursorImageMap = cursorImageMap;
    if (!X11Module) {
      log.error("[MouseTracker-Linux] Cannot start, x11 module not loaded.");
      return;
    }
    try {
      const display = await this.createClient();
      this.X = display.client;
      const root = display.screen[0].root;
      
      this.X.require('fixes', (err: Error, Fixes: any) => {
        if (err) {
          log.error('[MouseTracker-Linux] Could not require XFixes extension:', err);
          return;
        }
        this.Fixes = Fixes;
        this.intervalId = setInterval(() => this.pollMouseState(root), 1000 / MOUSE_RECORDING_FPS);
      });

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
  
  private pollMouseState = (root: any) => {
    if (!this.X || !this.Fixes) return;

    this.Fixes.GetCursorImage((err: Error, cursorData: any) => {
      if (err) {
        log.error('[MouseTracker-Linux] Error getting cursor image:', err);
        return;
      }

      if (!this.X) {
        log.error('[MouseTracker-Linux] X11 client not initialized or closed.');
        return;
      }

      this.X.QueryPointer(root, (err: any, pointer: any) => {
        if (err) {
          log.error('[MouseTracker-Linux] Error querying pointer:', err);
          return;
        }
        
        const cursorImage = Buffer.from(cursorData.cursorImage.slice(8));
        const imageKey = hash(cursorImage);

        if (!this.cursorImageMap?.has(imageKey) && cursorImage.length > 0) {
          this.cursorImageMap?.set(imageKey, {
            width: cursorData.width,
            height: cursorData.height,
            xhot: cursorData.xhot,
            yhot: cursorData.yhot,
            image: Array.from(cursorImage), // CHANGE: Store as an array of numbers
          });
        }
        
        const timestamp = Date.now();
        const currentButtonMask = pointer.keyMask & 0x1F00; // Mask for buttons 1-5

        const eventData: any = { timestamp, x: pointer.rootX, y: pointer.rootY, cursorImageKey: imageKey };

        if (currentButtonMask !== this.lastButtonMask) {
          const changedDown = (currentButtonMask & ~this.lastButtonMask);
          const changedUp = (this.lastButtonMask & ~currentButtonMask);
          if (changedDown) {
            this.emit('data', { ...eventData, type: 'click', button: this.mapButton(changedDown), pressed: true });
          }
          if (changedUp) {
            this.emit('data', { ...eventData, type: 'click', button: this.mapButton(changedUp), pressed: false });
          }
        } else {
          this.emit('data', { ...eventData, type: 'move' });
        }
        this.lastButtonMask = currentButtonMask;
      });
    });
  };

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
  private pollIntervalId: NodeJS.Timeout | null = null;
  private cursorImageMap: Map<string, any> | null = null;
  
  private currentCursorName = '';
  private currentAniFrame = 0;
  private latestCursorImageKey = 'default';

  async start(cursorImageMap: Map<string, any>) {
    this.cursorImageMap = cursorImageMap;
    const scale = await getCursorScale();
    await winCursorManager.loadCursorStylesFromRegistry(Math.round(scale));

    // Listen for position/click events
    mouseEvents.on('mousemove', this.handleMouseEvent('move'));
    mouseEvents.on('mousedown', this.handleMouseEvent('click', true));
    mouseEvents.on('mouseup', this.handleMouseEvent('click', false));

    // Poll for cursor shape changes
    this.pollIntervalId = setInterval(() => this.pollCursorState(scale), 1000 / 30); // 30 FPS polling for shape

    log.info('[MouseTracker-Windows] Started.');
  }

  stop() {
    if (this.pollIntervalId) clearInterval(this.pollIntervalId);
    mouseEvents.removeAllListeners();
    log.info('[MouseTracker-Windows] Stopped.');
  }
  
  private handleMouseEvent = (type: 'move' | 'click', isPressed?: boolean) => (event: any) => {
    const data: any = {
      timestamp: Date.now(),
      x: event.x,
      y: event.y,
      type,
      cursorImageKey: this.latestCursorImageKey
    };
    if (type === 'click') {
      data.button = this.mapButton(event.button);
      data.pressed = isPressed;
    }
    this.emit('data', data);
  };
  
  private pollCursorState = (scale: number) => {
    const name = winCursorManager.getCurrentCursorName();
    if (name !== this.currentCursorName) {
      this.currentCursorName = name;
      this.currentAniFrame = 0;
    }

    const cursorData = winCursorManager.getCursorData(name, Math.round(scale));
    if (!cursorData || cursorData.length === 0) {
      this.latestCursorImageKey = 'default'; // Fallback
      return;
    }
    
    const isAnimated = cursorData.length > 1;
    const frame = cursorData[this.currentAniFrame];
    
    if (isAnimated) {
      // Simple frame cycling. A more accurate implementation would use frame.delay.
      this.currentAniFrame = (this.currentAniFrame + 1) % cursorData.length;
    }

    this.latestCursorImageKey = frame.hash;

    if (!this.cursorImageMap?.has(frame.hash)) {
      this.cursorImageMap?.set(frame.hash, {
        width: frame.width,
        height: frame.height,
        xhot: frame.xhot,
        yhot: frame.yhot,
        image: Array.from(frame.rgba), // CHANGE: Store as an array of numbers
      });
    }
  };

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
  private cursorImageMap: Map<string, any> | null = null;

  async start(cursorImageMap: Map<string, any>) {
    this.cursorImageMap = cursorImageMap;
    // macOS cursor capture is complex (requires CoreGraphics) and not part of the request.
    // We will send a placeholder key.
    if (!this.cursorImageMap.has('macos_default_arrow')) {
        this.cursorImageMap.set('macos_default_arrow', { width: 0, height: 0, xhot: 0, yhot: 0, image: [] });
    }
    
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
      const eventData: any = { timestamp, ...pos, cursorImageKey: 'macos_default_arrow' };
      
      this.emit('data', { ...eventData, type: 'move' });

      // Check button states
      const leftPressed = await this.isButtonPressed(MOUSE_BUTTONS.MACOS.LEFT);
      const rightPressed = await this.isButtonPressed(MOUSE_BUTTONS.MACOS.RIGHT);

      if (leftPressed !== this.lastButtonState.left) {
        this.emit('data', { ...eventData, type: 'click', button: 'left', pressed: leftPressed });
        this.lastButtonState.left = leftPressed;
      }
      if (rightPressed !== this.lastButtonState.right) {
        this.emit('data', { ...eventData, type: 'click', button: 'right', pressed: rightPressed });
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