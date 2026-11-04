import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react'
import { ICON_SIZE, ICON_STROKE } from '../components/ui/icons'
import {
  Microphone,
  MicrophoneOff,
  DeviceComputerCamera,
  DeviceComputerCameraOff,
  DeviceDesktop,
  Loader2,
  Video,
  X,
  Marquee2,
  Pointer,
  Folder,
  Folders,
  Square,
  Volume,
  VolumeOff,
  Presentation,
  PresentationOff,
  InfoCircle,
} from 'tabler-icons-react'
import { Button } from '../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { useDeviceManager } from '../hooks/useDeviceManager'
import { cn } from '../lib/utils'
import { startSystemAudioCapture, type SystemAudioCaptureHandle } from '../lib/system-audio'
import { startScreenCapture, type ScreenCaptureHandle } from '../lib/screen-capture'
import { resolveCaptureBackend } from '../lib/capture-backend'
import type { SessionSummary } from '../../shared/session'
import '../index.css'

// --- Constants ---
/** Transparent margin kept around the dock inside the recorder window. */
const DOCK_MARGIN = 24

/**
 * Extra window height below the dock reserved for dropdown popovers. The device
 * Selects render in a portal, so their lists open OUTSIDE the dock; without this
 * reserve the native window clips them to the first item. The window is
 * transparent and frameless, so the reserve is invisible until a menu opens.
 *
 * Sized for Radix's `max-h-96` (384px) list: popover top sits just under the
 * trigger (~75px into the window), so 420 leaves every possible list fully
 * visible. The main process still clamps to the work area.
 */
const DROPDOWN_RESERVE = 420

const LINUX_SCALES = [
  { value: 2, label: '2x' },
  { value: 1.5, label: '1.5x' },
  { value: 1, label: '1x' },
]
const WINDOWS_SCALES = [
  { value: 3, label: '3x' },
  { value: 2, label: '2x' },
  { value: 1, label: '1x' },
]

// --- Types ---
type RecordingState = 'idle' | 'preparing' | 'recording'
type ActionInProgress = 'none' | 'recording' | 'loading'
type RecordingSource = 'area' | 'fullscreen'
type DisplayInfo = { id: number; name: string; isPrimary: boolean }

export function RecorderPage() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [isRecording, setIsRecording] = useState(false)
  const [actionInProgress, setActionInProgress] = useState<ActionInProgress>('none')
  /** Set by the cursor helper when clicks could not be recorded (evdev permission). */
  const [clicksUnavailableMessage, setClicksUnavailableMessage] = useState<string | null>(null)
  const [clicksHintMessage, setClicksHintMessage] = useState<string | null>(null)
  const [source, setSource] = useState<RecordingSource>('fullscreen')
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [selectedDisplayId, setSelectedDisplayId] = useState<string>('')
  const [selectedWebcamId, setSelectedWebcamId] = useState<string>('none')
  const [selectedMicId, setSelectedMicId] = useState<string>('none')
  const [systemAudioEnabled, setSystemAudioEnabled] = useState<boolean>(false)
  const [cleanDemoEnabled, setCleanDemoEnabled] = useState<boolean>(false)
  const [cursorScale, setCursorScale] = useState<number>(1)

  const { platform, webcams, mics, isInitializing, reload: reloadDevices } = useDeviceManager()
  // Which display server we are on, and therefore which capture backend the
  // recorder runs. Fetched in the same pass as the devices, so it is known by the
  // time the Record button un-disables.
  const [sessionInfo, setSessionInfo] = useState<SessionSummary | null>(null)
  const webcamPreviewRef = useRef<HTMLVideoElement>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)
  const systemAudioHandleRef = useRef<SystemAudioCaptureHandle | null>(null)
  const screenCaptureHandleRef = useRef<ScreenCaptureHandle | null>(null)
  const actionInProgressRef = useRef<ActionInProgress>('none')
  // Always points at the latest handleStart so the global-shortcut listener
  // (registered once) can invoke it without re-subscribing on every render.
  const startHandlerRef = useRef<() => void>(() => {})
  // The dock (+ preview) whose measured size drives the transparent window size.
  const contentRef = useRef<HTMLDivElement>(null)
  const lastSizeRef = useRef({ width: 0, height: 0 })
  /**
   * Set when the native cursor helper turned out to be unable to capture: the retry
   * takes the browser path instead, which is the one that was already working.
   */
  const forceRendererCaptureRef = useRef(false)

  const supportsSystemAudio = platform === 'darwin'
  const capture = useMemo(
    () => resolveCaptureBackend(platform, sessionInfo?.wayland ?? null, sessionInfo?.capture ?? null),
    [platform, sessionInfo],
  )
  const usesRendererScreenCapture = capture.usesRendererCapture
  const isBusy = actionInProgress !== 'none'
  const isWebcamPreviewVisible = selectedWebcamId !== 'none' && actionInProgress === 'none' && !isRecording

  const setActionState = useCallback((next: ActionInProgress) => {
    actionInProgressRef.current = next
    setActionInProgress(next)
  }, [])

  const cursorScales = useMemo(() => (platform === 'win32' ? WINDOWS_SCALES : LINUX_SCALES), [platform])

  // Effect for initializing settings and devices from storage/system
  useEffect(() => {
    const initialize = async () => {
      try {
        const [savedWebcamId, savedMicId, savedCursorScale, fetchedDisplays, fetchedSession] = await Promise.all([
          window.electronAPI.getSetting<string>('recorder.selectedWebcamId'),
          window.electronAPI.getSetting<string>('recorder.selectedMicId'),
          window.electronAPI.getSetting<number>('recorder.cursorScale'),
          window.electronAPI.getDisplays(),
          window.electronAPI.getSessionInfo(),
        ])
        console.info('[Recorder] Loaded saved settings:', {
          savedWebcamId,
          savedMicId,
          savedCursorScale,
          displayCount: fetchedDisplays.length,
          session: fetchedSession,
        })
        setSessionInfo(fetchedSession)

        setSelectedWebcamId(savedWebcamId || 'none')
        setSelectedMicId(savedMicId || 'none')

        // System-audio capture is intentionally NOT persisted across sessions.
        // It always starts OFF — the user opts in per session. This avoids the
        // "I didn't know I was recording system audio" surprise and the stale
        // state where a stored=true value sticks even after permission is
        // revoked. We also clear any value left over from an earlier build of
        // the app that did persist this flag.
        setSystemAudioEnabled(false)
        try {
          await window.electronAPI.setSetting('recorder.systemAudioEnabled', false)
        } catch (err) {
          console.warn('[Recorder] Failed to clear legacy systemAudioEnabled setting:', err)
        }

        // Only set cursor scale from settings for Linux
        if (platform === 'linux') {
          const scale = savedCursorScale ?? 1
          setCursorScale(scale)
          window.electronAPI.setCursorScale(scale)
        }

        setDisplays(fetchedDisplays)
        const primary = fetchedDisplays.find((d) => d.isPrimary) || fetchedDisplays[0]
        if (primary) setSelectedDisplayId(String(primary.id))
      } catch (error) {
        console.error('[Recorder] Failed to initialize recorder settings:', error)
      }
    }
    initialize()
  }, [platform]) // Depend on platform to ensure correct logic is applied

  // Effect to validate saved settings against available devices after initialization
  useEffect(() => {
    if (isInitializing) return

    if (webcams.length > 0 && !webcams.some((w) => w.id === selectedWebcamId)) {
      setSelectedWebcamId('none')
    }
    if (mics.length > 0 && !mics.some((m) => m.id === selectedMicId)) {
      setSelectedMicId('none')
    }
    if (platform === 'linux' && !cursorScales.some((s) => s.value === cursorScale)) {
      setCursorScale(1)
      window.electronAPI.setCursorScale(1)
    }
  }, [isInitializing, webcams, mics, platform, cursorScales, selectedWebcamId, selectedMicId, cursorScale])

  // Best-effort: stop the active system-audio capture, releasing tracks
  // and flushing the final MediaRecorder chunk.
  const stopSystemAudio = useCallback(async () => {
    const handle = systemAudioHandleRef.current
    systemAudioHandleRef.current = null
    if (handle) {
      console.info('[Recorder] Stopping system-audio capture handle.')
      try {
        await handle.stop()
      } catch (err) {
        console.error('[Recorder] Failed to stop system audio capture:', err)
      }
    }
  }, [])

  // Best-effort: stop the active screen capture, releasing the screen
  // MediaStream and flushing the final video chunk.
  const stopScreenCapture = useCallback(async () => {
    const handle = screenCaptureHandleRef.current
    screenCaptureHandleRef.current = null
    if (handle) {
      console.info('[Recorder] Stopping screen capture handle.')
      try {
        await handle.stop()
      } catch (err) {
        console.error('[Recorder] Failed to stop screen capture:', err)
      }
    }
  }, [])

  // Effect to manage IPC listeners for recording completion
  useEffect(() => {
    const cleanupStarted = window.electronAPI.onRecordingStarted(() => {
      console.info('[Recorder] recording-started received from main.')
      setIsRecording(true)
      setActionState('none')
    })

    const cleanupFinished = window.electronAPI.onRecordingFinished(() => {
      console.info('[Recorder] recording-finished received from main.')
      setActionState('none')
      setRecordingState('idle')
      setIsRecording(false)
      // Recording finished (or canceled) — release any MediaRecorders if
      // they're still alive. Main process has already finalized the writers.
      void stopSystemAudio()
      void stopScreenCapture()
      reloadDevices() // Refresh device list in case something changed
    })

    // Main process tells us to stop the system-audio MediaRecorder before it
    // finalizes the writer. Honor it eagerly so the tail chunk is flushed.
    const cleanupStopSystemAudio = window.electronAPI.onStopSystemAudio?.(() => {
      console.info('[Recorder] recorder:stop-system-audio received from main.')
      void (async () => {
        try {
          await stopSystemAudio()
        } finally {
          try {
            await window.electronAPI.notifySystemAudioStopped()
          } catch (error) {
            console.error('[Recorder] Failed to acknowledge system-audio stop to main process:', error)
          }
        }
      })()
    })

    // Same dance for the screen-capture MediaRecorder.
    const cleanupStopScreenCapture = window.electronAPI.onStopScreenCapture?.(() => {
      console.info('[Recorder] recorder:stop-screen-capture received from main.')
      void (async () => {
        try {
          await stopScreenCapture()
        } finally {
          try {
            await window.electronAPI.notifyScreenCaptureStopped()
          } catch (error) {
            console.error('[Recorder] Failed to acknowledge screen-capture stop to main process:', error)
          }
        }
      })()
    })

    // Global start shortcut from the main process → run the normal start flow
    // using the current UI selections.
    const cleanupTriggerStart = window.electronAPI.onTriggerStart(() => {
      console.info('[Recorder] recorder:trigger-start received from main.')
      startHandlerRef.current()
    })

    // The cursor helper captured, but could not read button events from the
    // input devices (no evdev access). The message tells the user the fix.
    const cleanupClicksOff = window.electronAPI.onCursorClicksOff?.((message) => {
      console.info('[Recorder] cursor clicks unavailable:', message)
      setClicksUnavailableMessage(message)
    })

    // On Wayland clicks ARE read, but a tap is a gesture and never recorded;
    // the message tells the user to press the touchpad or use a mouse.
    const cleanupClicksHint = window.electronAPI.onCursorClicksHint?.((message) => {
      console.info('[Recorder] wayland click hint:', message)
      setClicksHintMessage(message)
    })

    return () => {
      cleanupStarted()
      cleanupFinished()
      cleanupStopSystemAudio?.()
      cleanupStopScreenCapture?.()
      cleanupTriggerStart()
      cleanupClicksOff?.()
      cleanupClicksHint?.()
    }
  }, [reloadDevices, setActionState, stopSystemAudio, stopScreenCapture])

  // Effect to manage the webcam preview stream
  useEffect(() => {
    const videoEl = webcamPreviewRef.current
    const stopStream = () => {
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((track) => track.stop())
        webcamStreamRef.current = null
      }
      if (videoEl) videoEl.srcObject = null
    }

    if (recordingState !== 'idle' || selectedWebcamId === 'none' || !videoEl) {
      stopStream()
      return
    }

    const startStream = async () => {
      stopStream()
      try {
        const constraints = { video: platform === 'win32' ? true : { deviceId: { exact: selectedWebcamId } } }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        webcamStreamRef.current = stream
        if (videoEl) videoEl.srcObject = stream
      } catch (error) {
        console.error('Failed to start webcam preview stream:', error)
      }
    }

    startStream()
    return stopStream
  }, [selectedWebcamId, platform, recordingState])

  // The recorder window is transparent and frameless, so paint no page
  // background (see tokens.css) — only the dock should be visible.
  useEffect(() => {
    document.documentElement.setAttribute('data-surface', 'recorder')
    return () => document.documentElement.removeAttribute('data-surface')
  }, [])

  // Size the window to the dock instead of a fixed box, so nothing is clipped
  // and there is no large empty area around it.
  useLayoutEffect(() => {
    const element = contentRef.current
    if (!element) return

    const applySize = () => {
      const width = Math.ceil(element.offsetWidth) + DOCK_MARGIN * 2
      // The dropdown popovers need room below the dock (see DROPDOWN_RESERVE).
      const height = Math.ceil(element.offsetHeight) + DOCK_MARGIN * 2 + DROPDOWN_RESERVE
      if (width === lastSizeRef.current.width && height === lastSizeRef.current.height) return
      lastSizeRef.current = { width, height }
      window.electronAPI?.setRecorderWindowSize?.({ width, height })
    }

    applySize()
    const observer = new ResizeObserver(applySize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [isWebcamPreviewVisible])

  const handleStart = async () => {
    if (isRecording || actionInProgressRef.current !== 'none') return

    setActionState('recording')
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((track) => track.stop())
      webcamStreamRef.current = null
      if (webcamPreviewRef.current) webcamPreviewRef.current.srcObject = null
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    try {
      const webcam = selectedWebcamId !== 'none' ? webcams.find((d) => d.id === selectedWebcamId) : undefined
      const mic = selectedMicId !== 'none' ? mics.find((d) => d.id === selectedMicId) : undefined
      const wantSystemAudio = systemAudioEnabled && supportsSystemAudio

      console.info('[Recorder] handleStart called', {
        source,
        selectedDisplayId,
        platform,
        usesRendererScreenCapture,
        wantSystemAudio,
        hasMic: !!mic,
        hasWebcam: !!webcam,
      })

      // On macOS we capture the screen in the renderer because FFmpeg's
      // avfoundation screen input is broken on macOS 14+. The renderer's
      // ScreenCaptureKit-backed MediaRecorder writes a single WebM with
      // optional system audio folded in. Errors here are fatal — without a
      // screen recording there's nothing to mux.
      let systemAudioCarriedInScreenStream = false
      // Either the backend says the renderer captures, or a helper attempt already
      // failed for this recording and we are on the second, deliberate try.
      const rendererCaptures = usesRendererScreenCapture || forceRendererCaptureRef.current
      if (rendererCaptures) {
        try {
          screenCaptureHandleRef.current = await startScreenCapture({
            displayId: source === 'fullscreen' ? Number(selectedDisplayId) : undefined,
            // Only the macOS backend folds system audio into the screen stream;
            // elsewhere (Linux, Wayland included) it keeps its own writer.
            includeSystemAudio: capture.systemAudioRidesInScreenStream && wantSystemAudio,
            onError: (err) => console.error('[Recorder] Screen capture failed mid-recording:', err),
          })
          systemAudioCarriedInScreenStream = screenCaptureHandleRef.current.hasSystemAudio()
          console.info('[Recorder] Screen capture started.', {
            hasSystemAudioInStream: systemAudioCarriedInScreenStream,
          })
        } catch (err) {
          console.error('[Recorder] Could not start screen capture:', err)
          screenCaptureHandleRef.current = null
          setActionState('none')
          setIsRecording(false)
          window.electronAPI.showMessageBox({
            type: 'warning',
            title: platform === 'darwin' ? 'Screen Recording Permission Required' : 'Could not access the screen',
            message: 'DemoThat could not access the screen.',
            detail:
              platform === 'darwin'
                ? 'Go to System Settings → Privacy & Security → Screen Recording, enable the toggle next to "Electron" (the dev build), then restart the app and try again.'
                : 'Your desktop did not hand over the screen. If a screen-sharing dialog appeared, accept it and try again. Some Wayland desktops cannot provide a screen recording at all, in which case recording from an X11 session works.',
            buttons: ['OK'],
          })
          return
        }
      }

      // Set up system-audio capture *before* starting the recording so the TCC
      // permission prompt fires up-front rather than mid-recording. On macOS
      // the screen capture above already grabbed system audio, so we skip the
      // separate system-audio capture path.
      let systemAudioReady = systemAudioCarriedInScreenStream
      // Linux: capture the microphone in the renderer (see system-audio.ts).
      const micCapturedInRenderer = platform === 'linux' && !!mic
      if (micCapturedInRenderer && mic) {
        try {
          systemAudioHandleRef.current = await startSystemAudioCapture({
            micDeviceId: mic.id,
            onError: (err) => console.error('[Recorder] Microphone capture failed mid-recording:', err),
          })
          systemAudioReady = true
        } catch (err) {
          console.error('[Recorder] Could not start microphone capture:', err)
          systemAudioHandleRef.current = null
          setActionState('none')
          setIsRecording(false)
          window.electronAPI.showMessageBox({
            type: 'warning',
            title: 'Microphone Unavailable',
            message: 'DemoThat could not access the selected microphone.',
            detail: String(err instanceof Error ? err.message : err),
            buttons: ['OK'],
          })
          return
        }
      }
      if (wantSystemAudio && !usesRendererScreenCapture) {
        try {
          systemAudioHandleRef.current = await startSystemAudioCapture({
            onError: (err) => console.error('[Recorder] System audio capture failed mid-recording:', err),
          })
          systemAudioReady = true
        } catch (err) {
          console.error('[Recorder] Could not start system audio capture:', err)
          systemAudioHandleRef.current = null
          // Disable the toggle so it doesn't keep failing on retry
          setSystemAudioEnabled(false)
          window.electronAPI.setSetting('recorder.systemAudioEnabled', false)
          await stopScreenCapture()
          setActionState('none')
          setIsRecording(false)
          window.electronAPI.showMessageBox({
            type: 'warning',
            title: 'System Audio Permission Required',
            message: 'DemoThat could not access system audio.',
            detail:
              'Go to System Settings → Privacy & Security → Screen Recording (macOS 14.3 and earlier) or Microphone (macOS 14.4+) and enable the toggle next to "Electron". Then re-enable System audio in the recorder and try again.',
            buttons: ['OK'],
          })
          return
        }
      }

      console.info('[Recorder] Calling main.startRecording with', {
        source,
        displayId: source === 'fullscreen' ? Number(selectedDisplayId) : undefined,
        hasWebcam: !!webcam,
        hasMic: !!mic,
        systemAudio: systemAudioReady,
      })

      const result = await window.electronAPI.startRecording({
        source,
        displayId: source === 'fullscreen' ? Number(selectedDisplayId) : undefined,
        webcam: webcam ? { deviceId: webcam.id, deviceLabel: webcam.id, index: webcams.indexOf(webcam) } : undefined,
        mic:
          mic && !micCapturedInRenderer
            ? { deviceId: mic.id, deviceLabel: mic.id, index: mics.indexOf(mic) }
            : undefined,
        systemAudio: systemAudioReady,
        cleanDemo: cleanDemoEnabled,
        // Which of the two Wayland capture paths main should take. On X11 and macOS
        // this is not consulted.
        screenCapture: rendererCaptures ? 'renderer' : 'helper',
      })

      if (result.needsRendererCapture) {
        // The helper exists but could not deliver — usually a desktop whose portal
        // cannot report the pointer separately. The browser capture takes over; the
        // retry is deliberate and explicit so nothing half-started is reused.
        console.info('[Recorder] The cursor helper could not capture; using the browser capture.')
        forceRendererCaptureRef.current = true
        await stopSystemAudio()
        setActionState('none')
        setIsRecording(false)
        startHandlerRef.current()
        return
      }

      if (result.canceled) {
        console.warn('[Recorder] main.startRecording returned canceled.')
        // If the user canceled (or main returned canceled), make sure we don't
        // leak the MediaRecorders we already started.
        await stopSystemAudio()
        await stopScreenCapture()
        setActionState('none')
        setIsRecording(false)
      }
    } catch (error) {
      console.error('[Recorder] Failed to start recording:', error)
      await stopSystemAudio()
      await stopScreenCapture()
      setActionState('none')
      setIsRecording(false)
    }
  }

  // Keep the ref pointed at the latest handleStart for the global-shortcut
  // listener (which is registered once, in the IPC effect above).
  useEffect(() => {
    startHandlerRef.current = handleStart
  })

  const handleStop = () => {
    if (!isRecording || actionInProgressRef.current !== 'none') return

    setActionState('recording')
    window.electronAPI.stopRecording()
  }

  const handleLoadVideo = async () => {
    if (isRecording || actionInProgressRef.current !== 'none') return

    setActionState('loading')
    try {
      const result = await window.electronAPI.loadVideoFromFile()
      if (result.canceled) setActionState('none')
    } catch (error) {
      console.error('Failed to load video from file:', error)
      setActionState('none')
    }
  }

  const handleOpenProject = async () => {
    if (isRecording || actionInProgressRef.current !== 'none') return
    try {
      await window.electronAPI.promptOpenProject()
    } catch (error) {
      console.error('[Recorder] Failed to open project:', error)
    }
  }

  const handleSelectionChange = (setter: (id: string) => void, key: string) => (id: string) => {
    setter(id)
    window.electronAPI.setSetting(key, id)
  }

  const handleCursorScaleChange = (value: string) => {
    const newScale = Number(value)
    setCursorScale(newScale)
    window.electronAPI.setCursorScale(newScale)
    window.electronAPI.setSetting('recorder.cursorScale', newScale)
  }

  return (
    <div className="relative h-screen w-screen bg-transparent select-none">
      <div className="absolute top-0 left-0 right-0 flex flex-col items-center pt-6">
        <div ref={contentRef} data-interactive="true" className="relative">
          {/* Main Control Bar */}
          <div
            className="relative flex items-center gap-3 rounded-pv border border-line bg-panel px-4 py-3 shadow-[var(--sa-popover-shadow)]"
            style={{ WebkitAppRegion: 'drag' }}
          >
            <button
              onClick={() => window.electronAPI.closeWindow()}
              style={{ WebkitAppRegion: 'no-drag' }}
              className="absolute -top-2.5 -left-2.5 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-panel text-danger hover:bg-ctl"
              aria-label="Close Recorder"
              disabled={isRecording || isBusy}
            >
              <X size={ICON_SIZE} strokeWidth={ICON_STROKE} />
            </button>

            {/* Source Toggle */}
            <div
              className="flex items-center gap-0.5 rounded-seg border border-line bg-ctl p-0.5"
              style={{ WebkitAppRegion: 'no-drag' }}
            >
              <SourceButton
                icon={<DeviceDesktop size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
                isActive={source === 'fullscreen'}
                onClick={() => setSource('fullscreen')}
                tooltip="Full Screen"
                disabled={isRecording || isBusy}
              />
              <SourceButton
                icon={<Marquee2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
                isActive={source === 'area'}
                onClick={() => setSource('area')}
                tooltip="Area"
                disabled={isRecording || isBusy}
              />
            </div>

            <div className="h-5 w-px bg-line"></div>

            {/* Device Selectors */}
            <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
              {capture.displayPickerSupported ? (
                <Select
                  value={selectedDisplayId}
                  onValueChange={setSelectedDisplayId}
                  disabled={source !== 'fullscreen' || isRecording || isBusy}
                >
                  <SelectTrigger
                    variant="minimal"
                    className="w-auto min-w-[120px] max-w-[150px] h-9"
                    aria-label="Select display"
                  >
                    <SelectValue asChild>
                      <div className="flex items-center gap-1.5 text-xs">
                        <DeviceDesktop size={14} className="text-accent shrink-0" />
                        <span className="truncate">
                          {displays.find((d) => String(d.id) === selectedDisplayId)?.name || '...'}
                        </span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {displays.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                // Wayland: the portal's own dialog decides which screen is
                // shared, so offering a display list here would be a lie.
                <div
                  className={cn(
                    'flex h-9 items-center gap-1.5 rounded-ctl border border-line bg-ctl px-2.5 text-xs text-muted',
                    source !== 'fullscreen' && 'opacity-45',
                  )}
                  title="Which screen is shared is chosen in the system dialog when recording starts."
                  aria-label="Screen chosen by the system dialog"
                >
                  <DeviceDesktop size={14} className="text-accent shrink-0" />
                  <span className="truncate">System dialog</span>
                </div>
              )}

              <Select
                value={selectedWebcamId}
                onValueChange={handleSelectionChange(setSelectedWebcamId, 'recorder.selectedWebcamId')}
                disabled={isRecording || isBusy}
              >
                <SelectTrigger
                  variant="minimal"
                  className="w-auto min-w-[120px] max-w-[150px] h-9"
                  aria-label="Select webcam"
                >
                  <SelectValue asChild>
                    <div className="flex items-center gap-1.5 text-xs">
                      {selectedWebcamId !== 'none' ? (
                        <DeviceComputerCamera size={14} className="text-accent shrink-0" />
                      ) : (
                        <DeviceComputerCameraOff size={14} className="text-muted/60" />
                      )}
                      <span className={cn('truncate', selectedWebcamId === 'none' && 'text-muted')}>
                        {webcams.find((w) => w.id === selectedWebcamId)?.name || 'No webcam'}
                      </span>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No webcam</SelectItem>
                  {webcams.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={selectedMicId}
                onValueChange={handleSelectionChange(setSelectedMicId, 'recorder.selectedMicId')}
                disabled={isRecording || isBusy}
              >
                <SelectTrigger
                  variant="minimal"
                  className="w-auto min-w-[120px] max-w-[150px] h-9"
                  aria-label="Select microphone"
                >
                  <SelectValue asChild>
                    <div className="flex items-center gap-1.5 text-xs">
                      {selectedMicId !== 'none' ? (
                        <Microphone size={14} className="text-accent shrink-0" />
                      ) : (
                        <MicrophoneOff size={14} className="text-muted/60" />
                      )}
                      <span className={cn('truncate', selectedMicId === 'none' && 'text-muted')}>
                        {mics.find((m) => m.id === selectedMicId)?.name || 'No microphone'}
                      </span>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No microphone</SelectItem>
                  {mics.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* System Audio Toggle (macOS only) — session-local, not persisted. */}
              {supportsSystemAudio && (
                <button
                  type="button"
                  onClick={async () => {
                    const next = !systemAudioEnabled
                    console.info(`[Recorder] System-audio toggle clicked. next=${next}`)
                    if (next) {
                      // Check permission before enabling. If not granted, the
                      // main process pops a dialog with a link to System
                      // Settings → Privacy & Security → Screen Recording, and
                      // we leave the toggle off until the user retries.
                      let status: 'granted' | 'denied' | 'not-determined' = 'denied'
                      try {
                        status = await window.electronAPI.checkScreenRecordingPermission()
                      } catch (err) {
                        console.error('[Recorder] checkScreenRecordingPermission threw:', err)
                      }
                      console.info(`[Recorder] Screen recording permission status: ${status}`)
                      if (status !== 'granted') return
                    }
                    setSystemAudioEnabled(next)
                  }}
                  disabled={isRecording || isBusy}
                  aria-pressed={systemAudioEnabled}
                  aria-label={systemAudioEnabled ? 'Disable system audio recording' : 'Enable system audio recording'}
                  title={
                    systemAudioEnabled
                      ? 'System audio: ON (recording desktop sound)'
                      : 'System audio: OFF (click to enable)'
                  }
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded-ctl border px-2.5 text-ui transition-colors',
                    systemAudioEnabled ? 'border-accent bg-ctl text-fg' : 'border-line bg-ctl text-muted hover:text-fg',
                    (isRecording || isBusy) && 'cursor-not-allowed opacity-45',
                  )}
                >
                  {systemAudioEnabled ? (
                    <Volume size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                  ) : (
                    <VolumeOff size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                  )}
                  <span className="truncate">System audio</span>
                </button>
              )}

              {/* Clean Demo Mode — session-local, applied on record and reverted on stop. */}
              <button
                type="button"
                onClick={() => setCleanDemoEnabled((next) => !next)}
                disabled={isRecording || isBusy}
                aria-pressed={cleanDemoEnabled}
                aria-label={cleanDemoEnabled ? 'Disable Clean Demo Mode' : 'Enable Clean Demo Mode'}
                title={
                  cleanDemoEnabled
                    ? 'Clean Demo Mode: ON (desktop clutter hidden while recording)'
                    : 'Clean Demo Mode: OFF (hide Dock, menu bar, other apps and desktop icons while recording)'
                }
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-ctl border px-2.5 text-ui transition-colors',
                  cleanDemoEnabled ? 'border-accent bg-ctl text-fg' : 'border-line bg-ctl text-muted hover:text-fg',
                  (isRecording || isBusy) && 'cursor-not-allowed opacity-45',
                )}
              >
                {cleanDemoEnabled ? (
                  <Presentation size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                ) : (
                  <PresentationOff size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                )}
                <span className="truncate">Clean demo</span>
              </button>
            </div>

            <div className="h-5 w-px bg-line"></div>

            {/* Cursor Scale (Linux Only) */}
            {platform === 'linux' && (
              <>
                <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' }}>
                  <Pointer size={ICON_SIZE} strokeWidth={ICON_STROKE} className="text-muted" />
                  <Select
                    value={String(cursorScale)}
                    onValueChange={handleCursorScaleChange}
                    disabled={isRecording || isBusy}
                  >
                    <SelectTrigger variant="minimal" className="w-16" aria-label="Select cursor scale">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {cursorScales.map((s) => (
                        <SelectItem key={s.value} value={String(s.value)}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="h-5 w-px bg-line"></div>
              </>
            )}

            {/* Action Buttons */}
            <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' }}>
              <div className="flex items-center gap-2">
                {isRecording ? (
                  <Button
                    onClick={handleStop}
                    title={`Stop Recording (${platform === 'darwin' ? 'Cmd' : 'Ctrl'}+Shift+S)`}
                    variant="destructive"
                    size="icon"
                  >
                    <Square size={ICON_SIZE} strokeWidth={ICON_STROKE} fill="currentColor" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleStart}
                    title={`Record (${platform === 'darwin' ? 'Cmd' : 'Ctrl'}+Shift+R)`}
                    disabled={isInitializing || isBusy}
                    size="icon"
                  >
                    <Video size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                  </Button>
                )}
                <Button
                  onClick={handleLoadVideo}
                  title="Load from video"
                  disabled={isInitializing || isBusy || isRecording}
                  variant="secondary"
                  size="icon"
                >
                  <Folder size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                </Button>
                <Button
                  onClick={handleOpenProject}
                  title="Open Project"
                  disabled={isInitializing || isBusy || isRecording}
                  variant="secondary"
                  size="icon"
                >
                  <Folders size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                </Button>
              </div>
              <div className="w-8 h-10 flex items-center justify-center">
                <Loader2
                  size={ICON_SIZE}
                  className={cn(
                    'animate-spin text-muted',
                    actionInProgress !== 'none' || isInitializing ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </div>
            </div>
          </div>

          {capture.notice && (
            <div className="mx-auto mt-2 flex max-w-[720px] items-start gap-2 rounded-ctl border border-line bg-panel px-3 py-2 text-xs text-muted">
              <InfoCircle size={14} strokeWidth={ICON_STROKE} className="mt-px shrink-0 text-accent" />
              <span>{capture.notice}</span>
            </div>
          )}

          {clicksHintMessage && (
            <div className="mx-auto mt-2 flex max-w-[720px] items-start gap-2 rounded-ctl border border-line bg-panel px-3 py-2 text-xs text-muted">
              <InfoCircle size={14} strokeWidth={ICON_STROKE} className="mt-px shrink-0 text-accent" />
              <span>{clicksHintMessage}</span>
            </div>
          )}

          {clicksUnavailableMessage && (
            <div className="mx-auto mt-2 flex max-w-[720px] items-start gap-2 rounded-ctl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              <InfoCircle size={14} strokeWidth={ICON_STROKE} className="mt-px shrink-0 text-danger" />
              <span>{clicksUnavailableMessage}</span>
            </div>
          )}

          {/* Webcam Preview — kept mounted so the preview stream stays attached,
              but removed from the layout while hidden so it reserves no space. */}
          <div
            className={cn(
              'mx-auto mt-4 aspect-square w-48 overflow-hidden rounded-2xl bg-stage ring-1 ring-line',
              !isWebcamPreviewVisible && 'hidden',
            )}
          >
            <video ref={webcamPreviewRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>
        </div>
      </div>
    </div>
  )
}

const SourceButton = ({
  icon,
  isActive,
  tooltip,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ReactNode; isActive: boolean; tooltip?: string }) => (
  <button
    className={cn(
      'flex h-7 w-8 items-center justify-center rounded-[5px] text-ui outline-none transition-colors',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      isActive ? 'bg-panel text-fg shadow-[0_0_0_1px_var(--sa-line)]' : 'text-muted hover:text-fg',
    )}
    title={tooltip}
    {...props}
  >
    {icon}
  </button>
)
