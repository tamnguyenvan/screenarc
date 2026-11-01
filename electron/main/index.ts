// Entry point of the Electron application.

import { app, BrowserWindow, protocol, Menu, screen, dialog, desktopCapturer } from 'electron'
import { initMain as initAudioLoopback } from 'electron-audio-loopback'
import log from 'electron-log/main'
import path from 'node:path'
import fsSync from 'node:fs'
import { spawn } from 'node:child_process'
import { VITE_PUBLIC } from './lib/constants'
import { setupLogging } from './lib/logging'
import { registerIpcHandlers } from './ipc'
import { createRecorderWindow } from './windows/recorder-window'
import { onAppQuit, startRecording, loadVideoFromFile } from './features/recording-manager'
import { registerRecordingShortcuts, unregisterRecordingShortcuts } from './features/shortcuts'
import { findProjectArg, markAppReadyForProjects, promptOpenProject, requestOpenProject } from './features/project-open'
import { initializeMouseTrackerDependencies } from './features/mouse-tracker'
import { confirmReplaceSession, isQuitApproved, markQuitApproved } from './features/session-guard'
import { appState } from './state'
import { detectSession, WAYLAND_CHROMIUM_FEATURES } from '../../shared/session'

// The `media://` scheme must be declared privileged BEFORE app ready so
// Chromium lets our `protocol.handle` server answer with byte ranges — the
// HTML5 media stack requests ranges to seek and to read the moov box of a
// non-faststart MP4 (which is exactly what FFmpeg produces without
// +faststart). Without range support the video element stalls forever at
// readyState 0 with NO error event: a black preview while ffmpeg-based export
// still works. (`stream` enables ranged/streaming responses; `secure` keeps
// media loadable from the renderer's context.)
protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { stream: true, secure: true } }])

// --- Initialization ---
setupLogging()

// Enable system audio loopback capture on macOS (12.3+ via ScreenCaptureKit,
// 14.4+ via CoreAudio Taps with `forceCoreAudioTap: true`). Must run before
// `app.whenReady()` because it appends Chromium feature flags.
// See: https://github.com/alectrocute/electron-audio-loopback
initAudioLoopback({ forceCoreAudioTap: true })

// --- Single instance ---
// A second launch (for example from a `.dthat` file association) must hand the
// path to the running instance instead of starting a rival copy.
//
// This must be acquired BEFORE the Wayland relaunch below. On Wayland the parent
// re-execs itself (spawns a child with the wayland flags) and exits; if a stale
// instance already held the lock, that child would hit this check and silently
// quit — and because the child's stdio is 'ignore', the launch looks dead. So
// the parent validates single-instance first and hands the lock to the child,
// rather than letting the child be the one that discovers a stale lock.
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  log.info('[App] Another instance is already running. Quitting this one.')
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const projectPath = findProjectArg(argv)
    if (projectPath) {
      log.info(`[App] Second instance requested to open a project: ${projectPath}`)
      requestOpenProject(projectPath)
      return
    }
    // No project argument: just surface the existing window.
    const win = appState.editorWin ?? appState.recorderWin
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  // macOS delivers double-clicked documents through `open-file`. This must be
  // registered before the app is ready; requests are queued until then.
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    log.info(`[App] open-file received: ${filePath}`)
    requestOpenProject(filePath)
  })
}

// --- Wayland (Linux) ---
// Electron 31 starts life as a plain XWayland client on a Wayland session, and
// under XWayland FFmpeg's x11grab only ever sees Xwayland's own X11 clients —
// native Wayland windows come out blank, so the recording is mostly empty frames.
//
// The fix is to ask for the Wayland backend, but Chromium chooses it *before*
// this script runs, so `app.commandLine.appendSwitch` is too late (verified: the
// app still initialised X11). The platform can only be set on the real command
// line, or through ELECTRON_OZONE_PLATFORM_HINT, so relaunch ourselves once with
// it. The marker variable below is the loop guard: it is set for the child, so a
// relaunch can never happen twice even if the flag somehow does not stick.
//
// Chromium features are passed on that command line too. Appending them from
// here does work (that is what electron-audio-loopback relies on), but once we
// are already re-executing there is no reason to leave any doubt.
//
// This only runs when we hold the single-instance lock (gotTheLock above). A
// second launch that lost the lock has already quit; if it reached here it would
// spawn a child that fails the lock check and dies silently — the very dead
// launch this guard exists to prevent.
const session = detectSession()
if (gotTheLock && process.platform === 'linux' && session.wayland) {
  const waylandFlags = ['--ozone-platform-hint=wayland', `--enable-features=${WAYLAND_CHROMIUM_FEATURES.join(',')}`]
  const alreadyAsked = process.argv.some((arg) => arg.startsWith('--ozone-platform'))
  const canRelaunch =
    !alreadyAsked && !process.env.DEMOTHAT_WAYLAND_RELAUNCHED && !process.env.ELECTRON_OZONE_PLATFORM_HINT

  if (canRelaunch) {
    // We hold the single-instance lock, so no stale instance can be running and
    // the child will win the lock when it starts. Release it here so the child
    // can acquire it; otherwise the child dies on the lock check.
    // APPIMAGE is set when running from an AppImage: respawn that file rather
    // than the binary inside the mounted image, which would disappear with us.
    const launchTarget = process.env.APPIMAGE || process.execPath
    log.info(`[Wayland] Relaunching on the Wayland backend (${session.reason}): ${launchTarget}`)
    try {
      spawn(launchTarget, [...process.argv.slice(1), ...waylandFlags], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, DEMOTHAT_WAYLAND_RELAUNCHED: '1' },
      }).unref()
      app.releaseSingleInstanceLock()
      app.exit(0)
    } catch (error) {
      // Falling through is better than not starting at all: the app still runs
      // under XWayland, and the recorder will say the capture backend is X11.
      log.error('[Wayland] Could not relaunch with the Wayland flags; continuing on X11.', error)
    }
  } else {
    app.commandLine.appendSwitch('enable-features', WAYLAND_CHROMIUM_FEATURES.join(','))
    log.info(`[Wayland] Native backend in use (${session.reason}); screen capture will use the portal.`)
  }
} else if (gotTheLock && process.platform === 'linux') {
  log.info(`[Wayland] Not in use (${session.reason}); screen capture stays on FFmpeg x11grab.`)
}

// --- App Lifecycle Events ---
app.on('window-all-closed', () => {
  log.info('[App] All windows closed. Quitting.')
  app.quit()
})

app.on('before-quit', onAppQuit)

// Quitting is the other data-loss point. The guard runs once per quit; the
// window's own close handler then lets the window go without asking again.
app.on('before-quit', (event) => {
  if (isQuitApproved()) return
  const editor = appState.editorWin
  if (!editor || editor.isDestroyed()) return

  event.preventDefault()
  void confirmReplaceSession('quit').then((proceed) => {
    if (!proceed) return
    markQuitApproved()
    app.quit()
  })
})

app.on('will-quit', () => {
  // Release the global recording shortcuts before the process goes away.
  unregisterRecordingShortcuts()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createRecorderWindow()
  }
})

app.whenReady().then(async () => {
  if (!gotTheLock) return
  log.info('[App] Ready. Initializing...')

  // Set Dock Menu on macOS
  if (process.platform === 'darwin') {
    const dockMenu = Menu.buildFromTemplate([
      {
        label: 'New Default Recording',
        click: () => {
          if (appState.editorWin && !appState.editorWin.isDestroyed()) {
            dialog.showErrorBox(
              'Action Not Allowed',
              'Please close the current editor session to start a new recording.',
            )
            appState.editorWin.focus()
            return
          }
          if (appState.currentRecordingSession) {
            dialog.showErrorBox('Recording in Progress', 'A recording is already in progress.')
            return
          }

          if (!appState.recorderWin || appState.recorderWin.isDestroyed()) {
            createRecorderWindow()
          }
          appState.recorderWin?.show()

          const primaryDisplay = screen.getPrimaryDisplay()
          startRecording({
            source: 'fullscreen',
            displayId: primaryDisplay.id,
            mic: undefined,
            webcam: undefined,
          })
        },
      },
      {
        label: 'Import Video File...',
        click: () => {
          if (appState.editorWin && !appState.editorWin.isDestroyed()) {
            dialog.showErrorBox('Action Not Allowed', 'Please close the current editor session to import a new video.')
            appState.editorWin.focus()
            return
          }
          if (appState.currentRecordingSession) {
            dialog.showErrorBox('Recording in Progress', 'A recording is already in progress.')
            return
          }

          if (!appState.recorderWin || appState.recorderWin.isDestroyed()) {
            createRecorderWindow()
          }
          appState.recorderWin?.show()
          loadVideoFromFile()
        },
      },
      {
        label: 'Open Project...',
        click: () => {
          void promptOpenProject()
        },
      },
    ])
    app.dock.setMenu(dockMenu)
  }

  // Initialize platform-specific dependencies asynchronously
  initializeMouseTrackerDependencies()

  // Proactively register this app with macOS Screen Recording TCC so it
  // appears in System Settings → Privacy & Security → Screen Recording.
  // This must run after the window is ready.
  if (process.platform === 'darwin') {
    desktopCapturer.getSources({ types: ['screen'] }).catch((e) => {
      log.warn('[Permission] desktopCapturer.getSources failed at startup:', e)
    })
  }

  // Register custom protocol for media files. A REAL HTTP byte-range server:
  // Chromium's media element issues Range requests when seeking, when reading
  // the moov box of a non-faststart MP4, and while streaming. A range-less
  // response makes the element either stall at readyState 0 (black preview that
  // still exports fine) or — once +faststart puts the moov up front so it
  // LOADS — clamp every seek back to 0 because the source reports no
  // seekable range. That is exactly the "snaps back to the start" regression:
  // the file played but the seek bar could not move. 206/Content-Range answers
  // make seekable() non-empty and both symptoms disappear.
  protocol.handle('media', async (request) => {
    const url = request.url.replace('media://', '')
    const decodedUrl = decodeURIComponent(url)
    const resourcePath = path.join(VITE_PUBLIC, decodedUrl)

    let filePath: string | undefined
    if (path.isAbsolute(decodedUrl) && fsSync.existsSync(decodedUrl)) {
      filePath = decodedUrl
    } else if (fsSync.existsSync(resourcePath)) {
      filePath = resourcePath
    }
    if (!filePath) {
      log.error(`[Protocol] Could not find file: ${decodedUrl}`)
      return new Response('Not found', { status: 404 })
    }

    const MIME: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.m4a': 'audio/mp4',
      '.webm': 'video/webm',
      '.opus': 'audio/ogg',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    }
    const contentType = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    const baseHeaders: Record<string, string> = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes' }

    try {
      const size = fsSync.statSync(filePath).size
      const range = request.headers.get('Range')
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
        if (!match) {
          return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
        }
        let start = match[1] === '' ? 0 : Number.parseInt(match[1], 10)
        let end = match[2] === '' ? size - 1 : Number.parseInt(match[2], 10)
        if (Number.isNaN(start)) start = 0
        if (Number.isNaN(end)) end = size - 1
        if (start > end || start >= size || end >= size) {
          return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
        }
        const length = end - start + 1
        const fd = fsSync.openSync(filePath, 'r')
        const buffer = Buffer.alloc(length)
        try {
          fsSync.readSync(fd, buffer, 0, length, start)
        } finally {
          fsSync.closeSync(fd)
        }
        return new Response(buffer, {
          status: 206,
          headers: {
            ...baseHeaders,
            'Content-Length': String(length),
            'Content-Range': `bytes ${start}-${end}/${size}`,
          },
        })
      }
      // No Range header: the whole file in one response (small assets, images).
      const buffer = fsSync.readFileSync(filePath)
      return new Response(buffer, {
        status: 200,
        headers: { ...baseHeaders, 'Content-Length': String(size) },
      })
    } catch (error) {
      log.error(`[Protocol] Failed to serve ${decodedUrl}: ${String(error)}`)
      return new Response('Not found', { status: 404 })
    }
  })

  registerIpcHandlers()
  registerRecordingShortcuts()
  createRecorderWindow()

  // Flush any project queued before ready (open-file / argv) and open a `.dthat`
  // passed on this launch.
  markAppReadyForProjects()
  const startupProject = findProjectArg(process.argv)
  if (startupProject) requestOpenProject(startupProject)
})
