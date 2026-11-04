/* eslint-disable @typescript-eslint/no-explicit-any */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  ActivationResult,
  CheckoutStartResult,
  DeactivationResult,
  DeviceView,
  LicenseSummary,
  PurchaseEvent,
} from '../shared/license'
import type { Product } from '../shared/pricing'
import type { SessionSummary } from '../shared/session'
import type { components } from '../shared/api-types'

/**
 * Publishing shapes come straight from the vendored contract, so the renderer cannot
 * drift from what the API actually returns.
 */
type PublishCapabilities = components['schemas']['PublishingCapabilities']
type PublicationKind = components['schemas']['PublicationKind']
type PublicationView = components['schemas']['PublicationView']
type PublicationAnalytics = components['schemas']['PublicationAnalytics']
type PublicationAnalyticsRange = '7d' | '30d' | '90d' | 'all'

// Define the type for the callback value
type RecordingResult = {
  canceled: boolean
  /**
   * Set when the Wayland cursor helper could not capture, so the recorder should
   * ask again and let the renderer take the screen instead.
   */
  needsRendererCapture?: boolean
  filePath: string | undefined
}

type ProjectPayload = {
  videoPath: string
  metadataPath: string
  webcamVideoPath?: string
}

type ExportPayload = {
  projectState: any
  exportSettings: any
  outputPath: string
}
// Payload received from process
type ProgressPayload = {
  progress: number // 0-100
  stage: string
  /** Cloud stages: percent within the stage, before the overall mapping. */
  stagePercent?: number
  framesDone?: number
  totalFrames?: number
  /** Credits held for this job (cloud). */
  reserved?: number
  /** Credits used so far, from the server (cloud). */
  consumed?: number
  etaSeconds?: number | null
  /** The server's minimum charge once GPU work has begun (cloud). */
  minChargeCredits?: number
}
// Payload when completed
type CompletePayload = {
  success: boolean
  outputPath?: string
  error?: string
  /** The server's settled numbers after a cloud export. */
  charge?: number
  refund?: number
  /** Why the cloud step ended, when it did not succeed. */
  cloudReason?: string
  /** The price the server quoted when it refused the job. */
  cost?: number
  /** Balance the server reported on a refusal. */
  balance?: number
  /** The local render, kept so a failed cloud step needs no second render. */
  intermediatePath?: string
  canRetryCloud?: boolean
  /** Everything a cloud retry needs (target size, fps, clip length). */
  cloudRetry?: { targetWidth: number; targetHeight: number; fps: number; durationSec: number }
}

// Payload for worker render
type RenderStartPayload = {
  projectState: any
  exportSettings: any
  renderWidth?: number
  renderHeight?: number
}

type WindowSource = {
  id: string
  name: string
  thumbnailUrl: string
  geometry?: {
    x: number
    y: number
    width: number
    height: number
  }
}

// --- Presets ---
type Preset = any

type DisplayInfo = {
  id: number
  name: string
  bounds: { x: number; y: number; width: number; height: number }
  isPrimary: boolean
}

// --- Update ---
type UpdateInfo = {
  version: string
  url: string
}

// --- Dshow Devices ---
type DshowDevice = {
  name: string
  alternativeName: string
}

// --- Cursor Theme ---
type CursorTheme = any

// Define API to be exposed to window object
export const electronAPI = {
  // --- Recording ---
  startRecording: (options: {
    source: 'area' | 'fullscreen' | 'window'
    geometry?: WindowSource['geometry']
    windowTitle?: string
    displayId?: number
    webcam?: { deviceId: string; deviceLabel: string; index: number }
    mic?: { deviceId: string; deviceLabel: string; index: number }
    systemAudio?: boolean
    /** Clean Demo Mode: hide the Dock, menu bar, other apps and desktop clutter while recording. */
    cleanDemo?: boolean
    /**
     * Which Wayland capture path to take: the native cursor helper, or the
     * renderer's browser capture. Ignored on X11, Windows and macOS.
     */
    screenCapture?: 'helper' | 'renderer'
  }): Promise<RecordingResult> => ipcRenderer.invoke('recording:start', options),
  stopRecording: (): void => ipcRenderer.send('recording:stop'),
  loadVideoFromFile: (): Promise<RecordingResult> => ipcRenderer.invoke('recording:load-from-file'),

  // --- Interface zoom ---
  zoomIn: (): Promise<number> => ipcRenderer.invoke('window:zoom-in'),
  zoomOut: (): Promise<number> => ipcRenderer.invoke('window:zoom-out'),
  zoomReset: (): Promise<number> => ipcRenderer.invoke('window:zoom-reset'),
  getZoomFactor: (): Promise<number> => ipcRenderer.invoke('window:zoom-factor'),

  /** Brings the recorder window to the front ("New recording"). */
  showRecorderWindow: (): void => ipcRenderer.send('app:show-recorder'),

  getCursorScale: (): Promise<number> => ipcRenderer.invoke('desktop:get-cursor-scale'),
  setCursorScale: (scale: number): void => ipcRenderer.send('desktop:set-cursor-scale', scale),

  // --- System Audio Loopback (macOS) ---
  // electron-audio-loopback registers `enable-loopback-audio` and
  // `disable-loopback-audio` IPC handlers in initMain(). Wrap each
  // getDisplayMedia call between enable/disable so Chromium returns a
  // system-audio track instead of microphone audio.
  enableLoopbackAudio: (): Promise<void> => ipcRenderer.invoke('enable-loopback-audio'),
  disableLoopbackAudio: (): Promise<void> => ipcRenderer.invoke('disable-loopback-audio'),
  writeSystemAudioChunk: (chunk: ArrayBuffer): Promise<number> =>
    ipcRenderer.invoke('recording:write-system-audio', chunk),
  notifySystemAudioStopped: (): Promise<void> => ipcRenderer.invoke('recording:system-audio-stopped'),
  onStopSystemAudio: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('recorder:stop-system-audio', listener)
    return () => ipcRenderer.removeListener('recorder:stop-system-audio', listener)
  },

  // --- Renderer-side Screen Capture (macOS) ---
  // AVFoundation's screen input is non-functional on macOS 14+ (Sequoia),
  // so the screen video is captured in the renderer via getUserMedia
  // (chromeMediaSource: 'desktop'), streamed as WebM/VP9 chunks to the main
  // process, and muxed into the final MP4 alongside the optional mic track.
  getScreenSources: (): Promise<{ id: string; name: string; display_id: string }[]> =>
    ipcRenderer.invoke('recording:get-screen-sources'),
  writeScreenVideoChunk: (chunk: ArrayBuffer): Promise<number> =>
    ipcRenderer.invoke('recording:write-screen-video', chunk),
  notifyScreenCaptureStopped: (): Promise<void> => ipcRenderer.invoke('recording:screen-capture-stopped'),
  onStopScreenCapture: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('recorder:stop-screen-capture', listener)
    return () => ipcRenderer.removeListener('recorder:stop-screen-capture', listener)
  },

  getDisplays: (): Promise<DisplayInfo[]> => ipcRenderer.invoke('desktop:get-displays'),
  /** Resizes the frameless recorder window to fit its dock content. */
  setRecorderWindowSize: (size: { width: number; height: number }): void => ipcRenderer.send('recorder:set-size', size),
  getDshowDevices: (): Promise<{ video: DshowDevice[]; audio: DshowDevice[] }> =>
    ipcRenderer.invoke('desktop:get-dshow-devices'),

  onRecordingStarted: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('recording-started', listener)
    return () => {
      ipcRenderer.removeListener('recording-started', listener)
    }
  },

  /**
   * The cursor helper captured, but could not read button events from the input
   * devices (a udev/input-group permission gap). The message explains the fix.
   */
  onCursorClicksOff: (callback: (message: string) => void) => {
    const listener = (_event: IpcRendererEvent, message: string) => callback(message)
    ipcRenderer.on('recorder:cursor-clicks-off', listener)
    return () => {
      ipcRenderer.removeListener('recorder:cursor-clicks-off', listener)
    }
  },

  /**
   * The cursor helper IS reading buttons, but on Wayland a light tap is a
   * gesture and never becomes a recorded click. The message explains pressing.
   */
  onCursorClicksHint: (callback: (message: string) => void) => {
    const listener = (_event: IpcRendererEvent, message: string) => callback(message)
    ipcRenderer.on('recorder:cursor-clicks-hint', listener)
    return () => {
      ipcRenderer.removeListener('recorder:cursor-clicks-hint', listener)
    }
  },

  onRecordingFinished: (callback: (result: RecordingResult) => void) => {
    const listener = (_event: IpcRendererEvent, result: RecordingResult) => callback(result)
    ipcRenderer.on('recording-finished', listener)

    return () => {
      ipcRenderer.removeListener('recording-finished', listener)
    }
  },
  // Fired by the global start shortcut in the main process; tells the recorder
  // to run its own start flow with the current UI selections.
  onTriggerStart: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('recorder:trigger-start', listener)

    return () => {
      ipcRenderer.removeListener('recorder:trigger-start', listener)
    }
  },
  onReleaseWebcamRequest: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('recorder:release-webcam', listener)
    return () => ipcRenderer.removeListener('recorder:release-webcam', listener)
  },
  sendWebcamReleasedConfirmation: () => ipcRenderer.send('recorder:webcam-released'),

  // --- Editor window ---
  onProjectOpen: (callback: (payload: ProjectPayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload: ProjectPayload) => callback(payload)
    ipcRenderer.on('project:open', listener)

    return () => {
      ipcRenderer.removeListener('project:open', listener)
    }
  },

  // --- Project files (.dthat) ---
  saveProject: (request: {
    project: unknown
    path?: string | null
    auto?: boolean
  }): Promise<{ canceled: boolean; path?: string; recovery?: boolean }> => ipcRenderer.invoke('project:save', request),
  saveProjectAs: (project: unknown): Promise<{ canceled: boolean; path?: string; recovery?: boolean }> =>
    ipcRenderer.invoke('project:save-as', project),
  /** Writes a snapshot to a new file without adopting it as the edited project. */
  saveProjectCopy: (request: {
    project: unknown
    suggestedName?: string
  }): Promise<{ canceled: boolean; path?: string; error?: string }> => ipcRenderer.invoke('project:save-copy', request),
  /** Renames the `.dthat` in place; the renderer repoints the session. */
  renameProject: (request: {
    currentPath: string
    newName: string
  }): Promise<{ ok: boolean; path?: string; error?: string }> => ipcRenderer.invoke('project:rename', request),
  openProjectFile: (options?: {
    path?: string
    /** Quiet: no native dialogs (a missing recent entry is reported, not shouted). */
    quiet?: boolean
  }): Promise<{
    canceled: boolean
    project?: unknown
    manifest?: unknown
    projectPath?: string
    error?: string
    /** True when a path was given but no file is there any more. */
    missing?: boolean
  }> => ipcRenderer.invoke('project:load', options),
  setProjectDirty: (dirty: boolean): void => ipcRenderer.send('project:set-dirty', dirty),
  // --- Session guard: main asks whether the current project may be replaced ---
  onBeforeReplace: (
    callback: (payload: { requestId: string; reason: 'open' | 'close' | 'quit' }) => void,
  ): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: { requestId: string; reason: 'open' | 'close' | 'quit' }) =>
      callback(payload)
    ipcRenderer.on('project:before-replace', listener)
    return () => ipcRenderer.removeListener('project:before-replace', listener)
  },
  settleBeforeReplace: (payload: { requestId: string; verdict: unknown }): void =>
    ipcRenderer.send('project:before-replace-result', payload),
  /** Main asks the renderer to run a save it cannot perform itself. */
  onPerformSave: (callback: (payload: { requestId: string }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: { requestId: string }) => callback(payload)
    ipcRenderer.on('project:perform-save', listener)
    return () => ipcRenderer.removeListener('project:perform-save', listener)
  },
  settlePerformSave: (payload: { requestId: string; ok: boolean }): void =>
    ipcRenderer.send('project:perform-save-result', payload),
  /** Opens the project file picker (used by the recorder window). */
  promptOpenProject: (): Promise<{ opened: boolean }> => ipcRenderer.invoke('project:prompt-open'),
  /** Whether a crash-recovery copy exists, and when it was written. */
  getRecoveryInfo: (): Promise<{ exists: boolean; modifiedAt: number | null }> =>
    ipcRenderer.invoke('project:recovery-info'),
  /**
   * Opens the recovery copy for an UNSAVED session. The returned projectPath is
   * empty on purpose, so it never becomes the file autosave writes to.
   */
  openRecoveryCopy: (): Promise<{
    canceled: boolean
    project?: unknown
    manifest?: unknown
    projectPath?: string
    recovered?: boolean
    error?: string
  }> => ipcRenderer.invoke('project:open-recovery'),
  /** Removes the recovery copy once its work has been saved for real. */
  discardRecoveryCopy: (): Promise<{ removed: boolean }> => ipcRenderer.invoke('project:recovery-discard'),
  // Fired when a project opened from the OS (file association / CLI) is ready.
  onProjectApply: (
    callback: (payload: { project: unknown; manifest: unknown; projectPath: string; projectDir: string }) => void,
  ) => {
    const listener = (_event: IpcRendererEvent, payload: any) => callback(payload)
    ipcRenderer.on('project:apply', listener)

    return () => {
      ipcRenderer.removeListener('project:apply', listener)
    }
  },
  // Menu items in the main process forward their command here.
  onMenuCommand: (callback: (command: 'save' | 'save-copy' | 'open') => void) => {
    const listener = (_event: IpcRendererEvent, command: 'save' | 'save-copy' | 'open') => callback(command)
    ipcRenderer.on('menu:command', listener)

    return () => {
      ipcRenderer.removeListener('menu:command', listener)
    }
  },

  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke('fs:readFile', filePath),

  // --- Export ---
  startExport: (payload: ExportPayload): Promise<void> => ipcRenderer.invoke('export:start', payload),
  cancelExport: (): void => ipcRenderer.send('export:cancel'),
  cloudStatus: () => ipcRenderer.invoke('cloud:status'),
  setCloudConsent: (accepted: boolean) => ipcRenderer.invoke('cloud:consent', accepted),
  cloudFallback: (payload: unknown) => ipcRenderer.invoke('cloud:fallback', payload),
  cloudRetry: (payload: unknown) => ipcRenderer.invoke('cloud:retry', payload),
  cancelCloudRetry: (): void => ipcRenderer.send('cloud:cancel'),
  /** Pricing table for the credit estimates and the pack notes. */
  getCloudCapabilities: (): Promise<{
    capabilities: { creditsPerFrame?: Record<string, number>; minChargeCredits?: number; targets?: string[] } | null
    error: string | null
  }> => ipcRenderer.invoke('cloud:capabilities'),
  /** A cloud job that outlived the last session, if there is one. */
  getActiveCloudJob: (): Promise<{ jobId: string; outputPath: string } | null> =>
    ipcRenderer.invoke('cloud:active-job'),
  /** Keeps watching that job and downloads its result. */
  resumeCloudWatch: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('cloud:resume-watch'),
  forgetCloudJob: (): Promise<{ forgotten: boolean }> => ipcRenderer.invoke('cloud:forget-job'),
  /** Encoders the bundled FFmpeg has (a missing libx265 disables the 8K option). */
  getExportCapabilities: (): Promise<{ libx265: boolean; hevcEncoders: string[] }> =>
    ipcRenderer.invoke('export:capabilities'),
  /** Local Pro state and credit balance. */
  getEntitlement: (): Promise<{ pro: boolean; credits: number }> => ipcRenderer.invoke('entitlement:get'),

  // --- License, credits and devices ---
  /** Plan, balance and devices for the header capsule and the Devices dialog. */
  getLicenseSummary: (): Promise<LicenseSummary> => ipcRenderer.invoke('license:summary'),
  /** Activates this device against a key; failures carry a friendly message. */
  activateLicense: (licenseKey: string): Promise<ActivationResult> =>
    ipcRenderer.invoke('license:activate', licenseKey),
  listLicenseDevices: (): Promise<DeviceView[]> => ipcRenderer.invoke('license:devices'),
  deactivateLicenseDevice: (deviceId: string): Promise<DeactivationResult> =>
    ipcRenderer.invoke('license:deactivate', deviceId),

  // --- Purchases (checkout + poll) ---
  /** Starts checkout for a product id; the main process opens the browser. */
  startCheckout: (productId: string): Promise<CheckoutStartResult> => ipcRenderer.invoke('checkout:start', productId),
  /** Whether a purchase is still pending from an earlier session. */
  getCheckoutStatus: (): Promise<{ pending: boolean; watching: boolean }> => ipcRenderer.invoke('checkout:status'),
  /** Starts watching a pending purchase again. */
  resumeCheckout: (): Promise<{ pending: boolean }> => ipcRenderer.invoke('checkout:resume'),
  /** Drops the pending purchase record. */
  forgetCheckout: (): Promise<{ forgotten: boolean }> => ipcRenderer.invoke('checkout:forget'),
  /** Stops waiting without cancelling the payment itself. */
  cancelCheckout: (): void => ipcRenderer.send('checkout:cancel'),
  /** The catalogue (GET /v1/products); null means "use the offline fallback". */
  listProducts: (): Promise<{ products: Product[] | null; error: string | null }> =>
    ipcRenderer.invoke('products:list'),
  onCheckoutStatus: (callback: (event: PurchaseEvent) => void) => {
    const listener = (_event: IpcRendererEvent, payload: PurchaseEvent) => callback(payload)
    ipcRenderer.on('checkout:status', listener)
    return () => {
      ipcRenderer.removeListener('checkout:status', listener)
    }
  },
  /** Measured export throughput for the render-time estimates. */
  getExportPerfSamples: (): Promise<
    Array<{
      resolution: string
      codec: 'h264' | 'hevc'
      settingFps: number
      width: number
      height: number
      throughput: number
    }>
  > => ipcRenderer.invoke('export:perf'),

  onExportProgress: (callback: (payload: ProgressPayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload: ProgressPayload) => callback(payload)
    ipcRenderer.on('export:progress', listener)
    return () => ipcRenderer.removeListener('export:progress', listener)
  },

  onExportComplete: (callback: (payload: CompletePayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload: CompletePayload) => callback(payload)
    ipcRenderer.on('export:complete', listener)
    return () => ipcRenderer.removeListener('export:complete', listener)
  },

  // --- Cloud transcription ---
  /** Whether this device can transcribe, and the price and limits the server publishes. */
  transcribeStatus: (): Promise<{
    configured: boolean
    transcription: { enabled?: boolean; creditsPerMinute?: number; models?: string[]; maxAudioSeconds?: number } | null
    error: string | null
  }> => ipcRenderer.invoke('transcribe:status'),

  /**
   * Extract the recording's audio, transcribe it in the cloud and write the
   * transcript. Resolves when the run is over; progress arrives on
   * `onTranscribeProgress` meanwhile.
   */
  startTranscription: (request: {
    sourcePath: string
    /** Omitted: the transcript belongs to the project, and the file is temporary. */
    transcriptPath?: string
    language?: string
    model?: string
  }): Promise<
    | { ok: true; transcriptPath: string; transcript: unknown; charge: number; refund: number; audioSeconds: number }
    | {
        ok: false
        reason: 'canceled' | 'failed' | 'rejected'
        error: string
        charge?: number
        refund?: number
        cost?: number
      }
  > => ipcRenderer.invoke('transcribe:start', request),

  cancelTranscription: (): void => ipcRenderer.send('transcribe:cancel'),

  // --- Instant publishing (share links, landing pages, embeds) ---
  /** Whether this device can publish, and the prices and terms the server offers. */
  publishStatus: (): Promise<{
    configured: boolean
    pro: boolean
    publishing: PublishCapabilities | null
    error: string | null
  }> => ipcRenderer.invoke('publish:status'),

  /**
   * Publish a rendered video, then resolve when it is live. Progress arrives on
   * `onPublishProgress` meanwhile. Nothing is charged until the upload has landed.
   */
  startPublish: (request: {
    filePath: string
    kind: PublicationKind
    storageDays: number
    title?: string
    durationSec?: number
    captions?: { id: string; start: number; end: number; text: string }[]
  }): Promise<
    | { ok: true; publication: PublicationView; captionsIncluded: boolean }
    | { ok: false; reason: 'canceled' | 'failed' | 'rejected'; error: string; cost?: number; balance?: number }
  > => ipcRenderer.invoke('publish:start', request),

  cancelPublish: (): void => ipcRenderer.send('publish:cancel'),

  /** The size of the file a publication would carry, for the price quote. */
  probePublishFile: (filePath: string): Promise<{ ok: true; sizeBytes: number } | { ok: false; error: string }> =>
    ipcRenderer.invoke('publish:probe', { filePath }),

  /** Everything this license has published, newest last. */
  listPublications: (): Promise<{ ok: true; publications: PublicationView[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('publish:list'),

  /** Delete a publication. The bytes go at once; the credits are not returned. */
  deletePublication: (
    publicationId: string,
  ): Promise<{ ok: true; publication: PublicationView; creditsRefunded: number } | { ok: false; error: string }> =>
    ipcRenderer.invoke('publish:delete', { publicationId }),

  /** Who watched a publication, from where, and for how long. */
  publicationAnalytics: (
    publicationId: string,
    range: PublicationAnalyticsRange = '30d',
  ): Promise<{ ok: true; analytics: PublicationAnalytics } | { ok: false; error: string }> =>
    ipcRenderer.invoke('publish:analytics', { publicationId, range }),

  onPublishProgress: (callback: (payload: { stage: string; stagePercent: number; estimatedCost?: number }) => void) => {
    const listener = (_event: IpcRendererEvent, payload: any) => callback(payload)
    ipcRenderer.on('publish:progress', listener)
    return () => ipcRenderer.removeListener('publish:progress', listener)
  },

  onPublishComplete: (
    callback: (payload: {
      success: boolean
      publication?: unknown
      captionsIncluded?: boolean
      error?: string
      reason?: string
      cost?: number
      balance?: number
    }) => void,
  ) => {
    const listener = (_event: IpcRendererEvent, payload: any) => callback(payload)
    ipcRenderer.on('publish:complete', listener)
    return () => ipcRenderer.removeListener('publish:complete', listener)
  },

  // --- The preview's audio tracks ---
  /**
   * Extract the recording's tracks into files the preview can play, one per track.
   * Tracks that could not be extracted are absent from the result.
   */
  extractAudioTracks: (request: {
    filePath: string
    tracks: { id: string; kind: string; index: number; label: string; volume: number; muted: boolean }[]
  }): Promise<{ tracks: { id: string; index: number; url: string }[] }> =>
    ipcRenderer.invoke('audio:extractTracks', request),

  onTranscribeProgress: (
    callback: (payload: {
      stage: string
      stagePercent: number
      reserved?: number
      consumed?: number
      audioSeconds?: number
      audioSecondsDone?: number
      etaSeconds?: number | null
    }) => void,
  ) => {
    const listener = (_event: IpcRendererEvent, payload: any) => callback(payload)
    ipcRenderer.on('transcribe:progress', listener)
    return () => ipcRenderer.removeListener('transcribe:progress', listener)
  },

  onTranscribeComplete: (
    callback: (payload: {
      success: boolean
      transcriptPath?: string
      error?: string
      reason?: string
      charge?: number
      refund?: number
      cost?: number
      audioSeconds?: number
    }) => void,
  ) => {
    const listener = (_event: IpcRendererEvent, payload: any) => callback(payload)
    ipcRenderer.on('transcribe:complete', listener)
    return () => ipcRenderer.removeListener('transcribe:complete', listener)
  },

  openAudioFile: (): Promise<{ canceled: boolean; filePath?: string; fileName?: string }> =>
    ipcRenderer.invoke('dialog:openAudioFile'),
  openVideoFiles: (): Promise<{ canceled: boolean; files?: { filePath: string; fileName: string }[] }> =>
    ipcRenderer.invoke('dialog:openVideoFiles'),
  detectSilence: (videoPath: string): Promise<{ start: number; end: number; duration: number }[]> =>
    ipcRenderer.invoke('video:detectSilence', videoPath),
  /**
   * How much the picture changed, second by second, for the auto-speed detector. A
   * file that cannot be measured yields no samples rather than an error.
   */
  detectActivity: (videoPath: string): Promise<{ time: number; activity: number }[]> =>
    ipcRenderer.invoke('video:detectActivity', videoPath),

  showSaveDialog: (options: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> => {
    return ipcRenderer.invoke('dialog:showSaveDialog', options)
  },

  showMessageBox: (options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> => {
    return ipcRenderer.invoke('dialog:showMessageBox', options)
  },

  checkScreenRecordingPermission: (): Promise<'granted' | 'denied' | 'not-determined'> => {
    return ipcRenderer.invoke('permission:check-screen-recording')
  },

  showItemInFolder: (path: string): void => ipcRenderer.send('shell:showItemInFolder', path),

  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
    const listener = (_event: IpcRendererEvent, info: UpdateInfo) => callback(info)
    ipcRenderer.on('update:available', listener)
    return () => {
      ipcRenderer.removeListener('update:available', listener)
    }
  },
  openExternal: (url: string): void => ipcRenderer.send('shell:openExternal', url),

  // --- Render Worker ---
  onRenderStart: (callback: (payload: RenderStartPayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload: RenderStartPayload) => callback(payload)
    ipcRenderer.on('render:start', listener)
    return () => ipcRenderer.removeListener('render:start', listener)
  },
  rendererReady: () => {
    ipcRenderer.send('render:ready')
  },
  sendFrameToMain: (payload: { frame: Uint8Array; progress: number }): Promise<{ aborted: boolean }> =>
    ipcRenderer.invoke('export:frame-data', payload),
  finishRender: () => {
    ipcRenderer.send('export:render-finished')
  },

  // --- Presets & Settings ---
  loadPresets: (): Promise<Record<string, Preset>> => ipcRenderer.invoke('presets:load'),
  savePresets: (presets: Record<string, Preset>): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('presets:save', presets),
  getSetting: <T = any>(key: string): Promise<T> => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: unknown): void => ipcRenderer.send('settings:set', key, value),
  getPath: (name: 'home' | 'userData' | 'desktop'): Promise<string> => ipcRenderer.invoke('app:getPath', name),
  getCursorThemes: (): Promise<string[]> => ipcRenderer.invoke('desktop:get-cursor-themes'),
  loadCursorTheme: (themeName?: string): Promise<CursorTheme | null> =>
    ipcRenderer.invoke('desktop:load-cursor-theme', themeName),
  mapCursorNameToIDC: (name: string): Promise<string> => ipcRenderer.invoke('desktop:map-cursor-name-to-idc', name),

  // --- Window Controls ---
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  recorderClickThrough: () => ipcRenderer.send('recorder:click-through'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  onWindowStateChange: (callback: (payload: { isMaximized: boolean }) => void) => {
    const listener = (_event: IpcRendererEvent, payload: { isMaximized: boolean }) => callback(payload)
    ipcRenderer.on('window:state-changed', listener)
    return () => {
      ipcRenderer.removeListener('window:state-changed', listener)
    }
  },
  // --- START OF CHANGES ---
  updateTitleBarOverlay: (options: { color: string; symbolColor: string }) => {
    ipcRenderer.send('window:update-title-bar-overlay', options)
  },
  // --- END OF CHANGES ---
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('app:getPlatform'),
  /**
   * Display-server facts: whether the app is on Wayland, and which capture
   * backend the recorder will use because of it.
   */
  getSessionInfo: (): Promise<SessionSummary> => ipcRenderer.invoke('app:getSessionInfo'),
  getVideoFrame: (options: { videoPath: string; time: number }): Promise<string> =>
    ipcRenderer.invoke('video:get-frame', options),
  videoHasAudio: (videoPath: string): Promise<boolean> => ipcRenderer.invoke('video:has-audio', videoPath),
  /**
   * Renderer-side diagnostics land in the MAIN process log: the packaged app
   * has no console to read, so media-load failures and stalls are otherwise
   * invisible. Reported failures carry the details needed to tell a protocol
   * problem from a decoder problem at a distance.
   */
  logDiagnostic: (scope: string, message: string): void => ipcRenderer.send('diagnostic:log', scope, message),
  captureDiagnostic: (): Promise<{ min: number; max: number; width: number; height: number } | null> =>
    ipcRenderer.invoke('diagnostic:capture'),
  gpuDiagnostic: (): Promise<Record<string, string> | null> => ipcRenderer.invoke('diagnostic:gpu'),
}

// Expose API safely
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Also need to define types for TypeScript in renderer
declare global {
  interface Window {
    electronAPI: typeof electronAPI
  }
}
