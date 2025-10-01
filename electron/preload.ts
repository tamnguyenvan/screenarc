import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// Define the type for the callback value
type RecordingResult = {
  canceled: boolean;
  filePath: string | undefined;
}

type ProjectPayload = {
  videoPath: string;
  metadataPath: string;
  webcamVideoPath?: string;
}

type ExportPayload = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectState: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exportSettings: any;
  outputPath: string;
}
// Payload received from process
type ProgressPayload = {
  progress: number; // 0-100
  stage: string;
}
// Payload when completed
type CompletePayload = {
  success: boolean;
  outputPath?: string;
  error?: string;
}

// Payload for worker render
type RenderStartPayload = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectState: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exportSettings: any;
}

type WindowSource = {
  id: string;
  name: string;
  thumbnailUrl: string;
  geometry?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// --- Presets ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Preset = any;

type DisplayInfo = {
  id: number;
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
}

// --- Update ---
type UpdateInfo = {
  version: string;
  url: string;
};

// Define API to be exposed to window object
export const electronAPI = {
  // --- Recording ---
  startRecording: (options: { 
    source: 'area' | 'fullscreen' | 'window', 
    geometry?: WindowSource['geometry'];
    windowTitle?: string; 
    displayId?: number,
    webcam?: { deviceId: string; deviceLabel: string; index: number; ffmpegInput: string };
    mic?: { deviceId: string; deviceLabel: string; index: number; ffmpegInput: string };
  }): Promise<RecordingResult> => ipcRenderer.invoke('recording:start', options),
  getCursorScale: (): Promise<number> => ipcRenderer.invoke('desktop:get-cursor-scale'),
  setCursorScale: (scale: number): void => ipcRenderer.send('desktop:set-cursor-scale', scale),

  getDisplays: (): Promise<DisplayInfo[]> => ipcRenderer.invoke('desktop:get-displays'),
  getMediaDevices: (): Promise<{ 
    webcams: { label: string, ffmpegInput: string }[], 
    mics: { label: string, ffmpegInput: string }[] 
  }> => ipcRenderer.invoke('desktop:get-media-devices'),
  getWebcams: (): Promise<Electron.DesktopCapturerSource[]> => ipcRenderer.invoke('desktop:get-webcams'),

  getDesktopSources: (): Promise<WindowSource[]> => ipcRenderer.invoke('desktop:get-sources'),
  linuxCheckTools: (): Promise<{ [key: string]: boolean }> => ipcRenderer.invoke('linux:check-tools'),

  onRecordingFinished: (callback: (result: RecordingResult) => void) => {
    const listener = (_event: IpcRendererEvent, result: RecordingResult) => callback(result);
    ipcRenderer.on('recording-finished', listener);

    return () => {
      ipcRenderer.removeListener('recording-finished', listener);
    };
  },
  onReleaseWebcamRequest: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('recorder:release-webcam', listener);
    return () => ipcRenderer.removeListener('recorder:release-webcam', listener);
  },
  sendWebcamReleasedConfirmation: () => ipcRenderer.send('recorder:webcam-released'),

  // --- Editor window ---
  onProjectOpen: (callback: (payload: ProjectPayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload: ProjectPayload) => callback(payload);
    ipcRenderer.on('project:open', listener);

    return () => {
      ipcRenderer.removeListener('project:open', listener);
    }
  },

  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke('fs:readFile', filePath),

  // --- Export ---
  startExport: (payload: ExportPayload): Promise<void> => ipcRenderer.invoke('export:start', payload),
  cancelExport: (): void => ipcRenderer.send('export:cancel'),

  onExportProgress: (callback: (payload: ProgressPayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload: ProgressPayload) => callback(payload);
    ipcRenderer.on('export:progress', listener);
    return () => ipcRenderer.removeListener('export:progress', listener);
  },

  onExportComplete: (callback: (payload: CompletePayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload: CompletePayload) => callback(payload);
    ipcRenderer.on('export:complete', listener);
    return () => ipcRenderer.removeListener('export:complete', listener);
  },

  showSaveDialog: (options: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> => {
    return ipcRenderer.invoke('dialog:showSaveDialog', options);
  },

  showItemInFolder: (path: string): void => ipcRenderer.send('shell:showItemInFolder', path),

  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
    const listener = (_event: IpcRendererEvent, info: UpdateInfo) => callback(info);
    ipcRenderer.on('update:available', listener);
    return () => {
      ipcRenderer.removeListener('update:available', listener);
    };
  },
  openExternal: (url: string): void => ipcRenderer.send('shell:openExternal', url),

  // --- Render Worker ---
  onRenderStart: (callback: (payload: RenderStartPayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload: RenderStartPayload) => callback(payload);
    ipcRenderer.on('render:start', listener);
    return () => ipcRenderer.removeListener('render:start', listener);
  },
  rendererReady: () => {
    ipcRenderer.send('render:ready');
  },
  sendFrameToMain: (payload: { frame: Buffer, progress: number }) => {
    ipcRenderer.send('export:frame-data', payload);
  },
  finishRender: () => {
    ipcRenderer.send('export:render-finished');
  },

  // --- Presets ---
  loadPresets: (): Promise<Record<string, Preset>> => ipcRenderer.invoke('presets:load'),
  savePresets: (presets: Record<string, Preset>): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('presets:save', presets),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSetting: <T = any>(key: string): Promise<T> => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: unknown): void => ipcRenderer.send('settings:set', key, value),
  getPath: (name: 'home' | 'userData' | 'desktop'): Promise<string> => ipcRenderer.invoke('app:getPath', name),

  // --- Window Controls ---
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  recorderClickThrough: () => ipcRenderer.send('recorder:click-through'),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('app:getPlatform'),
  getVideoFrame: (options: { videoPath: string; time: number }): Promise<string> => ipcRenderer.invoke('video:get-frame', options),
}

// Expose API safely
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Also need to define types for TypeScript in renderer
declare global {
  interface Window {
    electronAPI: typeof electronAPI
  }
}