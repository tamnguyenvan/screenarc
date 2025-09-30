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
  shadow: number; // Controls blur and offset strength (0-50)
  shadowColor: string; // New: Hex or RGBA string for shadow color
  borderWidth: number;
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

export interface AnchorPoint {
  time: number;
  x: number; // Normalized coordinates [-0.5, 0.5]
  y: number; // Normalized coordinates [-0.5, 0.5]
}

export interface ZoomRegion {
  id: string;
  type: 'zoom';
  startTime: number;
  duration: number;
  zoomLevel: number;
  easing: 'linear' | 'ease-in-out';
  targetX: number;
  targetY: number;
  mode: 'auto' | 'fixed';
  zIndex: number;
  anchors?: AnchorPoint[];
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
}

export interface WebcamPosition {
  pos: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export interface WebcamStyles {
  size: number; // percentage of container height
  shadow: number; // 0-50 for shadow strength (blur/offset)
  shadowColor: string; // New: Hex or RGBA string for webcam shadow color
}


// --- State ---
export interface EditorState {
  videoPath: string | null;
  metadataPath: string | null;
  videoUrl: string | null;
  videoDimensions: { width: number; height: number };
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

  // webcam
  webcamVideoPath: string | null;
  webcamVideoUrl: string | null;
  isWebcamVisible: boolean;
  webcamPosition: WebcamPosition;
  webcamStyles: WebcamStyles;
}