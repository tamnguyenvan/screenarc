// --- Types ---
export type BackgroundType = 'color' | 'gradient' | 'image' | 'wallpaper';
export type AspectRatio = '16:9' | '9:16' | '4:3' | '3:4' | '1:1';

export interface Background {
  type: BackgroundType;
  color?: string;
  gradientStart?: string;
  gradientEnd?: string;
  gradientDirection?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
}

export interface FrameStyles {
  padding: number;
  background: Background;
  borderRadius: number;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowColor: string;
  borderWidth: number;
  borderColor: string;
}

export interface Preset {
  id: string;
  name: string;
  styles: FrameStyles;
  aspectRatio: AspectRatio;
  isDefault?: boolean;
  webcamStyles?: WebcamStyles;
  webcamPosition?: WebcamPosition;
  isWebcamVisible?: boolean;
}

export interface ZoomRegion {
  id: string;
  type: 'zoom';
  startTime: number;
  duration: number;
  zoomLevel: number;
  easing: string; // Changed from 'linear' | 'ease-in-out'
  transitionDuration: number; // New property for speed
  targetX: number;
  targetY: number;
  mode: 'auto' | 'fixed';
  zIndex: number;
}

export interface CutRegion {
  id: string;
  type: 'cut';
  startTime: number;
  duration: number;
  trimType?: 'start' | 'end';
  zIndex: number;
}

export type TimelineRegion = ZoomRegion | CutRegion;

export interface MetaDataItem {
  timestamp: number;
  x: number;
  y: number;
  type: 'click' | 'move' | 'scroll';
  button?: string;
  pressed?: boolean;
  cursorImageKey?: string;
}

export interface CursorFrame {
  width: number;
  height: number;
  xhot: number;
  yhot: number;
  delay: number;
  rgba: Buffer;
  hash: string;
}

export interface CursorImageBase {
  width: number;
  height: number;
  xhot: number;
  yhot: number;
}

export interface CursorImage extends CursorImageBase {
  image: number[];
}

export interface CursorImageBitmap extends CursorImageBase {
  imageBitmap: ImageBitmap;
}

export interface WebcamPosition {
  pos: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'left-center' | 'right-center';
}

export interface WebcamStyles {
  shape: 'circle' | 'square' | 'rectangle';
  borderRadius: number;
  size: number;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowColor: string;
  isFlipped: boolean;
}

export type Dimensions = { width: number, height: number };
export type RecordingGeometry = { x: number, y: number, width: number, height: number };
export type VideoDimensions = Dimensions;
export type ScreenSize = Dimensions;
export type CursorTheme = Record<number, Record<string, CursorFrame[]>>;


// --- Slice State & Actions Types ---

export interface ProjectState {
  videoPath: string | null;
  metadataPath: string | null;
  videoUrl: string | null;
  videoDimensions: VideoDimensions;
  recordingGeometry: RecordingGeometry | null;
  screenSize: ScreenSize | null;
  canvasDimensions: Dimensions;
  metadata: MetaDataItem[];
  duration: number;
  cursorImages: Record<string, CursorImage>;
  cursorBitmapsToRender: Map<string, CursorImageBitmap>;
  syncOffset: number;
  platform: NodeJS.Platform | null;
  cursorTheme: CursorTheme | null;
}

export interface ProjectActions {
  loadProject: (paths: { videoPath: string; metadataPath: string; webcamVideoPath?: string }) => Promise<void>;
  setVideoDimensions: (dims: { width: number; height: number }) => void;
  setDuration: (duration: number) => void;
  resetProjectState: () => void;
  setWindowsCursorScale: (scale: number) => Promise<void>;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
}
export interface PlaybackActions {
  setCurrentTime: (time: number) => void;
  togglePlay: () => void;
  setPlaying: (isPlaying: boolean) => void;
  seekToPreviousFrame: () => void;
  seekToNextFrame: () => void;
  seekBackward: (seconds: number) => void;
  seekForward: (seconds: number) => void;
}

export interface FrameState {
  frameStyles: FrameStyles;
  aspectRatio: AspectRatio;
}
export interface FrameActions {
  updateFrameStyle: (style: Partial<Omit<FrameStyles, 'background'>>) => void;
  updateBackground: (bg: Partial<Background>) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
}

export interface TimelineState {
  zoomRegions: Record<string, ZoomRegion>;
  cutRegions: Record<string, CutRegion>;
  previewCutRegion: CutRegion | null;
  selectedRegionId: string | null;
  activeZoomRegionId: string | null;
  isCurrentlyCut: boolean;
  timelineZoom: number;
}
export interface TimelineActions {
  addZoomRegion: () => void;
  addCutRegion: (regionData?: Partial<CutRegion>) => void;
  updateRegion: (id: string, updates: Partial<TimelineRegion>) => void;
  deleteRegion: (id: string) => void;
  setSelectedRegionId: (id: string | null) => void;
  setPreviewCutRegion: (region: CutRegion | null) => void;
  setTimelineZoom: (zoom: number) => void;
  applyAnimationSettingsToAll: (settings: { transitionDuration: number; easing: string; zoomLevel: number }) => void;
}

export interface PresetState {
  presets: Record<string, Preset>;
  activePresetId: string | null;
  presetSaveStatus: 'idle' | 'saving' | 'saved';
}
export interface PresetActions {
  initializePresets: () => Promise<void>;
  applyPreset: (id: string) => void;
  resetPreset: (id: string) => void;
  updatePresetName: (id: string, name: string) => void;
  saveCurrentStyleAsPreset: (name: string) => void;
  updateActivePreset: () => void;
  deletePreset: (id: string) => void;
  _ensureActivePresetIsWritable: () => void;
  _persistPresets: (presets: Record<string, Preset>) => Promise<void>;
}

export interface WebcamState {
  webcamVideoPath: string | null;
  webcamVideoUrl: string | null;
  isWebcamVisible: boolean;
  webcamPosition: WebcamPosition;
  webcamStyles: WebcamStyles;
}
export interface WebcamActions {
  setWebcamPosition: (position: WebcamPosition) => void;
  setWebcamVisibility: (isVisible: boolean) => void;
  updateWebcamStyle: (style: Partial<WebcamStyles>) => void;
}

export interface UIState {
  theme: 'light' | 'dark';
  isPreviewFullScreen: boolean;
}
export interface UIActions {
  toggleTheme: () => void;
  initializeSettings: () => Promise<void>;
  togglePreviewFullScreen: () => void;
}

// Combined state type for the editor store
export type EditorState =
  ProjectState &
  PlaybackState &
  FrameState &
  TimelineState &
  PresetState &
  WebcamState &
  UIState;


// Combined actions type for the editor store
export type EditorActions = 
  & ProjectActions 
  & PlaybackActions 
  & FrameActions 
  & TimelineActions 
  & PresetActions 
  & WebcamActions 
  & UIActions & {
    // Global reset action
    reset: () => void;
  };


// A utility type to create actions for a slice
export type Slice<T extends object, A extends object> = (
  set: (fn: (draft: EditorState) => void) => void,
  get: () => EditorState & EditorActions
) => T & A;