/* eslint-disable @typescript-eslint/no-explicit-any */
import log from 'electron-log/main'
import { EventEmitter } from 'node:events'
import { dialog, screen } from 'electron'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { MOUSE_RECORDING_FPS } from '../lib/constants'
import { MOUSE_BUTTONS } from '../lib/system-constants'
import * as winCursorManager from '../lib/win-cursor-manager'
import * as macosCursorManager from '../lib/macos-cursor-manager'
import { MetaDataItem } from '../types'

const require = createRequire(import.meta.url)
const hash = (buffer: Buffer) => createHash('sha1').update(buffer).digest('hex')

// --- Metadata for Animated Cursors ---
const ANIMATED_CURSORS = {
  win32: {
    IDC_WAIT: { frames: 18, duration: 65 }, // 18 frames, 65ms per frame
    IDC_APPSTARTING: { frames: 18, duration: 65 },
  },
  darwin: {
    // NOTE: The current native module for macOS doesn't reliably identify
    // the spinning wheel cursor by name, so animation is not supported for it.
  },
}

// --- Dynamic Imports for Platform-Specific Modules ---
let X11Module: any
let mouseEvents: any

export function initializeMouseTrackerDependencies() {
  if (process.platform === 'linux') {
    try {
      X11Module = require('x11')
      log.info('[MouseTracker] Successfully loaded x11 module for Linux.')
    } catch (e) {
      log.error('[MouseTracker] Failed to load x11 module. Mouse tracking on Linux will be disabled.', e)
    }
  }

  if (process.platform === 'win32') {
    try {
      mouseEvents = require('global-mouse-events')
      winCursorManager.initializeWinCursorManager()
      log.info('[MouseTracker] Successfully loaded global-mouse-events and initialized win-cursor-manager for Windows.')
    } catch (e) {
      log.error(
        '[MouseTracker] Failed to load Windows-specific modules. Mouse tracking on Windows will be disabled.',
        e,
      )
    }
  }

  if (process.platform === 'darwin') {
    // macOS uses Electron's built-in `screen.getCursorScreenPoint()` polled
    // at MOUSE_RECORDING_FPS — no native module dependency, no Accessibility
    // permission prompt, and works on every fresh clone without a build step.
    // We trade per-click events for zero install friction; the cursor-zoom
    // editor effect still works since it's position-driven. macos-cursor-manager
    // is loaded for cursor-shape identification (independent of iohook).
    macosCursorManager.initializeMacOSCursorManager()
    log.info('[MouseTracker] Initialized macOS mouse tracking via Electron screen API polling.')
  }
}

// --- Interfaces and Classes ---
export interface IMouseTracker extends EventEmitter {
  start(cursorImageMap: Map<string, any>): Promise<boolean>
  stop(): void
}

class LinuxMouseTracker extends EventEmitter implements IMouseTracker {
  private intervalId: NodeJS.Timeout | null = null
  private X: any | null = null
  private Fixes: any | null = null
  private cursorImageMap: Map<string, any> | null = null
  private lastButtonMask = 0

  async start(cursorImageMap: Map<string, any>): Promise<boolean> {
    this.cursorImageMap = cursorImageMap
    if (!X11Module) {
      log.error('[MouseTracker-Linux] Cannot start, x11 module not loaded.')
      return false
    }
    try {
      const display = await this.createClient()
      this.X = display.client
      const root = display.screen[0].root

      this.X.require('fixes', (err: Error, Fixes: any) => {
        if (err) {
          log.error('[MouseTracker-Linux] Could not require XFixes extension:', err)
          return
        }
        this.Fixes = Fixes
        this.intervalId = setInterval(() => this.pollMouseState(root), 1000 / MOUSE_RECORDING_FPS)
      })

      this.X.on('error', (err: any) => log.error('[MouseTracker-Linux] X11 client error:', err))
      return true
    } catch (err) {
      log.error('[MouseTracker-Linux] Failed to start:', err)
      return false
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.X?.close()
    this.X = null
    log.info('[MouseTracker-Linux] Stopped.')
  }

  private pollMouseState = (root: any) => {
    if (!this.X || !this.Fixes) return

    this.Fixes.GetCursorImage((err: Error, cursorData: any) => {
      if (err) {
        log.error('[MouseTracker-Linux] Error getting cursor image:', err)
        return
      }

      if (!this.X) {
        log.error('[MouseTracker-Linux] X11 client not initialized or closed.')
        return
      }

      this.X.QueryPointer(root, (err: any, pointer: any) => {
        if (err) {
          log.error('[MouseTracker-Linux] Error querying pointer:', err)
          return
        }

        const cursorImage = Buffer.from(cursorData.cursorImage.slice(8))
        const imageKey = hash(cursorImage)

        if (!this.cursorImageMap?.has(imageKey) && cursorImage.length > 0) {
          this.cursorImageMap?.set(imageKey, {
            width: cursorData.width,
            height: cursorData.height,
            xhot: cursorData.xhot,
            yhot: cursorData.yhot,
            image: Array.from(cursorImage), // CHANGE: Store as an array of numbers
          })
        }

        const timestamp = Date.now()
        const currentButtonMask = pointer.keyMask & 0x1f00 // Mask for buttons 1-5

        const eventData: any = { timestamp, x: pointer.rootX, y: pointer.rootY, cursorImageKey: imageKey }

        if (currentButtonMask !== this.lastButtonMask) {
          const changedDown = currentButtonMask & ~this.lastButtonMask
          const changedUp = this.lastButtonMask & ~currentButtonMask
          if (changedDown) {
            this.emit('data', { ...eventData, type: 'click', button: this.mapButton(changedDown), pressed: true })
          }
          if (changedUp) {
            this.emit('data', { ...eventData, type: 'click', button: this.mapButton(changedUp), pressed: false })
          }
        } else {
          this.emit('data', { ...eventData, type: 'move' })
        }
        this.lastButtonMask = currentButtonMask
      })
    })
  }

  private createClient(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!X11Module) return reject(new Error('x11 module is not available.'))
      X11Module.createClient((err: Error, display: any) => (err ? reject(err) : resolve(display)))
    })
  }

  private mapButton = (code: number) => {
    switch (code) {
      case MOUSE_BUTTONS.LINUX_X11_MASK.LEFT:
        return 'left'
      case MOUSE_BUTTONS.LINUX_X11_MASK.MIDDLE:
        return 'middle'
      case MOUSE_BUTTONS.LINUX_X11_MASK.RIGHT:
        return 'right'
      default:
        return 'unknown'
    }
  }
}

class WindowsMouseTracker extends EventEmitter implements IMouseTracker {
  private pollIntervalId: NodeJS.Timeout | null = null

  private currentCursorName = ''
  private currentAniFrame = 0
  private lastPosition = { x: 0, y: 0 }
  private animationStartTime: number | null = null

  async start(): Promise<boolean> {
    // Listen for position changes to update our state.
    mouseEvents.on('mousemove', (event: any) => {
      this.lastPosition = { x: event.x, y: event.y }
    })

    // Listen for click events and emit them directly.
    mouseEvents.on('mousedown', (event: any) => this.emitClickEvent(event, true))
    mouseEvents.on('mouseup', (event: any) => this.emitClickEvent(event, false))

    // This poller is the SOLE source of 'move' events, ensuring a constant stream.
    this.pollIntervalId = setInterval(() => this.pollAndEmitMove(), 1000 / MOUSE_RECORDING_FPS)

    log.info('[MouseTracker-Windows] Started.')
    return true
  }

  stop() {
    if (this.pollIntervalId) clearInterval(this.pollIntervalId)
    mouseEvents.removeAllListeners()
    log.info('[MouseTracker-Windows] Stopped.')
  }

  private emitClickEvent = (event: any, isPressed: boolean) => {
    // A click event provides the most up-to-date cursor position.
    this.lastPosition = { x: event.x, y: event.y }
    // Check for cursor shape changes right before emitting the click.
    this.updateCursorState()

    const data: MetaDataItem = {
      timestamp: Date.now(),
      x: event.x,
      y: event.y,
      type: 'click',
      cursorImageKey: `${this.currentCursorName}-${this.currentAniFrame}`,
      button: this.mapButton(event.button),
      pressed: isPressed,
    }
    this.emit('data', data)
  }

  private pollAndEmitMove = () => {
    this.updateCursorState()

    const data: MetaDataItem = {
      timestamp: Date.now(),
      x: this.lastPosition.x,
      y: this.lastPosition.y,
      type: 'move',
      cursorImageKey: `${this.currentCursorName}-${this.currentAniFrame}`,
    }
    this.emit('data', data)
  }

  private updateCursorState = () => {
    const name = winCursorManager.getCurrentCursorName()
    const animInfo = ANIMATED_CURSORS.win32[name as keyof typeof ANIMATED_CURSORS.win32]

    if (name !== this.currentCursorName) {
      this.currentCursorName = name
      if (animInfo) {
        // New animated cursor detected, start the timer.
        this.animationStartTime = Date.now()
        this.currentAniFrame = 0
      } else {
        // Not animated, reset timer and frame.
        this.animationStartTime = null
        this.currentAniFrame = 0
      }
    } else if (animInfo && this.animationStartTime) {
      // Same animated cursor, calculate the current frame.
      const elapsedTime = Date.now() - this.animationStartTime
      this.currentAniFrame = Math.floor(elapsedTime / animInfo.duration) % animInfo.frames
    }
  }

  private mapButton = (code: number) => {
    switch (code) {
      case MOUSE_BUTTONS.WINDOWS.LEFT:
        return 'left'
      case MOUSE_BUTTONS.WINDOWS.RIGHT:
        return 'right'
      case MOUSE_BUTTONS.WINDOWS.MIDDLE:
        return 'middle'
      default:
        return 'unknown'
    }
  }
}

// macOS implementation that polls Electron's `screen.getCursorScreenPoint()`
// at MOUSE_RECORDING_FPS. This avoids the iohook-macos native module, which
// ships broken on npm (no prebuilt, no source) and would otherwise require
// every developer to clone and build a third-party native module from source.
//
// Trade-off: we get cursor *position* (the input the editor cursor-zoom
// effect needs) but not click events. Click events would require a global
// CGEventTap, which needs both an Accessibility permission grant *and* a
// working native binding. If clicks become essential, swap this for a Swift
// helper subprocess that taps CGEventTap and pipes events over stdio.
class MacOSMouseTracker extends EventEmitter implements IMouseTracker {
  private pollIntervalId: NodeJS.Timeout | null = null
  private currentCursorName = 'arrow'
  private currentAniFrame = 0

  async start(): Promise<boolean> {
    this.pollIntervalId = setInterval(() => this.pollAndEmitMove(), 1000 / MOUSE_RECORDING_FPS)
    log.info('[MouseTracker-macOS] Started (Electron screen.getCursorScreenPoint polling).')
    return true
  }

  stop() {
    if (this.pollIntervalId) clearInterval(this.pollIntervalId)
    this.pollIntervalId = null
    log.info('[MouseTracker-macOS] Stopped.')
  }

  private pollAndEmitMove = () => {
    let point: { x: number; y: number }
    try {
      point = screen.getCursorScreenPoint()
    } catch (err) {
      log.error('[MouseTracker-macOS] getCursorScreenPoint threw:', err)
      return
    }

    // `screen.getCursorScreenPoint()` returns coordinates in DIPs (logical
    // pixels), but `recordingGeometry` over in recording-manager.ts is in
    // physical pixels (multiplied by display.scaleFactor). On a Retina
    // display these differ by 2×, so without this conversion the geometry
    // filter would reject most points and the editor would render the
    // cursor in the wrong place. Convert here, once, in the only spot that
    // sources DIP coordinates.
    const display = screen.getDisplayNearestPoint(point)
    const scale = display.scaleFactor || 1
    const physicalX = Math.round(point.x * scale)
    const physicalY = Math.round(point.y * scale)

    this.updateCursorState()

    const data: MetaDataItem = {
      timestamp: Date.now(),
      x: physicalX,
      y: physicalY,
      type: 'move',
      cursorImageKey: `${this.currentCursorName}-${this.currentAniFrame}`,
    }
    this.emit('data', data)
  }

  private updateCursorState = () => {
    this.currentCursorName = macosCursorManager.getCurrentCursorName()
    // Animated cursors (spinning wheel) aren't identifiable by name with the
    // native cursor module, so animation frame calculation stays at 0.
    this.currentAniFrame = 0
  }
}

// --- Factory Function ---
export function createMouseTracker(): IMouseTracker | null {
  switch (process.platform) {
    case 'linux':
      if (!X11Module) {
        dialog.showErrorBox('Dependency Missing', 'Could not load the required module for mouse tracking on Linux.')
        return null
      }
      return new LinuxMouseTracker()
    case 'win32':
      if (mouseEvents) {
        return new WindowsMouseTracker()
      }
      log.warn('[MouseTracker] Native global-mouse-events unavailable, falling back to screen polling.')
      return new MacOSMouseTracker()

    case 'darwin':
      // Always available — uses Electron's built-in screen API, no native deps.
      return new MacOSMouseTracker()
    default:
      log.warn(`Mouse tracking not supported on platform: ${process.platform}`)
      return null
  }
}
