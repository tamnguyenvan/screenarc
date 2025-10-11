import type {
  ProjectState, ProjectActions, Slice, RecordingGeometry,
  VideoDimensions, CursorTheme, CursorImageBitmap
} from '../../types';
import type { MetaDataItem, ZoomRegion, CursorFrame } from '../../types';
import { ZOOM } from '../../lib/constants';
import { initialFrameState, recalculateCanvasDimensions } from './frameSlice';
import { prepareCursorBitmaps } from '../../lib/utils';

export const initialProjectState: ProjectState = {
  videoPath: null,
  metadataPath: null,
  videoUrl: null,
  videoDimensions: { width: 0, height: 0 },
  recordingGeometry: null,
  screenSize: null,
  canvasDimensions: { width: 0, height: 0 },
  metadata: [],
  duration: 0,
  cursorImages: {},
  cursorBitmapsToRender: new Map<string, CursorImageBitmap>(),
  syncOffset: 0,
  platform: null,
  cursorTheme: null,
};

/**
 * Generates automatic zoom regions based on click events from metadata.
 * @param metadata - The array of mouse events.
 * @param videoDimensions - The dimensions of the video.
 * @returns A record of new ZoomRegion objects.
 */
function generateAutoZoomRegions(
  metadata: MetaDataItem[],
  recordingGeometry: RecordingGeometry,
  videoDimensions: VideoDimensions
): Record<string, ZoomRegion> {
  const clicks = metadata.filter(item => item.type === 'click' && item.pressed);
  if (clicks.length === 0) return {};

  const mergedClickGroups: MetaDataItem[][] = [];
  if (clicks.length > 0) {
    let currentGroup = [clicks[0]];
    for (let i = 1; i < clicks.length; i++) {
      if (clicks[i].timestamp - currentGroup[currentGroup.length - 1].timestamp < ZOOM.AUTO_ZOOM_MIN_DURATION) {
        currentGroup.push(clicks[i]);
      } else {
        mergedClickGroups.push(currentGroup);
        currentGroup = [clicks[i]];
      }
    }
    mergedClickGroups.push(currentGroup);
  }

  const geometry = recordingGeometry || videoDimensions;

  return mergedClickGroups.reduce((acc, group, index) => {
    const firstClick = group[0];
    const lastClick = group[group.length - 1];

    const startTime = Math.max(0, firstClick.timestamp - ZOOM.AUTO_ZOOM_PRE_CLICK_OFFSET);
    const endTime = lastClick.timestamp + ZOOM.AUTO_ZOOM_POST_CLICK_PADDING;
    let duration = endTime - startTime;
    if (duration < ZOOM.AUTO_ZOOM_MIN_DURATION) {
      duration = ZOOM.AUTO_ZOOM_MIN_DURATION;
    }

    const id = `auto-zoom-${Date.now()}-${index}`;
    acc[id] = {
      id,
      type: 'zoom',
      startTime,
      duration,
      zoomLevel: ZOOM.DEFAULT_LEVEL,
      easing: ZOOM.DEFAULT_EASING,
      transitionDuration: ZOOM.SPEED_OPTIONS[ZOOM.DEFAULT_SPEED as keyof typeof ZOOM.SPEED_OPTIONS],
      targetX: (firstClick.x / geometry.width) - 0.5,
      targetY: (firstClick.y / geometry.height) - 0.5,
      mode: 'auto',
      zIndex: 0,
    };
    return acc;
  }, {} as Record<string, ZoomRegion>);
}

async function prepareWindowsCursorBitmaps(theme: CursorTheme, scale: number): Promise<Map<string, CursorImageBitmap>> {
  const bitmapMap = new Map<string, CursorImageBitmap>();
  const cursorSet = theme[scale];
  if (!cursorSet) {
    console.warn(`[prepareWindowsCursorBitmaps] No cursor set found for scale ${scale}x`);
    return bitmapMap;
  }

  const processingPromises: Promise<void>[] = [];

  for (const cursorThemeName in cursorSet) {
    const frames = cursorSet[cursorThemeName];
    
    processingPromises.push(
      (async () => {
        const idcName = await window.electronAPI.mapCpackNameToIDC(cursorThemeName);
        for (let i = 0; i < frames.length; i++) {
          const frame = frames[i] as CursorFrame; // Cast to fix Buffer type issue
          if (frame.rgba && frame.width > 0 && frame.height > 0) {
            try {
              // The data from main process is an object, not a Buffer. Convert it.
              const buffer = new Uint8ClampedArray(Object.values(frame.rgba));
              const imageData = new ImageData(buffer, frame.width, frame.height);
              const bitmap = await createImageBitmap(imageData);
              const key = `${idcName}-${i}`;
              bitmapMap.set(key, { ...frame, imageBitmap: bitmap });
            } catch (e) {
              console.error(`Failed to create bitmap for ${idcName}-${i}`, e);
            }
          }
        }
      })()
    );
  }
  
  await Promise.all(processingPromises);
  return bitmapMap;
}


export const createProjectSlice: Slice<ProjectState, ProjectActions> = (set, get) => ({
  ...initialProjectState,
  loadProject: async ({ videoPath, metadataPath, webcamVideoPath }) => {
    const videoUrl = `media://${videoPath}`;
    const webcamVideoUrl = webcamVideoPath ? `media://${webcamVideoPath}` : null;
    
    get().resetProjectState(); // Clear previous project data first
    
    const activePresetId = get().activePresetId;
    const presets = get().presets;
    const presetToApply = (activePresetId && presets[activePresetId]) || Object.values(presets).find(p => p.isDefault);

    set(state => {
      if (presetToApply) {
        state.frameStyles = JSON.parse(JSON.stringify(presetToApply.styles));
        state.aspectRatio = presetToApply.aspectRatio;
      } else {
        state.frameStyles = initialFrameState.frameStyles;
      }
      state.videoPath = videoPath;
      state.metadataPath = metadataPath;
      state.videoUrl = videoUrl;
      state.webcamVideoPath = webcamVideoPath || null;
      state.webcamVideoUrl = webcamVideoUrl;
      state.isWebcamVisible = !!webcamVideoUrl;
    });

    try {
      const metadataContent = await window.electronAPI.readFile(metadataPath);
      const parsedData = JSON.parse(metadataContent);

      const processedMetadata = (parsedData.events || []).map((item: MetaDataItem) => ({
        ...item,
        timestamp: item.timestamp / 1000,
      }));
      
      const newZoomRegions = generateAutoZoomRegions(processedMetadata, parsedData.geometry, get().videoDimensions);
      
      const platform = (await window.electronAPI.getPlatform()) || 'win32';
      set(state => {
        state.platform = platform;
        state.metadata = processedMetadata;
        state.recordingGeometry = parsedData.geometry || null;
        state.screenSize = parsedData.screenSize || null;
        state.syncOffset = parsedData.syncOffset || 0;
        state.zoomRegions = newZoomRegions;
        recalculateCanvasDimensions(state);
      });

      if (platform === 'win32') {
        // Load cursor theme and prepare cursor bitmaps to for renderer
        const cursorTheme = await window.electronAPI.loadCursorTheme();
        if (cursorTheme) {
            // Load the saved scale from settings, or default to 2x.
            const scale = await window.electronAPI.getSetting<number>('recorder.cursorScale') || 2;
            const bitmaps = await prepareWindowsCursorBitmaps(cursorTheme, scale);

            set(state => {
              state.cursorTheme = cursorTheme;
              state.cursorBitmapsToRender = bitmaps;
            });
        }
      } else {
        const bitmaps = await prepareCursorBitmaps(parsedData.cursorImages);
        set(state => {
          state.cursorImages = parsedData.cursorImages || {};
          state.cursorBitmapsToRender = bitmaps;
        });
      }
    } catch (error) {
      console.error("Failed to process metadata file:", error);
    }
  },
  setVideoDimensions: (dims) => set(state => {
    state.videoDimensions = dims;
    if (!state.recordingGeometry) {
      state.recordingGeometry = { x: 0, y: 0, width: dims.width, height: dims.height };
    }
    if (!state.screenSize) {
      state.screenSize = { width: dims.width, height: dims.height };
    }
    recalculateCanvasDimensions(state);
  }),
  setDuration: (duration) => set(state => {
    state.duration = duration;
    Object.values({ ...state.zoomRegions, ...state.cutRegions }).forEach(region => {
      if (region.startTime + region.duration > duration) {
        region.duration = Math.max(0.1, duration - region.startTime);
      }
    });
  }),
  resetProjectState: () => {
    set(state => {
      Object.assign(state, initialProjectState);
      state.zoomRegions = {};
      state.cutRegions = {};
      state.selectedRegionId = null;
      state.activeZoomRegionId = null;
      state.isCurrentlyCut = false;
      state.currentTime = 0;
      state.isPlaying = false;
    });
  },
  setWindowsCursorScale: async (scale) => {
    const theme = get().cursorTheme;
    if (!theme) return;
    
    // Set loading state if needed
    set(state => {
      state.cursorBitmapsToRender = new Map(); // Clear old bitmaps
    });
    
    // Persist setting
    window.electronAPI.setSetting('recorder.cursorScale', scale);
    
    // Regenerate bitmaps
    const bitmaps = await prepareWindowsCursorBitmaps(theme, scale);
    set(state => { state.cursorBitmapsToRender = bitmaps; });
  },
});