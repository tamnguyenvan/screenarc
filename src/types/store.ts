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
  cursorScale?: number; // ADDED
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
  cursorImageKey: string;
}

export interface CursorImage {
  width: number;
  height: number;
  xhot: number;
  yhot: number;
  image: number[];
  imageData?: ImageData;
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
}

export type RecordingGeometry = { x: number, y: number, width: number, height: number };
export type ScreenSize = { width: number, height: number };


// --- State ---
export interface EditorState {
  videoPath: string | null;
  metadataPath: string | null;
  videoUrl: string | null;
  videoDimensions: { width: number; height: number };
  recordingGeometry: RecordingGeometry | null;
  screenSize: ScreenSize | null;
  canvasDimensions: { width: number, height: number };
  metadata: MetaDataItem[];
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  frameStyles: FrameStyles;
  aspectRatio: AspectRatio;
  zoomRegions: Record<string, ZoomRegion>;
  cutRegions: Record<string, CutRegion>;
  previewCutRegion: CutRegion | null;
  selectedRegionId: string | null;
  activeZoomRegionId: string | null;
  isCurrentlyCut: boolean;
  theme: 'light' | 'dark';
  timelineZoom: number;
  presets: Record<string, Preset>;
  activePresetId: string | null;
  presetSaveStatus: 'idle' | 'saving' | 'saved';
  isPreviewFullScreen: boolean;
  cursorImages: Record<string, CursorImage>;
  cursorScale: number;
  syncOffset: number;

  // webcam
  webcamVideoPath: string | null;
  webcamVideoUrl: string | null;
  isWebcamVisible: boolean;
  webcamPosition: WebcamPosition;
  webcamStyles: WebcamStyles;
}