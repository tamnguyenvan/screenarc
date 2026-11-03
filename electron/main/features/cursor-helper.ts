// The app's side of the Wayland cursor helper.
//
// The helper (native/cursor-helper, Rust) owns a screen-cast session with
// cursor_mode = METADATA, which is the only way to learn where the pointer is on
// Wayland: it writes raw frames to a descriptor and cursor samples as JSON lines
// to its stdout. This module starts it, decodes that stream, and hands the frames
// to FFmpeg — the same binary the app already bundles and already uses for the X11
// capture, so nothing here re-encodes anything.
//
// Nothing in this file is required for the app to work: when the helper is absent,
// fails, or cannot report the pointer separately, the caller keeps using the
// browser capture path exactly as before. That is deliberate — the helper earns its
// place only by delivering something the browser path cannot.

import log from 'electron-log/main'
import { spawn, type ChildProcess } from 'node:child_process'
import type { Readable } from 'node:stream'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'

const HELPER_NAME = 'demothat-cursor-helper'
/** How long to wait for the compositor's picker and the first frame. */
const START_TIMEOUT_MS = 120_000
/** How long the helper gets to shut down before it is killed. */
const STOP_TIMEOUT_MS = 3_000

export interface CursorSample {
  timestamp: number
  x: number
  y: number
  type: 'move' | 'click'
  button?: string
  pressed?: boolean
  /** The bitmap this sample points at: see `CursorShape`. */
  cursorImageKey?: string
}

/** The pointer's bitmap, as the compositor draws it. */
export interface CursorShape {
  key: string
  width: number
  height: number
  /** Hotspot inside the bitmap: the editor draws at `(x - xhot, y - yhot)`. */
  xhot: number
  yhot: number
  /** RGBA bytes, the order `ImageData` takes. */
  image: number[]
}

export interface HelperStartInfo {
  width: number
  height: number
  /** FFmpeg pix_fmt name for the raw frames, e.g. `bgra`. */
  format: string
  /** Frames per second the compositor actually produces. */
  fps: number
  cursorMode: 'metadata' | 'embedded'
  clicks: boolean
}

export interface CursorHelperSession {
  info: HelperStartInfo
  /** Raw frames, ready to be piped into FFmpeg's stdin. */
  video: Readable
  /** Asks the helper to finish, killing it if it will not. */
  stop: () => Promise<void>
}

/**
 * Where the helper lives: built into the repo for development, bundled beside the
 * app's resources once packaged.
 */
export function helperBinaryPath(): string | null {
  const candidates: string[] = []
  try {
    if (app.isPackaged) {
      candidates.push(path.join(process.resourcesPath, 'cursor-helper', HELPER_NAME))
    } else {
      // Development: the built binary inside the repo. `getAppPath` is the project
      // root when running under Electron, but a plain `node` run of a test has no
      // Electron at all, hence the fallback.
      const roots = new Set<string>()
      try {
        roots.add(app.getAppPath())
      } catch {
        // Not running inside Electron.
      }
      roots.add(process.cwd())
      for (const root of roots) {
        candidates.push(path.resolve(root, 'native', 'cursor-helper', 'target', 'release', HELPER_NAME))
      }
    }

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
      } catch {
        // A path we cannot stat is simply not a candidate.
      }
    }
  } catch {
    // Any failure here means "no helper", never a broken recording.
  }
  return null
}

/** True when recordings should be taken over by the helper on this machine. */
export function isCursorHelperAvailable(): boolean {
  return process.platform === 'linux' && helperBinaryPath() !== null
}

/** The JSON the helper is started with. Kept pure so the shape is testable. */
export function helperConfig(videoFd: number, fps: number): string {
  // The click reader self-exits after this idle gap so a helper that outlives
  // its recording cannot poll forever — but a live recording can easily pause
  // for a few seconds (reading, thinking, waiting), so 2s would kill every
  // click after the first pause. The app stops the helper explicitly at stop,
  // so this is only a leak guard: 10 minutes.
  return JSON.stringify({ videoFd, fps, clickIdleTimeoutMs: 600_000 })
}

/** Anything implausible is replaced by the rate the app asked for. */
export function normaliseFps(value: number): number {
  return Number.isFinite(value) && value >= 1 && value <= 240 ? Math.round(value) : 30
}

export interface ParserHandlers {
  onStart: (info: HelperStartInfo) => void
  onSample: (sample: CursorSample) => void
  /** Optional: a caller with no use for the bitmap simply does not ask for it. */
  onShape?: (shape: CursorShape) => void
  onWarning: (message: string) => void
  onError: (message: string) => void
  onEnd: (frames: number, dropped: number) => void
}

/**
 * Decodes the helper's NDJSON stream.
 *
 * Line-based and incremental on purpose: a chunk boundary can fall in the middle of
 * a line, so a partial line is held until the rest arrives.
 */
export function createEventParser(handlers: ParserHandlers) {
  let buffered = ''

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let event: Record<string, unknown>
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      // A malformed line is not worth ending a recording over.
      log.warn(`[CursorHelper] Ignoring unreadable event: ${trimmed.slice(0, 200)}`)
      return
    }

    switch (event.type) {
      case 'started':
        handlers.onStart({
          width: Number(event.width) || 0,
          height: Number(event.height) || 0,
          format: typeof event.format === 'string' && event.format ? event.format : 'bgra',
          // The compositor's rate, not ours: raw frames are stamped at whatever we
          // declare, so a wrong value changes the recording's duration.
          fps: normaliseFps(Number(event.fps)),
          cursorMode: event.cursor_mode === 'metadata' ? 'metadata' : 'embedded',
          clicks: event.clicks === true,
        })
        return
      case 'move':
      case 'click': {
        // Strictly numbers: a missing or null coordinate is not a position at the
        // origin, it is a sample the helper could not fill in.
        if (typeof event.x !== 'number' || typeof event.y !== 'number') return
        if (!Number.isFinite(event.x) || !Number.isFinite(event.y)) return
        handlers.onSample({
          timestamp: typeof event.timestamp === 'number' ? event.timestamp : Date.now(),
          x: event.x,
          y: event.y,
          type: event.type,
          button: typeof event.button === 'string' ? event.button : undefined,
          pressed: event.pressed === true,
          cursorImageKey: typeof event.cursor_image_key === 'string' ? event.cursor_image_key : undefined,
        })
        return
      }
      case 'cursor_shape': {
        // The pointer's bitmap. Everything about it is checked, because the failure
        // it guards against is silent: an image the editor cannot build produces a
        // recording with no cursor at all, which reads as the app being broken
        // rather than as one unreadable buffer.
        const key = typeof event.key === 'string' ? event.key : ''
        const width = Number(event.width)
        const height = Number(event.height)
        const rgba = typeof event.rgba_base64 === 'string' ? Buffer.from(event.rgba_base64, 'base64') : null
        if (!key || !rgba) return
        if (!Number.isInteger(width) || !Number.isInteger(height)) return
        if (width <= 0 || height <= 0 || width > 512 || height > 512) return
        if (rgba.length !== width * height * 4) return
        handlers.onShape?.({
          key,
          width,
          height,
          xhot: Number(event.hot_x) || 0,
          yhot: Number(event.hot_y) || 0,
          image: Array.from(rgba),
        })
        return
      }
      case 'warning':
        handlers.onWarning(String(event.message ?? ''))
        return
      case 'error':
        handlers.onError(String(event.message ?? 'unknown helper error'))
        return
      case 'ended':
        handlers.onEnd(Number(event.frames) || 0, Number(event.dropped) || 0)
        return
      default:
        log.warn(`[CursorHelper] Ignoring unknown event type: ${String(event.type)}`)
    }
  }

  return {
    push(chunk: string) {
      buffered += chunk
      let newline = buffered.indexOf('\n')
      while (newline !== -1) {
        handleLine(buffered.slice(0, newline))
        buffered = buffered.slice(newline + 1)
        newline = buffered.indexOf('\n')
      }
    },
  }
}

let active: ChildProcess | null = null

/**
 * Starts the helper and waits until the compositor has handed over a stream.
 *
 * Returns null — after cleaning up — for every outcome the caller should treat as
 * "use the browser capture instead": the binary is missing, the desktop refused,
 * the picker was dismissed, or the compositor could not report the pointer
 * separately. Nothing is thrown at the caller, because none of those are errors in
 * the app's own terms.
 */
export async function startCursorHelper(options: {
  fps: number
  onSample: (sample: CursorSample) => void
  /** The pointer's bitmap, sent whenever the cursor changes shape. */
  onShape?: (shape: CursorShape) => void
  onWarning?: (message: string) => void
  /**
   * This desktop told us it cannot report the pointer separately. Called before the
   * fallback so the answer can be remembered — otherwise every recording on such a
   * desktop costs the user two screen-share dialogs.
   */
  onEmbeddedOnly?: () => void
  /** How long to wait for the compositor's picker and the first frame. */
  timeoutMs?: number
}): Promise<CursorHelperSession | null> {
  const binary = helperBinaryPath()
  if (!binary) {
    log.info('[CursorHelper] Not bundled, using the browser capture path.')
    return null
  }

  const child = spawn(binary, [helperConfig(3, options.fps)], {
    // fd 3 is the video pipe: the helper writes frames into it, we hand the other
    // end to FFmpeg. stdout carries the cursor events.
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    // Debugging the click reader: set DEMOTHAT_CICKDBG=1 to make the helper's
    // evdev loop print what it sees to stderr, which we forward to the app log.
    env: { ...process.env, DEMOTHAT_CICKDBG: process.env.DEMOTHAT_CICKDBG || '' },
  })
  active = child

  let settled = false
  let startInfo: HelperStartInfo | null = null
  let stderr = ''

  const cleanup = () => {
    if (active === child) active = null
  }

  return new Promise<CursorHelperSession | null>((resolve) => {
    const finish = (session: CursorHelperSession | null) => {
      if (settled) return
      settled = true
      resolve(session)
    }

    /**
     * The desktop accepted metadata cursor mode (so no rejection retry ever ran),
     * but its buffers never carry the pointer's position a couple of seconds
     * later — kwin 5.27 does exactly this. The recording has already been handed
     * over to the helper at this point in the flow, but the promise is still
     * pending, so the desktop can be downgraded to embedded like Sway: the
     * pointer then rides in the pixels and stops being invisible.
     */
    const fallBackToEmbedded = () => {
      log.info('[CursorHelper] Desktop accepts metadata mode but never sends the pointer; falling back.')
      options.onEmbeddedOnly?.()
      child.kill('SIGTERM')
      cleanup()
      finish(null)
    }

    // The verdict needs this message verbatim: the helper emits it after ~60
    // frames with no cursor meta while in metadata mode.
    const SILENT_METADATA_WARNING = 'no cursor metadata from the compositor'

    const timeout = setTimeout(() => {
      log.warn(`[CursorHelper] No capture after ${options.timeoutMs ?? START_TIMEOUT_MS}ms; falling back.`)
      child.kill('SIGKILL')
      cleanup()
      finish(null)
    }, options.timeoutMs ?? START_TIMEOUT_MS)

    // Verdict before handover: only resolve the session with genuine proof the
    // desktop sends cursor data — the FIRST cursor sample. kwin 5.27 accepts
    // metadata mode but sends nothing; resolving on startInfo alone would hand
    // FFmpeg a cursor-less capture. Fall back instead on the helper's 60-frame
    // silence warning. While the verdict is pending the helper is writing
    // frames to fd 3 and nobody is draining it: the pipe stalls after ~64KB and
    // the helper's capture loop (and with it the silence counter) blocks. So
    // discard frames during the wait and let real piping start at resolution.
    let receivedVerdict = false
    const video = child.stdio[3] as unknown as Readable
    video.resume()

    const buildSession = (): CursorHelperSession => ({
      info: startInfo as HelperStartInfo,
      video,
      stop: () => stopChild(child),
    })

    const parser = createEventParser({
      onStart: (info) => {
        startInfo = info
      },
      onSample: (sample) => {
        // Frame data proves the meta actually flows; a session that will
        // deliver the pointer is one the app can commit to.
        if (startInfo && startInfo.cursorMode === 'metadata' && !settled && !receivedVerdict) {
          receivedVerdict = true
          video.pause()
          finish(buildSession())
        }
        options.onSample(sample)
      },
      onShape: options.onShape,
      onWarning: (message) => {
        log.warn(`[CursorHelper] ${message}`)
        options.onWarning?.(message)
        // The desktop accepted metadata mode but never puts the pointer in the
        // buffers it sends. The helper tried for ~60 frames and gave up, so this
        // is a desktop that can only record the cursor baked into the pixels.
        if (startInfo && startInfo.cursorMode === 'metadata' && message.includes(SILENT_METADATA_WARNING)) {
          fallBackToEmbedded()
        }
      },
      onError: (message) => {
        log.warn(`[CursorHelper] ${message}`)
      },
      onEnd: (frames, dropped) => {
        log.info(`[CursorHelper] Finished: ${frames} frames, ${dropped} dropped.`)
      },
    })

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => parser.push(chunk))
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
      if (stderr.length > 4000) stderr = stderr.slice(-4000)
      // Forward the click-reader diagnostics to the app log (the helper's
      // evdev loop prints these with DEMOTHAT_CICKDBG=1 set).
      chunk
        .split('\n')
        .filter((line) => line.startsWith('[CICKDBG]'))
        .forEach((line) => log.warn(`[CursorHelper] ${line}`))
    })

    child.on('error', (error) => {
      clearTimeout(timeout)
      log.warn(`[CursorHelper] Could not start: ${error.message}`)
      cleanup()
      finish(null)
    })

    child.on('exit', (code, signal) => {
      clearTimeout(timeout)
      cleanup()
      // If the session was never handed over (picked the screen but the helper
      // died before producing a first cursor sample or the silence verdict),
      // resolve so the caller falls back to the browser capture instead of
      // waiting forever.
      if (!settled) {
        log.warn(`[CursorHelper] Exited before handover (code=${code}, signal=${signal}). ${stderr.slice(-400)}`)
        finish(null)
        return
      }
      // It was serving a recording: that recording has now lost its video source,
      // so the caller is told by the pipe closing rather than by this promise.
    })

    // Wait for the stream to be negotiated: the frame size is what FFmpeg's
    // arguments need, and it is only known once the compositor has answered.
    const poll = setInterval(() => {
      if (!startInfo) return
      const isEmbedded = startInfo.cursorMode !== 'metadata'
      if (!isEmbedded && !receivedVerdict && !settled) {
        // Metadata mode: the verdict (first cursor sample, or the 60-frame
        // silence warning) settles the promise later; keep the interval and the
        // 120s timeout armed so nothing can hang.
        return
      }
      clearInterval(poll)
      clearTimeout(timeout)

      if (isEmbedded) {
        // The compositor records the pointer into the pixels. That is what the
        // browser path does too, and the browser path is the one in production, so
        // hand the recording back to it rather than taking over for no gain.
        log.info('[CursorHelper] Desktop cannot report the pointer separately; falling back.')
        options.onEmbeddedOnly?.()
        child.kill('SIGTERM')
        cleanup()
        finish(null)
        return
      }

      log.info(
        `[CursorHelper] Capturing ${startInfo.width}x${startInfo.height} ${startInfo.format}, ` +
          `clicks ${startInfo.clicks ? 'on' : 'off'}.`,
      )
      // The onSample handler usually resolved already; this covers the path where
      // a verdict arrived between polls.
      if (!settled) {
        finish({
          info: startInfo,
          video: child.stdio[3] as unknown as Readable,
          stop: () => stopChild(child),
        })
      }
    }, 20)
  })
}

/** Asks the helper to finish, then makes sure it actually did. */
async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    if (active === child) active = null
    return
  }

  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      // The helper stops inside its capture loop, which needs a frame to notice;
      // if the compositor has stalled, ending it here is the only way out.
      log.warn('[CursorHelper] Did not stop in time; killing it.')
      child.kill('SIGKILL')
      done()
    }, STOP_TIMEOUT_MS)
    child.once('exit', done)
    // EOF on stdin is the helper's own stop signal.
    try {
      child.stdin?.write('stop\n')
      child.stdin?.end()
    } catch {
      child.kill('SIGTERM')
    }
  })

  if (active === child) active = null
}

/** Ends any helper still running: used when a recording is discarded or the app quits. */
export async function stopCursorHelper(): Promise<void> {
  const child = active
  if (!child) return
  await stopChild(child)
}
