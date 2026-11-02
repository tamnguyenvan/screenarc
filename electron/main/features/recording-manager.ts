/* eslint-disable @typescript-eslint/no-explicit-any */
// Contains core business logic for recording, stopping, and cleanup.

import log from 'electron-log/main'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import fsPromises from 'node:fs/promises'
import {
  app,
  Menu,
  Tray,
  nativeImage,
  screen,
  ipcMain,
  dialog,
  systemPreferences,
  desktopCapturer,
  shell,
} from 'electron'
import { appState } from '../state'
import { getFFmpegPath, ensureDirectoryExists } from '../lib/utils'
import { VITE_PUBLIC, RECORDING_SHORTCUTS } from '../lib/constants'
import { createMouseTracker } from './mouse-tracker'
import { getCursorScale, restoreOriginalCursorScale, resetCursorScale } from './cursor-manager'
import { createEditorWindow, cleanupEditorFiles } from '../windows/editor-window'
import { createSavingWindow, createSelectionWindow } from '../windows/temporary-windows'
import type { RecordingSession, RecordingGeometry } from '../state'
import { isCursorHelperAvailable, startCursorHelper, stopCursorHelper, type CursorSample } from './cursor-helper'
import { isEmbeddedOnlyDesktop, rememberEmbeddedOnlyDesktop } from './cursor-helper-preference'
import { SystemAudioWriter } from './system-audio-writer'
import { ScreenVideoWriter } from './screen-video-writer'
import { buildMuxArgs, buildMacMuxArgs } from './build-mux-args'
import { probeAudioTracks } from './audio-tracks'
import { buildFfmpegArgs } from './build-recording-args'
import {
  usesRendererScreenCapture as backendCapturesScreen,
  screenFileCarriesAudio,
  requiresPortalCapture,
} from '../lib/capture-backend'
import { probeVideoSize } from '../lib/video-size'
import { parseDuration } from '../lib/audio-info'
import { computeCrop } from '../../../shared/wayland-crop'
import { applyCleanDemoMode, restoreCleanDemoMode } from './clean-demo-mode'

const FFMPEG_PATH = getFFmpegPath()
const SYSTEM_AUDIO_STOP_TIMEOUT_MS = 5000

/** Substrings in FFmpeg stderr that mean the capture cannot start at all. Shared by the recording encoder and the webcam feeder. */
const fatalErrorKeywords = [
  'Cannot open display',
  'Invalid argument',
  'Device not found',
  'Unknown input format',
  'error opening device',
]
const SCREEN_CAPTURE_STOP_TIMEOUT_MS = 5000

// Module-scoped writers used by the renderer-streamed capture paths. They
// live outside appState because they're helpers, not session data.
const systemAudioWriter = new SystemAudioWriter()
const screenVideoWriter = new ScreenVideoWriter()
let pendingSystemAudioStop: {
  promise: Promise<void>
  resolve: () => void
} | null = null
let pendingScreenCaptureStop: {
  promise: Promise<void>
  resolve: () => void
} | null = null

export function getSystemAudioWriter(): SystemAudioWriter {
  return systemAudioWriter
}

export function getScreenVideoWriter(): ScreenVideoWriter {
  return screenVideoWriter
}

export function markSystemAudioStopped(): void {
  pendingSystemAudioStop?.resolve()
  pendingSystemAudioStop = null
}

export function markScreenCaptureStopped(): void {
  log.info('[ScreenCapture] Renderer acknowledged stop; resolving waiter.')
  pendingScreenCaptureStop?.resolve()
  pendingScreenCaptureStop = null
}

function createSystemAudioStopWaiter(): Promise<void> {
  if (!pendingSystemAudioStop) {
    let resolve!: () => void
    pendingSystemAudioStop = {
      promise: new Promise<void>((res) => {
        resolve = res
      }),
      resolve,
    }
  }

  return pendingSystemAudioStop.promise
}

function createScreenCaptureStopWaiter(): Promise<void> {
  if (!pendingScreenCaptureStop) {
    let resolve!: () => void
    pendingScreenCaptureStop = {
      promise: new Promise<void>((res) => {
        resolve = res
      }),
      resolve,
    }
  }

  return pendingScreenCaptureStop.promise
}

async function waitForSystemAudioStop(waiter: Promise<void>): Promise<void> {
  let didAcknowledge = false
  try {
    await Promise.race([
      waiter.then(() => {
        didAcknowledge = true
      }),
      new Promise<void>((resolve) => {
        setTimeout(resolve, SYSTEM_AUDIO_STOP_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (!didAcknowledge) {
      log.warn('[SystemAudio] Renderer did not acknowledge stop before timeout; finalizing writer anyway.')
    }
    pendingSystemAudioStop = null
  }
}

async function waitForScreenCaptureStop(waiter: Promise<void>): Promise<void> {
  let didAcknowledge = false
  try {
    await Promise.race([
      waiter.then(() => {
        didAcknowledge = true
      }),
      new Promise<void>((resolve) => {
        setTimeout(resolve, SCREEN_CAPTURE_STOP_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (!didAcknowledge) {
      log.warn('[ScreenCapture] Renderer did not acknowledge stop before timeout; finalizing writer anyway.')
    }
    pendingScreenCaptureStop = null
  }
}

/**
 * Uses ffprobe to get the precise creation time of the video file.
 * @param videoPath The path to the video file.
 * @returns A promise that resolves to the creation time as a UNIX timestamp (ms).
 */
async function getVideoStartTime(videoPath: string): Promise<number> {
  try {
    const stats = await fsPromises.stat(videoPath)
    return stats.birthtimeMs
  } catch (error) {
    log.error(`[getVideoStartTime] Error getting file stats for ${videoPath}:`, error)
    throw error
  }
}

async function screenFileHasAudioStream(screenVideoPath: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, ['-v', 'error', '-i', screenVideoPath, '-map', '0:a:0', '-f', 'null', '-'])
    let stderr = ''

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(true)
        return
      }

      if (stderr.includes('matches no streams')) {
        resolve(false)
        return
      }

      reject(new Error(`Failed to inspect screen audio stream: ${stderr.slice(-500)}`))
    })
  })
}

/** The screen file's length in seconds, from the FFmpeg banner, or null. */
function probeVideoDurationSec(videoPath: string): Promise<number | null> {
  return new Promise<number | null>((resolve) => {
    let stderr = ''
    try {
      const proc = spawn(FFMPEG_PATH, ['-hide_banner', '-i', videoPath])
      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })
      proc.on('error', () => resolve(null))
      proc.on('close', () => resolve(parseDuration(stderr)))
    } catch {
      resolve(null)
    }
  })
}

/**
 * Validates the generated recording files to ensure they exist and are not empty.
 * @param session - The recording session containing file paths to validate.
 * @returns A promise that resolves to true if files are valid, false otherwise.
 */
async function validateRecordingFiles(session: RecordingSession): Promise<boolean> {
  log.info('[Validation] Validating recorded files...')
  const filesToValidate = [session.screenVideoPath]
  if (session.webcamVideoPath) {
    filesToValidate.push(session.webcamVideoPath)
  }

  for (const filePath of filesToValidate) {
    try {
      const stats = await fsPromises.stat(filePath)
      if (stats.size === 0) {
        const errorMessage = `The recording produced an empty video file (${path.basename(filePath)}). This could be due to incorrect permissions, lack of disk space, or a hardware issue.`
        log.error(`[Validation] ${errorMessage}`)
        dialog.showErrorBox('Recording Validation Failed', errorMessage)
        return false
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const errorMessage = `The recording process failed to create the video file: ${path.basename(filePath)}.`
        log.error(`[Validation] ${errorMessage}`)
        dialog.showErrorBox('Recording Validation Failed', errorMessage)
      } else {
        const errorMessage = `Could not access the recorded file (${path.basename(filePath)}). Error: ${(error as Error).message}`
        log.error(`[Validation] ${errorMessage}`, error)
        dialog.showErrorBox('File Error', errorMessage)
      }
      return false
    }
  }

  log.info('[Validation] All recorded files appear valid (exist and are not empty).')
  return true
}

/**
 * Adds one cursor sample to the recording, in the coordinate space the editor
 * expects: relative to the recorded frame, and only if it fell inside it.
 *
 * Shared by the two sources of samples — the X11 tracker and the Wayland helper —
 * because they must agree exactly, and the offset arithmetic is easy to get wrong
 * twice and hard to notice once.
 */
function recordCursorSample(
  sample: { x: number; y: number; timestamp: number; type?: string; [key: string]: unknown },
  geometry: RecordingGeometry,
): void {
  const inside =
    sample.x >= geometry.x &&
    sample.x <= geometry.x + geometry.width &&
    sample.y >= geometry.y &&
    sample.y <= geometry.y + geometry.height
  if (!inside) return

  appState.recordedMouseEvents.push({
    ...sample,
    x: sample.x - geometry.x,
    y: sample.y - geometry.y,
    timestamp: sample.timestamp,
  })
}

/** The helper's samples arrive in the same shape as the tracker's. */
function handleHelperSample(sample: CursorSample, geometry: RecordingGeometry): void {
  recordCursorSample(
    sample.type === 'click'
      ? {
          timestamp: sample.timestamp,
          x: sample.x,
          y: sample.y,
          type: 'click',
          button: sample.button,
          pressed: sample.pressed,
          cursorImageKey: sample.cursorImageKey,
        }
      : {
          timestamp: sample.timestamp,
          x: sample.x,
          y: sample.y,
          type: 'move',
          cursorImageKey: sample.cursorImageKey,
        },
    geometry,
  )
}

/**
 * The core function that spawns FFmpeg and the mouse tracker to begin recording.
 * @param inputArgs - Platform-specific FFmpeg input arguments (mic + webcam only when
 *                    useRendererScreenCapture is true; otherwise also includes screen).
 * @param hasWebcam - Flag indicating if webcam recording is enabled.
 * @param hasMic - Flag indicating if microphone recording is enabled.
 * @param hasSystemAudio - Flag indicating if renderer-side system audio capture is enabled.
 * @param useRendererScreenCapture - The renderer records the screen instead of FFmpeg:
 *                                    macOS (avfoundation's screen input is broken on 14+)
 *                                    and Linux/Wayland (FFmpeg cannot see a Wayland screen).
 * @param recordingGeometry - The logical dimensions and position of the recording area.
 * @param pendingCrop - Wayland area recording: the user's selection, to be cut out of the
 *                      portal-captured monitor during the mux. Resolved against the real
 *                      video size there, since the portal's output size is not known yet.
 */
async function startActualRecording(
  inputArgs: string[],
  hasWebcam: boolean,
  hasMic: boolean,
  hasSystemAudio: boolean,
  useRendererScreenCapture: boolean,
  recordingGeometry: RecordingGeometry,
  cleanDemo = false,
  pendingCrop?: RecordingSession['pendingCrop'],
  screenFilter?: string,
) {
  const recordingDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.demothat')
  await ensureDirectoryExists(recordingDir)
  const baseName = `DemoThat-recording-${Date.now()}`

  const screenVideoPath = path.join(recordingDir, `${baseName}-screen.mp4`)
  const webcamVideoPath = hasWebcam ? path.join(recordingDir, `${baseName}-webcam.mp4`) : undefined
  const metadataPath = path.join(recordingDir, `${baseName}.json`)

  // The renderer records the screen into one .webm file on macOS and on
  // Linux/Wayland. macOS folds the optional system audio into it; Wayland does
  // not — there the microphone and system audio keep the separate writer they
  // have always used on Linux, which is why "who captures the screen" and "does
  // the screen file carry the audio" are two different questions.
  const screenWebmPath = useRendererScreenCapture ? path.join(recordingDir, `${baseName}-screen.webm`) : undefined
  const webmHasSystemAudio = useRendererScreenCapture && screenFileCarriesAudio() && hasSystemAudio
  const systemAudioPath =
    !webmHasSystemAudio && hasSystemAudio ? path.join(recordingDir, `${baseName}-system.webm`) : undefined
  const micAudioPath = screenFileCarriesAudio() && hasMic ? path.join(recordingDir, `${baseName}-mic.m4a`) : undefined

  log.info('[RecordingManager] Resolved file paths for session:', {
    baseName,
    screenVideoPath,
    screenWebmPath,
    systemAudioPath,
    micAudioPath,
    webcamVideoPath,
    useRendererScreenCapture,
    webmHasSystemAudio,
    hasMic,
    hasWebcam,
  })

  // Store recordingGeometry in the session
  appState.currentRecordingSession = {
    screenVideoPath,
    webcamVideoPath,
    systemAudioPath,
    hasMicAudio: hasMic,
    screenWebmPath,
    webmHasSystemAudio,
    micAudioPath,
    metadataPath,
    recordingGeometry,
    pendingCrop,
  }

  if (systemAudioPath) {
    log.info(`[SystemAudio] Starting writer for ${systemAudioPath}`)
    markSystemAudioStopped()
    systemAudioWriter.start(systemAudioPath)
  }

  if (screenWebmPath) {
    log.info(`[ScreenCapture] Starting writer for ${screenWebmPath}`)
    markScreenCaptureStopped()
    screenVideoWriter.start(screenWebmPath)
  }

  appState.recorderWin?.minimize()

  // Clean Demo Mode: strip desktop clutter for the duration of the recording.
  // Restored by stopRecording / cancelRecording / cleanupAndDiscard.
  if (cleanDemo) {
    log.info('[RecordingManager] Clean Demo Mode requested — hiding desktop clutter.')
    await applyCleanDemoMode()
  }

  // Reset state for the new session
  appState.recordingStartTime = Date.now()
  appState.recordedMouseEvents = []
  appState.runtimeCursorImageMap = new Map()
  // Wayland: no global pointer coordinates exist to read. Electron's
  // screen.getCursorScreenPoint() is unsupported there, and the X11 tracker
  // would only see Xwayland's stale copy of the pointer — worse than nothing,
  // because the samples that survive the geometry filter would draw a second,
  // frozen cursor on top of the real one the compositor already recorded into
  // the video. So no tracker, and a recording with no cursor samples.
  if (requiresPortalCapture()) {
    log.info('[RecordingManager] Wayland: no cursor tracker; the pointer is part of the captured video.')
    appState.mouseTracker = null
  } else {
    appState.mouseTracker = createMouseTracker()
  }

  if (appState.mouseTracker) {
    appState.mouseTracker.on('data', (data: any) => {
      recordCursorSample(data, recordingGeometry)
    })
    // Check if tracker started successfully
    const trackerStarted = await appState.mouseTracker.start(appState.runtimeCursorImageMap)
    if (!trackerStarted) {
      log.error('[RecordingManager] Mouse tracker failed to start, likely due to permissions. Aborting recording.')
      appState.recorderWin?.show()
      await cleanupAndDiscard()
      return { canceled: true }
    }
  }

  // On macOS we may not need FFmpeg at all: if the user disabled both mic and
  // webcam, the renderer's MediaRecorder writes the only output we need.
  const needsFfmpeg = !useRendererScreenCapture || hasMic || hasWebcam
  if (needsFfmpeg) {
    const finalArgs = useRendererScreenCapture
      ? buildMacFfmpegArgs(inputArgs, hasMic, hasWebcam, micAudioPath, webcamVideoPath)
      : buildFfmpegArgs(inputArgs, hasWebcam, hasMic, screenVideoPath, webcamVideoPath, screenFilter)
    // A live v4l2 webcam inside the recording FFmpeg never ends on its own and
    // swallows SIGINT (observed on KDE Wayland), so stopping the recording used
    // to force-kill the encoder before it wrote the mp4 container trailer —
    // both the screen and webcam files came out with no moov atom (black
    // preview). Move the camera into a tiny feeder that writes to a pipe: when
    // the feeder stops, the pipe EOFs just like the screen pipe, and the main
    // encoder finishes normally and finalizes both files.
    let webcamFeeder: ChildProcessWithoutNullStreams | null = null
    const v4l2At = finalArgs.findIndex((arg, i) => arg === '-f' && finalArgs[i + 1] === 'v4l2')
    if (v4l2At !== -1) {
      const device = finalArgs[v4l2At + 3]
      finalArgs.splice(v4l2At, 4, '-f', 'matroska', '-i', 'pipe:3')
      webcamFeeder = spawn(FFMPEG_PATH, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'v4l2',
        '-i',
        device,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-f',
        'matroska',
        'pipe:',
      ])
      appState.webcamFeeder = webcamFeeder
      // A feeder that dies is a lost webcam, not a failed recording — but its
      // fatal errors should surface with the same guidance as the encoder's.
      webcamFeeder.stderr.on('data', (data: any) => {
        const message = data.toString()
        log.warn(`[WebcamFeeder stderr]: ${message}`)
        if (fatalErrorKeywords.some((keyword) => message.toLowerCase().includes(keyword.toLowerCase()))) {
          log.error(`[WebcamFeeder] Fatal error detected: ${message}`)
          dialog.showErrorBox(
            'Recording Failed',
            'DemoThat could not access the webcam.\n\n' +
              `The camera reported: ${message
                .trim()
                .split('\n')[0]
                .replace(/^\[[a-z0-9 @.]+\]\s*/i, '')}\n\n` +
              'Please check:\n' +
              '• The webcam is not in use by another app\n' +
              '• The webcam is plugged in and enabled',
          )
          setTimeout(() => cleanupAndDiscard(), 100)
        }
      })
      log.info(`[RecordingManager] Webcam moved to a feeder process (${device} → pipe).`)
    }

    log.info(`[FFMPEG] Starting FFmpeg with args: ${finalArgs.join(' ')}`)
    // stdio[3] is the webcam feeder's pipe; without it the child gets no fd 3
    // and `-i pipe:3` would fail.
    appState.ffmpegProcess = spawn(
      FFMPEG_PATH,
      finalArgs,
      webcamFeeder ? { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] } : undefined,
    )
    if (webcamFeeder) {
      webcamFeeder.stdout.pipe(appState.ffmpegProcess.stdio[3] as unknown as NodeJS.WritableStream)
    }

    // Wayland: the frames come from the helper's descriptor rather than from a
    // display grab. Closing this pipe — which the helper does when it stops — is
    // what makes FFmpeg finish the file.
    if (appState.cursorHelper) {
      log.info("[RecordingManager] Piping the cursor helper's frames into FFmpeg.")
      appState.cursorHelper.video.pipe(appState.ffmpegProcess.stdin as NodeJS.WritableStream)
    }

    // Monitor FFmpeg's stderr for progress, errors, and sync timing
    appState.ffmpegProcess.stderr.on('data', (data: any) => {
      const message = data.toString()
      log.warn(`[FFMPEG stderr]: ${message}`)

      // Early detection of fatal errors to provide immediate feedback (shared
      // keyword list is module-scoped, so the webcam feeder checks it too).
      if (fatalErrorKeywords.some((keyword) => message.toLowerCase().includes(keyword.toLowerCase()))) {
        log.error(`[FFMPEG] Fatal error detected: ${message}`)
        dialog.showErrorBox(
          'Recording Failed',
          'DemoThat could not start the recording.\n\n' +
            `The video encoder reported: ${message
              .trim()
              .split('\n')[0]
              .replace(/^\[[a-z0-9 @.]+\]\s*/i, '')}\n\n` +
            'Please check:\n' +
            '• Your webcam or microphone is not in use by another app\n' +
            '• Your screen-capture permission is granted\n' +
            '• No other recording program is running',
        )
        setTimeout(() => cleanupAndDiscard(), 100)
      }
    })

    appState.ffmpegProcess.on('exit', (code, signal) => {
      log.info(`[FFMPEG] Process exited (code=${code}, signal=${signal}).`)
    })
  } else {
    log.info('[RecordingManager] No FFmpeg process needed — screen video and audio come entirely from the renderer.')
  }

  // Notify the recorder window that recording has started
  appState.recorderWin?.webContents.send('recording-started')

  createTray()
  return { canceled: false, ...appState.currentRecordingSession }
}

/**
 * macOS-only FFmpeg args builder. We capture the screen in the renderer (see
 * src/lib/screen-capture.ts), so this only handles mic and/or webcam. Mic
 * lands in its own AAC/m4a file because there's no longer a screen output to
 * route it into; the post-recording mux folds it back in.
 *
 * Input order in `inputArgs` mirrors `startRecording`: mic first (if any),
 * then webcam (if any).
 */
function buildMacFfmpegArgs(
  inputArgs: string[],
  hasMic: boolean,
  hasWebcam: boolean,
  micOut?: string,
  webcamOut?: string,
): string[] {
  const finalArgs = [...inputArgs]
  const micIndex = hasMic ? 0 : -1
  const webcamIndex = hasMic ? (hasWebcam ? 1 : -1) : hasWebcam ? 0 : -1

  if (hasMic && micOut) {
    finalArgs.push('-map', `${micIndex}:a`, '-c:a', 'aac', '-b:a', '192k', micOut)
  }

  if (hasWebcam && webcamOut) {
    finalArgs.push(
      '-map',
      `${webcamIndex}:v`,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      webcamOut,
    )
  }

  return finalArgs
}

/**
 * Creates the system tray icon and context menu for controlling an active recording.
 */
function createTray() {
  const icon = nativeImage.createFromPath(path.join(VITE_PUBLIC, 'demothat-appicon-tray.png'))
  appState.tray = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Stop Recording',
      accelerator: RECORDING_SHORTCUTS.stop,
      click: async () => {
        await stopRecording()
      },
    },
    {
      label: 'Cancel Recording',
      click: async () => {
        await cancelRecording()
      },
    },
  ])
  appState.tray.setToolTip('DemoThat is recording...')
  appState.tray.setContextMenu(contextMenu)
}

/**
 * Orchestrates the start of a recording based on user options from the renderer.
 * @param options - The recording configuration selected by the user.
 */
export async function startRecording(options: any) {
  const { source, displayId, mic, webcam, systemAudio, cleanDemo } = options
  log.info('[RecordingManager] Received start recording request with options:', options)

  // `systemAudio` means a renderer-recorded audio file: system loopback on
  // macOS (ScreenCaptureKit / CoreAudio Tap via electron-audio-loopback), or
  // the microphone on Linux (the bundled FFmpeg can't capture it reliably).
  // Dropped on other platforms.
  const wantsSystemAudio = !!systemAudio && (process.platform === 'darwin' || process.platform === 'linux')

  // macOS Permissions Check
  if (process.platform === 'darwin') {
    // 1. Check Screen Recording Permissions
    // getMediaAccessStatus('screen') is unreliable on macOS 14+ (Sonoma/Sequoia)
    // — always returns 'granted'. Probe via desktopCapturer instead: permission
    // denied → empty sources array.
    let screenGranted = false
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
      screenGranted = sources.length > 0
    } catch (e) {
      log.warn('[Permission] desktopCapturer.getSources failed:', e)
    }
    if (!screenGranted) {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: 'Screen Recording Permission Required',
        message: 'DemoThat needs Screen Recording permission to record your screen.',
        detail:
          'Go to System Settings → Privacy & Security → Screen Recording and enable the toggle next to "Electron" (the dev build). Then restart the app and try again.',
        buttons: ['Open System Settings', 'Cancel'],
        defaultId: 0,
      })
      if (response === 0) {
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
      }
      return { canceled: true }
    }

    // 2. Check Microphone Permissions (if requested)
    if (mic) {
      let micAccess = systemPreferences.getMediaAccessStatus('microphone')
      if (micAccess === 'not-determined') {
        micAccess = (await systemPreferences.askForMediaAccess('microphone')) ? 'granted' : 'denied'
      }
      if (micAccess !== 'granted') {
        dialog.showErrorBox(
          'Microphone Permission Required',
          'Microphone permissions required. Please go to System Preferences > Security & Privacy > Privacy > Microphone and enable this application.',
        )
        return { canceled: true }
      }
    }

    // 3. Heads-up for System Audio capture. The actual TCC prompt is fired by
    // Chromium when the renderer calls getDisplayMedia. We can't pre-flight it
    // here, but we can inform the user that a prompt will appear on first use.
    // CoreAudio Tap permission (macOS 14.4+) is a separate prompt from Screen
    // Recording — it requires NSAudioCaptureUsageDescription in Info.plist.
    if (wantsSystemAudio) {
      log.info(
        '[RecordingManager] System audio capture requested — Chromium will prompt for permission on first getDisplayMedia.',
      )
    }
  }

  const display = process.env.DISPLAY || ':0.0'
  const baseFfmpegArgs: string[] = []
  let recordingGeometry: RecordingGeometry
  let pendingCrop: RecordingSession['pendingCrop']

  // --- Add Microphone and Webcam inputs first ---
  if (mic) {
    switch (process.platform) {
      case 'linux':
        baseFfmpegArgs.push('-f', 'alsa', '-i', 'default')
        break
      case 'win32':
        baseFfmpegArgs.push('-f', 'dshow', '-i', `audio=${mic.deviceLabel}`)
        break
      case 'darwin':
        baseFfmpegArgs.push('-f', 'avfoundation', '-i', `:${mic.index}`)
        break
    }
  }
  if (webcam) {
    switch (process.platform) {
      case 'linux':
        baseFfmpegArgs.push('-f', 'v4l2', '-i', `/dev/video${webcam.index}`)
        break
      case 'win32':
        baseFfmpegArgs.push('-f', 'dshow', '-i', `video=${webcam.deviceLabel}`)
        break
      case 'darwin':
        baseFfmpegArgs.push('-f', 'avfoundation', '-i', `${webcam.index}:none`)
        break
    }
  }

  // --- Add Screen input last ---
  if (source === 'fullscreen') {
    const allDisplays = screen.getAllDisplays()
    const targetDisplay = allDisplays.find((d) => d.id === displayId) || screen.getPrimaryDisplay()
    // Fix for #135: Use scaleFactor to get physical pixel dimensions
    // display.bounds returns screen coordinates (scaled), but FFmpeg needs physical pixels
    const scaleFactor = targetDisplay.scaleFactor
    const x = Math.round(targetDisplay.bounds.x * scaleFactor)
    const y = Math.round(targetDisplay.bounds.y * scaleFactor)
    const width = Math.round(targetDisplay.bounds.width * scaleFactor)
    const height = Math.round(targetDisplay.bounds.height * scaleFactor)
    const safeWidth = Math.floor(width / 2) * 2
    const safeHeight = Math.floor(height / 2) * 2
    recordingGeometry = { x, y, width: safeWidth, height: safeHeight }
    switch (process.platform) {
      case 'linux':
        if (backendCapturesScreen()) {
          // Wayland: FFmpeg cannot see the compositor's screen, so the renderer
          // records it through xdg-desktop-portal and main muxes the result. No
          // FFmpeg screen input here.
          log.info(
            `[RecordingManager] Wayland fullscreen: deferring screen capture to the renderer (display.id=${targetDisplay.id}, ${safeWidth}x${safeHeight}).`,
          )
          break
        }
        baseFfmpegArgs.push(
          '-f',
          'x11grab',
          '-draw_mouse',
          '0',
          '-video_size',
          `${safeWidth}x${safeHeight}`,
          '-i',
          `${display}+${x},${y}`,
        )
        break
      case 'win32':
        baseFfmpegArgs.push(
          '-f',
          'gdigrab',
          '-draw_mouse',
          '0',
          '-offset_x',
          x.toString(),
          '-offset_y',
          y.toString(),
          '-video_size',
          `${safeWidth}x${safeHeight}`,
          '-i',
          'desktop',
        )
        break
      case 'darwin':
        // macOS 14+ can no longer capture the screen via avfoundation —
        // AVCaptureScreenInput is deprecated and returns "Input/output error".
        // We capture the screen in the renderer (ScreenCaptureKit) instead.
        // No FFmpeg screen input here.
        log.info(
          `[RecordingManager] macOS fullscreen: deferring screen capture to renderer (display.id=${targetDisplay.id}, ${safeWidth}x${safeHeight}).`,
        )
        break
    }
  } else if (source === 'area') {
    appState.recorderWin?.hide()
    createSelectionWindow()
    const selectedGeometry = await new Promise<any | undefined>((resolve) => {
      ipcMain.once('selection:complete', (_e, geo) => {
        // Read the overlay's own size before it closes: the selection is in CSS
        // pixels of that window, and its size is the only reference that maps the
        // rectangle onto the monitor's physical pixels later (see shared/wayland-crop.ts).
        const bounds = appState.selectionWin?.getBounds()
        appState.selectionWin?.close()
        resolve({ ...geo, overlay: bounds ? { width: bounds.width, height: bounds.height } : undefined })
      })
      ipcMain.once('selection:cancel', () => {
        appState.selectionWin?.close()
        appState.recorderWin?.show()
        resolve(undefined)
      })
    })
    if (!selectedGeometry) return { canceled: true }

    const safeWidth = Math.floor(selectedGeometry.width / 2) * 2
    const safeHeight = Math.floor(selectedGeometry.height / 2) * 2
    recordingGeometry = { x: selectedGeometry.x, y: selectedGeometry.y, width: safeWidth, height: safeHeight }

    // Wayland records the whole monitor, because the portal has no notion of a
    // user-drawn region, so the selection becomes a crop applied during the mux.
    if (backendCapturesScreen()) {
      if (selectedGeometry.overlay) {
        pendingCrop = {
          selection: {
            x: selectedGeometry.x,
            y: selectedGeometry.y,
            width: selectedGeometry.width,
            height: selectedGeometry.height,
          },
          overlay: selectedGeometry.overlay,
        }
        log.info(`[RecordingManager] Wayland area: whole monitor will be cropped to ${safeWidth}x${safeHeight}.`)
      } else {
        log.warn('[RecordingManager] Wayland area: overlay size unavailable; recording the whole monitor uncropped.')
      }
    }

    switch (process.platform) {
      case 'linux':
        if (backendCapturesScreen()) break
        baseFfmpegArgs.push(
          '-f',
          'x11grab',
          '-draw_mouse',
          '0',
          '-video_size',
          `${safeWidth}x${safeHeight}`,
          '-i',
          `${display}+${selectedGeometry.x},${selectedGeometry.y}`,
        )
        break
      case 'win32':
        baseFfmpegArgs.push(
          '-f',
          'gdigrab',
          '-draw_mouse',
          '0',
          '-offset_x',
          selectedGeometry.x.toString(),
          '-offset_y',
          selectedGeometry.y.toString(),
          '-video_size',
          `${safeWidth}x${safeHeight}`,
          '-i',
          'desktop',
        )
        break
    }
  } else {
    return { canceled: true }
  }

  // Only get/store original cursor scale on Linux
  if (process.platform === 'linux') {
    appState.originalCursorScale = await getCursorScale()
  }

  // --- Wayland: hand the screen to the native helper, when there is one ---
  // The helper owns a screen-cast session with the pointer as *data*, which is the
  // only way to reach its position on Wayland. It is tried after the source is
  // chosen (so an area selection happens first), and never at the cost of the
  // recording: if it cannot capture, the caller is told and asks again for the
  // renderer's browser capture, which is the path that was already working.
  let screenFilter: string | undefined
  const helperAllowed =
    requiresPortalCapture() &&
    options.screenCapture !== 'renderer' &&
    isCursorHelperAvailable() &&
    // Asked and answered on a previous recording: this desktop records the pointer
    // into the pixels, so trying again would only cost the user a second dialog.
    !isEmbeddedOnlyDesktop()
  if (helperAllowed) {
    const session = await startCursorHelper({
      fps: 30,
      onSample: (sample) => handleHelperSample(sample, recordingGeometry),
      onShape: (shape) => {
        // The pointer's bitmap, kept in the same map the X11 tracker fills: the
        // metadata writer turns it into `cursorImages`, and the editor draws the
        // user's real cursor from it rather than a stand-in.
        appState.runtimeCursorImageMap.set(shape.key, {
          width: shape.width,
          height: shape.height,
          xhot: shape.xhot,
          yhot: shape.yhot,
          image: shape.image,
        })
      },
      onEmbeddedOnly: () => rememberEmbeddedOnlyDesktop(),
      onWarning: (message) => log.warn(`[RecordingManager] Cursor helper: ${message}`),
    })
    if (!session) {
      log.info('[RecordingManager] The cursor helper could not capture; the renderer will take the screen.')
      return { canceled: true, needsRendererCapture: true }
    }

    // The portal is authoritative about the monitor it gave us: a 125%-scaled
    // display does not hand over the size the display reports, so the geometry and
    // any crop are computed from the stream itself.
    const video = { width: session.info.width, height: session.info.height }
    const crop = pendingCrop
      ? computeCrop({ selection: pendingCrop.selection, overlay: pendingCrop.overlay, video })
      : null
    if (crop) {
      recordingGeometry = { x: crop.x, y: crop.y, width: crop.width, height: crop.height }
      screenFilter = `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`
      log.info(`[RecordingManager] Wayland area: ${video.width}x${video.height} cropped to ${screenFilter}.`)
    } else {
      if (pendingCrop) {
        log.warn('[RecordingManager] Wayland area: selection does not fit the capture; keeping the whole frame.')
      }
      recordingGeometry = { x: 0, y: 0, width: video.width, height: video.height }
    }

    // Raw frames arrive on a descriptor, so FFmpeg is told what they are rather
    // than being handed a display to grab.
    baseFfmpegArgs.push(
      '-f',
      'rawvideo',
      '-pix_fmt',
      session.info.format,
      '-s',
      `${video.width}x${video.height}`,
      '-r',
      String(session.info.fps),
      '-i',
      '-',
    )
    appState.cursorHelper = session
    // This encode applies the crop, so the mux must not apply it a second time.
    pendingCrop = undefined
    log.info(
      `[RecordingManager] Capturing through the cursor helper: ${video.width}x${video.height} ` +
        `${session.info.format} @ ${session.info.fps}fps, clicks ${session.info.clicks ? 'on' : 'off'}.`,
    )
    if (!session.info.clicks) {
      // The helper captures the pointer position but could not read button
      // events from the input devices. Tell the recorder now, while the window
      // is still open, so the user does not discover missing clicks in the
      // editor. Reading evdev needs a udev uaccess rule (or input-group
      // membership); the exact rule is in the helper's own error hint.
      appState.recorderWin?.webContents.send(
        'recorder:cursor-clicks-off',
        'Mouse clicks could not be recorded: the app has no read access to your pointer devices. ' +
          'Create /etc/udev/rules.d/70-demothat-mouse.rules with ' +
          'KERNEL=="event*", SUBSYSTEM=="input", ENV{ID_INPUT_MOUSE}=="1", ENV{ID_INPUT_KEYBOARD}!="1", TAG+="uaccess" ' +
          '(repeat for ID_INPUT_TOUCHPAD), then run sudo udevadm control --reload-rules && sudo udevadm trigger ' +
          '--subsystem-match=input. Or add your user to the input group and log back in.',
      )
    }
  }
  // With the helper capturing, FFmpeg is fed raw frames on a pipe instead: the
  // renderer's browser capture is not used at all (two capture paths would mean two
  // portals, two pickers, and a pointer recorded twice).
  const useRendererScreenCapture = backendCapturesScreen() && appState.cursorHelper === null
  log.info('[RecordingManager] Starting actual recording with args:', baseFfmpegArgs, {
    hasWebcam: !!webcam,
    hasMic: !!mic,
    wantsSystemAudio,
    useRendererScreenCapture,
  })
  return startActualRecording(
    baseFfmpegArgs,
    !!webcam,
    !!mic,
    wantsSystemAudio,
    useRendererScreenCapture,
    recordingGeometry,
    !!cleanDemo,
    pendingCrop,
    screenFilter,
  )
}

/**
 * Handles the graceful stop of a recording, saves files, validates them, and opens the editor.
 */
export async function stopRecording() {
  restoreOriginalCursorScale()
  // Bring the desktop back immediately — the save/editor flow below can take
  // a while and the user should not be stuck with a stripped desktop.
  void restoreCleanDemoMode()
  log.info('[StopRecord] Stopping recording, preparing to save...')
  appState.tray?.destroy()
  appState.tray = null
  createSavingWindow()

  // Wayland: stop the capture helper first. Its descriptor closing is what tells
  // FFmpeg the frames have ended, so the file is finalized by FFmpeg itself rather
  // than being cut off mid-frame.
  if (appState.cursorHelper) {
    await stopCursorHelper()
    appState.cursorHelper = null
  }

  const session = appState.currentRecordingSession
  log.info('[StopRecord] Current session:', {
    screenVideoPath: session?.screenVideoPath,
    screenWebmPath: session?.screenWebmPath,
    systemAudioPath: session?.systemAudioPath,
    micAudioPath: session?.micAudioPath,
    webcamVideoPath: session?.webcamVideoPath,
    webmHasSystemAudio: session?.webmHasSystemAudio,
    hasMicAudio: session?.hasMicAudio,
  })
  const waitForRendererSystemAudioStop = session?.systemAudioPath ? createSystemAudioStopWaiter() : null
  const waitForRendererScreenCaptureStop = session?.screenWebmPath ? createScreenCaptureStopWaiter() : null

  // Tell the renderer to stop its MediaRecorder(s) so any pending chunks land
  // in the writer's queue. The renderer flushes a final chunk on stop().
  if (waitForRendererSystemAudioStop) {
    log.info('[StopRecord] Asking renderer to stop system-audio MediaRecorder.')
    appState.recorderWin?.webContents.send('recorder:stop-system-audio')
  }
  if (waitForRendererScreenCaptureStop) {
    log.info('[StopRecord] Asking renderer to stop screen-capture MediaRecorder.')
    appState.recorderWin?.webContents.send('recorder:stop-screen-capture')
  }

  // Step 1: Wait for FFmpeg and tracker to finish
  const stoppedGracefully = await cleanupAndSave()
  log.info('[StopRecord] FFmpeg process finished and file is finalized (or never spawned).')
  if (!stoppedGracefully) {
    // The screen input EOFs first, so screen.mp4 is complete; only the live
    // webcam input keeps FFmpeg alive and its file is truncated by the forced
    // kill (no moov box, unplayable). Keep the screen recording, drop the
    // webcam layer, and tell the user plainly.
    const session = appState.currentRecordingSession
    log.error('[StopRecord] FFmpeg had to be force-killed; dropping the truncated webcam file.', {
      screenVideoPath: session?.screenVideoPath,
      webcamVideoPath: session?.webcamVideoPath,
    })
    if (session?.webcamVideoPath) {
      await fsPromises.unlink(session.webcamVideoPath).catch(() => {})
      session.webcamVideoPath = undefined
    }
    dialog.showMessageBox({
      type: 'warning',
      title: 'Recording Saved Without Webcam',
      message: 'Your screen recording was saved, but the webcam video could not be finished.',
      detail:
        'A live webcam stream keeps the video encoder running, so the webcam file was cut short and removed.\n\n' +
        'The screen recording is complete and has been opened in the editor.',
      buttons: ['Open Editor'],
      defaultId: 0,
    })
  }

  // Step 1b: Wait for the renderer to finish forwarding the tail chunk, then
  // flush and finalize the renderer-side files (no-op when not used).
  if (waitForRendererSystemAudioStop) {
    await waitForSystemAudioStop(waitForRendererSystemAudioStop)
  }
  await systemAudioWriter.finalize()

  if (waitForRendererScreenCaptureStop) {
    await waitForScreenCaptureStop(waitForRendererScreenCaptureStop)
  }
  try {
    await screenVideoWriter.finalize()
    log.info('[StopRecord] Screen-capture writer finalized successfully.')
  } catch (err) {
    log.error('[StopRecord] Screen-capture writer failed during finalize:', err)
  }

  const finalizedSession = appState.currentRecordingSession
  if (!finalizedSession) {
    log.error('[StopRecord] No recording session found after cleanup. Aborting.')
    appState.savingWin?.close()
    appState.recorderWin?.show()
    return
  }

  // Notify recorder window that the recording has finished, allowing it to reset its UI
  appState.recorderWin?.webContents.send('recording-finished', { canceled: false, ...finalizedSession })

  // Step 2a: macOS — mux the renderer WebM (with optional system audio + mic)
  // into the final .mp4 BEFORE metadata processing so processAndSaveMetadata
  // can stat() the final file.
  if (finalizedSession.screenWebmPath) {
    try {
      await muxMacScreenWebm(finalizedSession)
    } catch (err) {
      log.error('[StopRecord] macOS mux failed. The screen webm will be kept for inspection.', err)
      // Leave artifacts in place so the user can recover. Validation will
      // fail below and the user gets a clear error.
    }
  }

  // Step 2b: Process and save metadata (after video file is complete)
  await processAndSaveMetadata(finalizedSession)

  // Step 2c: Linux/Windows — if we captured system audio separately, mux it
  // into the (already-existing) screen mp4. Skipped on macOS because the
  // system audio is already inside the webm and folded in by muxMacScreenWebm.
  if (finalizedSession.systemAudioPath) {
    try {
      await muxSystemAudio(finalizedSession)
    } catch (err) {
      log.error('[StopRecord] Failed to mux system audio. Keeping original screen file.', err)
      // Non-fatal: leave the original screen file intact and discard the system file.
      await fsPromises.unlink(finalizedSession.systemAudioPath).catch(() => {})
      finalizedSession.systemAudioPath = undefined
    }
  }

  // Step 3: Validate file
  const isValid = await validateRecordingFiles(finalizedSession)
  if (!isValid) {
    log.error('[StopRecord] Recording validation failed. Discarding files.')
    await cleanupEditorFiles(finalizedSession)
    appState.currentRecordingSession = null
    appState.savingWin?.close()
    resetCursorScale()
    appState.recorderWin?.show()
    return
  }

  await new Promise((resolve) => setTimeout(resolve, 500))
  appState.savingWin?.close()
  resetCursorScale()

  appState.currentRecordingSession = null
  if (finalizedSession) {
    createEditorWindow(
      finalizedSession.screenVideoPath,
      finalizedSession.metadataPath,
      finalizedSession.recordingGeometry,
      finalizedSession.webcamVideoPath,
    )
  }
  appState.recorderWin?.close()
}

/**
 * Muxes the renderer-recorded system-audio WebM into the screen file. Replaces
 * `session.screenVideoPath` in place; deletes the system-audio temp file.
 */
async function muxSystemAudio(session: RecordingSession): Promise<void> {
  if (!session.systemAudioPath) return

  // If the screen file wasn't created (e.g. avfoundation permission failure),
  // there is nothing to mux into — clean up and bail.
  try {
    await fsPromises.stat(session.screenVideoPath)
  } catch {
    log.warn('[Mux] Screen file missing; skipping mux and discarding system audio.')
    await fsPromises.unlink(session.systemAudioPath).catch(() => {})
    session.systemAudioPath = undefined
    return
  }

  // Validate inputs exist and have content. A zero-byte system-audio file
  // means the renderer never delivered chunks (e.g., permission denied) —
  // skip the mux and proceed with the original screen file.
  try {
    const sysStat = await fsPromises.stat(session.systemAudioPath)
    if (sysStat.size === 0) {
      log.warn('[Mux] System audio file is empty; skipping mux.')
      await fsPromises.unlink(session.systemAudioPath).catch(() => {})
      session.systemAudioPath = undefined
      return
    }
  } catch (err) {
    log.warn('[Mux] System audio file missing; skipping mux.', err)
    session.systemAudioPath = undefined
    return
  }

  const screenHasAudio = session.hasMicAudio ? await screenFileHasAudioStream(session.screenVideoPath) : false
  const tempOutput = session.screenVideoPath.replace(/\.mp4$/, '.muxed.mp4')
  // Bound the apad-padded audio mux. Prefer the screen file's own duration;
  // if that probe fails (e.g. a truncated capture), the system-audio file was
  // recorded in lockstep and is the same length — without a -t the infinite
  // apad pad makes this mux run forever.
  const durationSec =
    (await probeVideoDurationSec(session.screenVideoPath)) ?? (await probeVideoDurationSec(session.systemAudioPath))
  const args = buildMuxArgs({
    screenInput: session.screenVideoPath,
    systemAudioInput: session.systemAudioPath,
    output: tempOutput,
    hasMicAudio: screenHasAudio,
    durationSec,
  })

  log.info(`[Mux] Running ffmpeg ${args.join(' ')}`)

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(FFMPEG_PATH, args)
      let stderr = ''
      // A stalled mux must not hold the Saving dialog open forever.
      const timer = setTimeout(() => {
        proc.kill('SIGKILL')
        reject(new Error(`ffmpeg mux did not finish in time: ${stderr.slice(-500)}`))
      }, 60_000)
      proc.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      proc.stderr.on('data', (d) => {
        stderr += d.toString()
      })
      proc.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error(`ffmpeg mux exited ${code}: ${stderr.slice(-500)}`))
      })
    })
  } catch (error) {
    await fsPromises.unlink(tempOutput).catch(() => {})
    throw error
  }

  // Atomic-ish swap: rename muxed → screen, drop the original screen by virtue
  // of the rename overwriting it. Then drop the system-audio temp file.
  await fsPromises.rename(tempOutput, session.screenVideoPath)
  await fsPromises.unlink(session.systemAudioPath).catch((error) => {
    log.warn('[Mux] Failed to delete temporary system audio file after mux.', error)
  })
  session.systemAudioPath = undefined
  log.info('[Mux] System audio successfully muxed into screen file.')
}

/**
 * macOS only: transcodes the renderer-recorded screen WebM (VP9 + optional
 * Opus) into the final screen MP4 (H.264 + AAC), folding in the optional mic
 * AAC track produced by FFmpeg. After this returns successfully:
 *   - session.screenVideoPath has been (re)created with the muxed MP4
 *   - session.screenWebmPath / micAudioPath have been deleted and cleared
 *   - session.systemAudioPath stays unset (system audio rode inside the webm)
 */
async function muxMacScreenWebm(session: RecordingSession): Promise<void> {
  if (!session.screenWebmPath) return

  // Confirm the webm exists and is non-empty before launching ffmpeg.
  let webmStat
  try {
    webmStat = await fsPromises.stat(session.screenWebmPath)
  } catch (err) {
    log.error('[MacMux] Screen webm missing — renderer never produced output. Cannot proceed.', err)
    throw new Error('Screen recording produced no output (renderer did not write any chunks).')
  }
  if (webmStat.size === 0) {
    log.error('[MacMux] Screen webm is empty (zero bytes). Aborting mux.')
    throw new Error('Screen recording produced an empty file.')
  }
  log.info(`[MacMux] Screen webm size: ${webmStat.size} bytes (${session.screenWebmPath}).`)

  // Validate optional mic input. Drop a missing/empty mic file silently —
  // the recording is still useful with just the video (and possibly system
  // audio inside the webm).
  let resolvedMicPath = session.micAudioPath
  if (resolvedMicPath) {
    try {
      const micStat = await fsPromises.stat(resolvedMicPath)
      if (micStat.size === 0) {
        log.warn('[MacMux] Mic file is empty; dropping mic from mux.')
        resolvedMicPath = undefined
      } else {
        log.info(`[MacMux] Mic file size: ${micStat.size} bytes (${resolvedMicPath}).`)
      }
    } catch (err) {
      log.warn('[MacMux] Mic file missing; dropping mic from mux.', err)
      resolvedMicPath = undefined
    }
  }

  // Wayland: the portal captured a whole monitor, so the user's area has to be
  // cut out here. This pass already re-encodes the video, so the crop adds no
  // extra encode. The captured file's real size is the only trustworthy
  // reference — a 125%-scaled monitor does not produce the size the display
  // reports — so probe it rather than assume.
  let crop: { x: number; y: number; width: number; height: number } | null = null
  if (requiresPortalCapture()) {
    const videoSize = await probeVideoSize(session.screenWebmPath)
    if (!videoSize) {
      log.warn('[WaylandMux] Could not read the captured frame size; keeping the whole frame.')
    } else {
      crop = session.pendingCrop
        ? computeCrop({
            selection: session.pendingCrop.selection,
            overlay: session.pendingCrop.overlay,
            video: videoSize,
          })
        : null
      if (session.pendingCrop && !crop) {
        log.warn('[WaylandMux] Selection could not be mapped onto the captured frame; keeping the whole frame.')
      }
      // The editor derives its cursor and auto-zoom coordinates from
      // recordingGeometry, so it must describe the frame we actually produce.
      session.recordingGeometry = crop
        ? { x: 0, y: 0, width: crop.width, height: crop.height }
        : { x: 0, y: 0, width: videoSize.width, height: videoSize.height }
      log.info(
        `[WaylandMux] Frame ${videoSize.width}x${videoSize.height}; ${
          crop ? `cropping to ${crop.width}x${crop.height} at ${crop.x},${crop.y}` : 'no crop'
        }.`,
      )
    }
  }

  const args = buildMacMuxArgs({
    screenWebmInput: session.screenWebmPath,
    micAudioInput: resolvedMicPath,
    output: session.screenVideoPath,
    webmHasSystemAudio: !!session.webmHasSystemAudio,
    crop,
    // Bounds the apad-padded audio mux; the webm banner often has no Duration,
    // in which case -t is dropped and -shortest alone must cut the output.
    durationSec: await probeVideoDurationSec(session.screenWebmPath),
  })
  log.info(`[MacMux] Running ffmpeg ${args.join(' ')}`)

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args)
    let stderr = ''
    // A stalled mux must not hold the Saving dialog open forever.
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(new Error(`ffmpeg mac mux did not finish in time: ${stderr.slice(-500)}`))
    }, 60_000)
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      log.error('[MacMux] ffmpeg spawn error:', err)
      reject(err)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        log.info('[MacMux] ffmpeg mux exited 0 — final mp4 is ready.')
        resolve()
      } else {
        log.error(`[MacMux] ffmpeg exited ${code}: ${stderr.slice(-2000)}`)
        reject(new Error(`ffmpeg mac mux exited ${code}: ${stderr.slice(-500)}`))
      }
    })
  })

  // Confirm output exists and isn't empty before cleaning up sources.
  try {
    const outStat = await fsPromises.stat(session.screenVideoPath)
    log.info(`[MacMux] Final mp4 size: ${outStat.size} bytes (${session.screenVideoPath}).`)
    if (outStat.size === 0) {
      throw new Error('Mux produced empty output file.')
    }
  } catch (err) {
    log.error('[MacMux] Could not stat output mp4 after mux:', err)
    throw err
  }

  // Tidy up source files. We only delete after we've confirmed the mp4 is
  // good, so a half-broken mux still leaves the user's data on disk.
  await fsPromises.unlink(session.screenWebmPath).catch((err) => {
    log.warn('[MacMux] Failed to delete screen webm after mux.', err)
  })
  if (session.micAudioPath) {
    await fsPromises.unlink(session.micAudioPath).catch((err) => {
      log.warn('[MacMux] Failed to delete mic m4a after mux.', err)
    })
  }
  session.screenWebmPath = undefined
  session.micAudioPath = undefined
  session.webmHasSystemAudio = false
  session.pendingCrop = undefined
  log.info('[MacMux] Cleanup complete.')
}

/**
 * Cancels the recording and discards all associated files and processes.
 */
export async function cancelRecording() {
  log.info('Cancelling recording and deleting files...')
  await cleanupAndDiscard()
  appState.recorderWin?.webContents.send('recording-finished', { canceled: true })
  appState.recorderWin?.show()
}

/**
 * Stops trackers, writes metadata, and gracefully shuts down FFmpeg.
 */
async function cleanupAndSave(): Promise<boolean> {
  if (appState.mouseTracker) {
    appState.mouseTracker.stop()
    appState.mouseTracker = null
  }

  // Webcam frames arrive on a pipe from the feeder; EOF on that pipe is what
  // ends the webcam input, so stop the feeder BEFORE we wait for FFmpeg. The
  // screen input already EOF'd with the helper (or with stdin.end() below).
  if (appState.webcamFeeder) {
    log.info('[StopRecord] Stopping webcam feeder (its pipe EOF ends the webcam input).')
    appState.webcamFeeder.kill('SIGTERM')
    appState.webcamFeeder = null
  }

  // Grace: the time FFmpeg gets to close after SIGINT before we force it. The
  // screen input EOFs when the helper stops, but a live webcam or mic input
  // keeps the process running; SIGINT is the polite stop, SIGKILL the escape.
  // A real v4l2 webcam blocks SIGINT entirely (observed on KDE Wayland), so
  // keep the grace short — 3s is enough for a polite close on inputs that
  // honor it, and the screen file is already finalized by then.
  const FFMPEG_STOP_TIMEOUT_MS = 3000

  return new Promise<boolean>((resolve) => {
    if (appState.ffmpegProcess) {
      const ffmpeg = appState.ffmpegProcess
      appState.ffmpegProcess = null
      // Process may have already exited (e.g., avfoundation I/O error); if so,
      // exitCode is set and the 'close' event will never fire again.
      if (ffmpeg.exitCode !== null || ffmpeg.killed) {
        log.info(`FFmpeg process already exited with code ${ffmpeg.exitCode}`)
        resolve(true)
        return
      }
      let graceful = true
      const finished = () => {
        clearTimeout(escalation)
        log.info('FFmpeg process closed.')
        resolve(graceful)
      }
      const escalation = setTimeout(() => {
        // A live input (webcam, mic) can keep FFmpeg encoding for ever; the
        // Saving window must not wait on it.
        log.warn('[FFMPEG] Did not exit after SIGINT; killing it.')
        graceful = false
        ffmpeg.kill('SIGKILL')
      }, FFMPEG_STOP_TIMEOUT_MS)
      ffmpeg.on('close', finished)
      if (process.platform === 'win32') {
        try {
          ffmpeg.stdin?.write('q')
        } catch {
          // stdin already closed or unavailable
        }
      } else {
        // Linux/wayland screen frames arrive on stdin (the helper's pipe): end
        // it so that input reaches EOF even if the helper's stream closed
        // without propagating end, then signal for a graceful finish.
        try {
          ffmpeg.stdin?.end()
        } catch {
          // stdin already closed or unavailable
        }
        ffmpeg.kill('SIGINT')
      }
    } else {
      resolve(true)
    }
  })
}

/**
 * Processes mouse events against the final video start time and saves the metadata file.
 * @param session The current recording session.
 * @returns A promise that resolves to true on success, false on failure.
 */
async function processAndSaveMetadata(session: RecordingSession): Promise<boolean> {
  try {
    const videoStartTime = await getVideoStartTime(session.screenVideoPath)
    log.info(`[SYNC] Precise video start time from ffprobe: ${new Date(videoStartTime).toISOString()}`)

    const finalEvents = appState.recordedMouseEvents.map((event) => ({
      ...event,
      timestamp: Math.max(0, event.timestamp - videoStartTime),
    }))

    const primaryDisplay = screen.getPrimaryDisplay()
    // What the recording's audio actually is, read back from the finished file:
    // the editor builds one lane per track from this, and it is the only place
    // that knows whether the two sources were separated. A probe that fails
    // leaves the list empty, which reads as "no audio" — the same as a silent
    // recording, and never as a track the editor would have to guess at.
    const audioTracks = await probeAudioTracks(session.screenVideoPath)
    const finalMetadata = {
      platform: process.platform,
      screenSize: primaryDisplay.size,
      geometry: session.recordingGeometry,
      syncOffset: 0,
      cursorImages: Object.fromEntries(appState.runtimeCursorImageMap || []),
      events: finalEvents,
      audioTracks,
    }

    await fsPromises.writeFile(session.metadataPath, JSON.stringify(finalMetadata))
    log.info(`Metadata saved to ${session.metadataPath} (${audioTracks.length} audio track(s))`)
    return true
  } catch (err) {
    log.error(`Failed to process and save metadata: ${err}`)
    // Write an empty metadata file to avoid Editor crash
    const errorMetadata = {
      platform: process.platform,
      events: [],
      cursorImages: {},
      geometry: session.recordingGeometry,
      screenSize: screen.getPrimaryDisplay().size,
      syncOffset: 0,
      // The probe is what failed, so there is nothing honest to put here.
      audioTracks: [],
    }
    await fsPromises.writeFile(session.metadataPath, JSON.stringify(errorMetadata))
    return false
  }
}

/**
 * Forcefully terminates all recording processes and deletes any temporary files.
 */
export async function cleanupAndDiscard() {
  if (!appState.currentRecordingSession) return
  log.warn('[Cleanup] Discarding current recording session.')
  markSystemAudioStopped()
  markScreenCaptureStopped()
  const sessionToDiscard = { ...appState.currentRecordingSession }
  appState.currentRecordingSession = null

  appState.ffmpegProcess?.kill('SIGKILL')
  appState.ffmpegProcess = null

  appState.webcamFeeder?.kill('SIGKILL')
  appState.webcamFeeder = null

  // Tell the renderer to stop its MediaRecorder(s); even if it ignores us,
  // aborting the writers means subsequent IPC chunks are no-ops.
  appState.recorderWin?.webContents.send('recorder:stop-system-audio')
  appState.recorderWin?.webContents.send('recorder:stop-screen-capture')
  await Promise.allSettled([systemAudioWriter.abort(), screenVideoWriter.abort()])
  if (appState.cursorHelper) {
    await stopCursorHelper()
    appState.cursorHelper = null
  }

  appState.mouseTracker?.stop()
  appState.mouseTracker = null

  appState.recordedMouseEvents = []
  appState.runtimeCursorImageMap = new Map()

  restoreOriginalCursorScale()
  await restoreCleanDemoMode()
  appState.tray?.destroy()
  appState.tray = null

  // Asynchronously delete files to not block the UI
  setTimeout(async () => {
    await cleanupEditorFiles(sessionToDiscard)
    if (sessionToDiscard.systemAudioPath) {
      await fsPromises.unlink(sessionToDiscard.systemAudioPath).catch(() => {})
    }
    if (sessionToDiscard.screenWebmPath) {
      await fsPromises.unlink(sessionToDiscard.screenWebmPath).catch(() => {})
    }
    if (sessionToDiscard.micAudioPath) {
      await fsPromises.unlink(sessionToDiscard.micAudioPath).catch(() => {})
    }
  }, 200)
}

/**
 * Scans the recording directory for leftover files from crashed sessions and deletes them.
 */
export async function cleanupOrphanedRecordings() {
  log.info('[Cleanup] Starting orphaned recording cleanup...')
  const recordingDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.demothat')
  const protectedFiles = new Set<string>()

  // Protect files from the currently active editor or recording session
  if (appState.currentEditorSessionFiles) {
    Object.values(appState.currentEditorSessionFiles).forEach((file) => file && protectedFiles.add(file))
  }
  if (appState.currentRecordingSession) {
    Object.values(appState.currentRecordingSession).forEach((file) => file && protectedFiles.add(String(file)))
  }

  try {
    const allFiles = await fsPromises.readdir(recordingDir)
    const filePattern =
      /^DemoThat-recording-\d+(-screen\.mp4|-screen\.muxed\.mp4|-screen\.webm|-webcam\.mp4|-system\.webm|-mic\.m4a|\.json)$/
    const filesToDelete = allFiles
      .filter((file) => filePattern.test(file))
      .map((file) => path.join(recordingDir, file))
      .filter((fullPath) => !protectedFiles.has(fullPath))

    if (filesToDelete.length === 0) {
      log.info('[Cleanup] No orphaned files found.')
      return
    }
    log.warn(`[Cleanup] Found ${filesToDelete.length} orphaned files to delete.`)
    for (const filePath of filesToDelete) {
      try {
        await fsPromises.unlink(filePath)
        log.info(`[Cleanup] Deleted orphaned file: ${filePath}`)
      } catch (unlinkError) {
        log.error(`[Cleanup] Failed to delete orphaned file: ${filePath}`, unlinkError)
      }
    }
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.error('[Cleanup] Error during orphaned file cleanup:', error)
    }
  }
}

/**
 * Event handler for application quit, ensuring recordings are cleaned up before exit.
 */
export async function onAppQuit(event: Electron.Event) {
  // Never leave the user's desktop stripped, even if we are quitting mid-record.
  await restoreCleanDemoMode()
  if (appState.currentRecordingSession && !appState.isCleanupInProgress) {
    log.warn('[AppQuit] Active session detected. Cleaning up before exit...')
    event.preventDefault()
    appState.isCleanupInProgress = true
    try {
      await cleanupAndDiscard()
      log.info('[AppQuit] Cleanup finished.')
    } catch (error) {
      log.error('[AppQuit] Error during cleanup:', error)
    } finally {
      app.quit()
    }
  }
}

/**
 * Opens a file dialog to allow the user to import an existing video file for editing.
 */
export async function loadVideoFromFile() {
  log.info('[RecordingManager] Received load video from file request.')
  const recorderWindow = appState.recorderWin
  if (!recorderWindow) return { canceled: true }

  const { canceled, filePaths } = await dialog.showOpenDialog(recorderWindow, {
    title: 'Select a video file to edit',
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'mkv'] }],
  })

  if (canceled || filePaths.length === 0) return { canceled: true }

  const sourceVideoPath = filePaths[0]
  log.info(`[RecordingManager] User selected video file: ${sourceVideoPath}`)
  recorderWindow.hide()
  createSavingWindow()

  try {
    const recordingDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.demothat')
    await ensureDirectoryExists(recordingDir)
    const baseName = `DemoThat-recording-${Date.now()}`
    const screenVideoPath = path.join(recordingDir, `${baseName}-screen.mp4`)
    const metadataPath = path.join(recordingDir, `${baseName}.json`)

    await fsPromises.copyFile(sourceVideoPath, screenVideoPath)
    await fsPromises.writeFile(
      metadataPath,
      JSON.stringify({
        platform: process.platform,
        events: [],
        cursorImages: {},
        syncOffset: 0,
      }),
      'utf-8',
    )

    // A "fake" geometry is needed for imported videos. It will match the video dimensions.
    const session: RecordingSession = {
      screenVideoPath,
      metadataPath,
      webcamVideoPath: undefined,
      recordingGeometry: { x: 0, y: 0, width: 0, height: 0 },
    }
    const isValid = await validateRecordingFiles(session)
    if (!isValid) {
      await cleanupEditorFiles(session)
      appState.savingWin?.close()
      recorderWindow.show()
      return { canceled: true }
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
    appState.savingWin?.close()
    createEditorWindow(screenVideoPath, metadataPath, session.recordingGeometry, undefined)
    recorderWindow.close()
    return { canceled: false, filePath: screenVideoPath }
  } catch (error) {
    log.error('[RecordingManager] Error loading video from file:', error)
    dialog.showErrorBox('Error Loading Video', `An error occurred while loading the video: ${(error as Error).message}`)
    appState.savingWin?.close()
    if (recorderWindow && !recorderWindow.isDestroyed()) {
      recorderWindow.show()
    }
    return { canceled: true }
  }
}
