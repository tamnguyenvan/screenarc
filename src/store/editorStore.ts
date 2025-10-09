import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/react/shallow';
import { temporal } from 'zundo';
import { WALLPAPERS, APP, TIMELINE, ZOOM } from '../lib/constants';
import { shallow } from 'zustand/shallow';
import {
  AspectRatio, Background, FrameStyles, Preset, ZoomRegion, CutRegion, TimelineRegion,
  EditorState, MetaDataItem, WebcamStyles, CursorImage,
  WebcamPosition,
} from '../types/store';

// --- Constants ---
const DEFAULT_PRESET_STYLES: FrameStyles = {
  padding: 4,
  background: {
    type: 'wallpaper',
    thumbnailUrl: WALLPAPERS[0].thumbnailUrl,
    imageUrl: WALLPAPERS[0].imageUrl,
  },
  borderRadius: 16,
  shadowBlur: 35,
  shadowOffsetX: 0,
  shadowOffsetY: 15,
  shadowColor: 'rgba(0, 0, 0, 0.8)',
  borderWidth: 4,
  borderColor: 'rgba(255, 255, 255, 0.2)',
};

const DEFAULT_PRESET: Omit<Preset, 'id' | 'name'> = {
  styles: DEFAULT_PRESET_STYLES,
  aspectRatio: '16:9',
  isDefault: true,
  cursorScale: 1,
  webcamStyles: {
    shape: 'square',
    borderRadius: 35,
    size: 30,  // percent
    shadowBlur: 20,
    shadowOffsetX: 0,
    shadowOffsetY: 10,
    shadowColor: 'rgba(0, 0, 0, 0.5)',
  },
  webcamPosition: { pos: 'bottom-right' },
  isWebcamVisible: false,
};

const DEFAULT_PRESET_ID = 'default-preset-v1';


// --- Actions ---
export interface EditorActions {
  loadProject: (paths: { videoPath: string; metadataPath: string; webcamVideoPath?: string }) => Promise<void>;
  setVideoDimensions: (dims: { width: number; height: number }) => void;
  setDuration: (duration: number) => void;
  setCurrentTime: (time: number) => void;
  togglePlay: () => void;
  setPlaying: (isPlaying: boolean) => void;
  seekToPreviousFrame: () => void;
  seekToNextFrame: () => void;
  seekBackward: (seconds: number) => void;
  seekForward: (seconds: number) => void;
  updateFrameStyle: (style: Partial<Omit<FrameStyles, 'background'>>) => void;
  updateBackground: (bg: Partial<Background>) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  addZoomRegion: () => void;
  addCutRegion: (regionData?: Partial<CutRegion>) => void;
  updateRegion: (id: string, updates: Partial<TimelineRegion>) => void;
  deleteRegion: (id: string) => void;
  setSelectedRegionId: (id: string | null) => void;
  setPreviewCutRegion: (region: CutRegion | null) => void;
  toggleTheme: () => void;
  setTimelineZoom: (zoom: number) => void;
  setCursorScale: (scale: number) => void;
  reset: () => void;
  _ensureActivePresetIsWritable: () => void;
  initializeSettings: () => Promise<void>;
  initializePresets: () => Promise<void>;
  applyPreset: (id: string) => void;
  resetPreset: (id: string) => void;
  updatePresetName: (id: string, name: string) => void;
  saveCurrentStyleAsPreset: (name: string) => void;
  updateActivePreset: () => void;
  deletePreset: (id: string) => void;
  togglePreviewFullScreen: () => void;
  applyAnimationSettingsToAll: (settings: { transitionDuration: number; easing: string; zoomLevel: number }) => void;

  // webcam
  setWebcamPosition: (position: WebcamPosition) => void;
  setWebcamVisibility: (isVisible: boolean) => void;
  updateWebcamStyle: (style: Partial<WebcamStyles>) => void;
}

// --- Initial State ---
const initialProjectState = {
  videoPath: null,
  metadataPath: null,
  videoUrl: null,
  videoDimensions: { width: 0, height: 0 },
  recordingGeometry: null,
  screenSize: null,
  canvasDimensions: { width: 0, height: 0 },
  metadata: [],
  duration: 0,
  currentTime: 0,
  isPlaying: false,
  aspectRatio: '16:9' as AspectRatio,
  zoomRegions: {},
  cutRegions: {},
  previewCutRegion: null,
  selectedRegionId: null,
  activeZoomRegionId: null,
  isCurrentlyCut: false,
  timelineZoom: 1,
  isPreviewFullScreen: false,
  cursorImages: {},
  cursorScale: 1,
  syncOffset: 0,
  webcamVideoPath: null,
  webcamVideoUrl: null,
  isWebcamVisible: false,
  webcamPosition: { pos: 'bottom-right' } as WebcamPosition,
  webcamStyles: { 
    shape: 'square' as const,
    borderRadius: 35,
    size: 30, 
    shadowBlur: 20, 
    shadowOffsetX: 0,
    shadowOffsetY: 10,
    shadowColor: 'rgba(0, 0, 0, 0.4)' 
  },
};

const initialAppState = {
  theme: 'light' as 'light' | 'dark',
  presets: {},
  activePresetId: null,
  presetSaveStatus: 'idle' as const,
};

const initialFrameStyles: FrameStyles = {
  padding: 5,
  background: {
    type: 'wallpaper',
    thumbnailUrl: WALLPAPERS[0].thumbnailUrl,
    imageUrl: WALLPAPERS[0].imageUrl,
  },
  borderRadius: 16,
  shadowBlur: 35,
  shadowOffsetX: 0,
  shadowOffsetY: 15,
  shadowColor: 'rgba(0, 0, 0, 0.8)',
  borderWidth: 4,
  borderColor: 'rgba(255, 255, 255, 0.2)',
}


// Helper function to persist presets to the main process
const _persistPresets = async (presets: Record<string, Preset>) => {
  try {
    // Temporarily clear the preset save status to avoid race conditions
    useEditorStore.setState({ presetSaveStatus: 'saving' });
    await window.electronAPI.setSetting('presets', presets);
    useEditorStore.setState({ presetSaveStatus: 'saved' });
    setTimeout(() => {
      if (useEditorStore.getState().presetSaveStatus === 'saved') {
        useEditorStore.setState({ presetSaveStatus: 'idle' });
      }
    }, 1500);
  } catch (error) {
    console.error("Failed to save presets:", error);
    useEditorStore.setState({ presetSaveStatus: 'idle' });
  }
};

const recalculateZIndicesOnDraft = (state: EditorState) => {
  const allRegions = [
    ...Object.values(state.zoomRegions),
    ...Object.values(state.cutRegions)
  ];

  allRegions.sort((a, b) => a.duration - b.duration);

  const regionCount = allRegions.length;
  allRegions.forEach((region, index) => {
    const newZIndex = 10 + (regionCount - 1 - index);
    // Directly mutate the draft. Immer handles the immutability.
    if (state.zoomRegions[region.id]) {
      state.zoomRegions[region.id].zIndex = newZIndex;
    } else if (state.cutRegions[region.id]) {
      state.cutRegions[region.id].zIndex = newZIndex;
    }
  });
};

const _recalculateCanvasDimensions = (state: EditorState) => {
  if (!state.screenSize || !state.aspectRatio) {
    state.canvasDimensions = { width: 1920, height: 1080 }; // Fallback
    return;
  }
  const { width: screenWidth, height: screenHeight } = state.screenSize;
  const [ratioW, ratioH] = state.aspectRatio.split(':').map(Number);
  const screenAspectRatio = screenWidth / screenHeight;
  const targetAspectRatio = ratioW / ratioH;

  let canvasWidth, canvasHeight;

  if (targetAspectRatio > screenAspectRatio) {
    // Constrained by width
    canvasWidth = screenWidth;
    canvasHeight = Math.round(screenWidth / targetAspectRatio);
  } else {
    // Constrained by height
    canvasHeight = screenHeight;
    canvasWidth = Math.round(screenHeight * targetAspectRatio);
  }

  // Ensure dimensions are even numbers for video encoders
  state.canvasDimensions = {
    width: canvasWidth % 2 === 0 ? canvasWidth : canvasWidth + 1,
    height: canvasHeight % 2 === 0 ? canvasHeight : canvasHeight + 1,
  };
};

// --- Store Implementation ---
export const useEditorStore = create(
  temporal(
    immer<EditorState & EditorActions>((set, get) => ({
      ...initialProjectState,
      ...initialAppState,
      frameStyles: initialFrameStyles,

      loadProject: async ({ videoPath, metadataPath, webcamVideoPath }) => {
        const videoUrl = `media://${videoPath}`;
        const webcamVideoUrl = webcamVideoPath ? `media://${webcamVideoPath}` : null;
        const activePresetId = get().activePresetId;
        const currentPresets = get().presets;
        const defaultPreset = Object.values(currentPresets).find(p => p.isDefault);

        set(state => {
          Object.assign(state, initialProjectState);
          
          const presetToApply = (activePresetId && currentPresets[activePresetId]) || defaultPreset;

          if (presetToApply) {
            state.frameStyles = JSON.parse(JSON.stringify(presetToApply.styles));
            state.aspectRatio = presetToApply.aspectRatio;
          } else {
            state.frameStyles = initialFrameStyles;
          }

          // Update the new project information
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
          
          const geometry = parsedData.geometry;
          const screenSize = parsedData.screenSize;
          const syncOffset = parsedData.syncOffset || 0; // Read syncOffset

          const processedMetadata = parsedData.events.map((item: MetaDataItem) => ({
            ...item,
            timestamp: item.timestamp / 1000,
            x: item.x, // the location is local already
            y: item.y,
          }));
          
          const processedCursorImages: Record<string, CursorImage> = {};
          for (const key in parsedData.cursorImages) {
            const data = parsedData.cursorImages[key];
            if (data.width > 0 && data.height > 0 && data.image.length > 0) {
              const buffer = new Uint8ClampedArray(data.image);
              processedCursorImages[key] = { ...data, imageData: new ImageData(buffer, data.width, data.height) };
            } else {
              processedCursorImages[key] = { ...data, imageData: undefined };
            }
          }

          set(state => { 
            state.metadata = processedMetadata;
            state.recordingGeometry = geometry || null;
            state.screenSize = screenSize || null;
            state.cursorImages = processedCursorImages;
            state.syncOffset = syncOffset; // MODIFIED: Set syncOffset in state
          });

          const clicks = processedMetadata.filter((item: MetaDataItem) => item.type === 'click' && item.pressed);
          if (clicks.length === 0) return;

          const { width: videoWidth, height: videoHeight } = get().videoDimensions;
          if (videoWidth === 0 || videoHeight === 0) {
            console.warn("Video dimensions are not set, cannot generate auto zoom regions accurately.");
            // We still proceed, setVideoDimensions will trigger the logic later
          }

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
          
          const newZoomRegions: Record<string, ZoomRegion> = mergedClickGroups.reduce((acc, group, index) => {
            const firstClick = group[0];
            const lastClick = group[group.length - 1];

            const startTime = Math.max(0, firstClick.timestamp - ZOOM.AUTO_ZOOM_PRE_CLICK_OFFSET);
            const endTime = lastClick.timestamp + ZOOM.AUTO_ZOOM_POST_CLICK_PADDING;

            let duration = endTime - startTime;
            // Ensure minimum duration, especially for single clicks
            if (duration < ZOOM.AUTO_ZOOM_MIN_DURATION) {
              duration = ZOOM.AUTO_ZOOM_MIN_DURATION;
            }

            const id = `auto-zoom-${Date.now()}-${index}`;

            const newRegion: ZoomRegion = {
              id,
              type: 'zoom',
              startTime,
              duration,
              zoomLevel: ZOOM.DEFAULT_LEVEL,
              easing: ZOOM.DEFAULT_EASING,
              transitionDuration: ZOOM.SPEED_OPTIONS[ZOOM.DEFAULT_SPEED as keyof typeof ZOOM.SPEED_OPTIONS],
              targetX: (firstClick.x / (geometry?.width || videoWidth)) - 0.5,
              targetY: (firstClick.y / (geometry?.height || videoHeight)) - 0.5,
              mode: 'auto',
              zIndex: 0,
            };

            acc[id] = newRegion;
            return acc;
          }, {} as Record<string, ZoomRegion>);

          set(state => {
            state.zoomRegions = newZoomRegions;
            recalculateZIndicesOnDraft(state);
          });

        } catch (error) {
          console.error("Failed to process metadata file:", error);
        }
      },

      setVideoDimensions: (dims) => set(state => {
        state.videoDimensions = dims;
        // If this is an imported video, geometry and screenSize won't exist.
        // We'll create them based on the video's own dimensions.
        if (!state.recordingGeometry) {
          state.recordingGeometry = { x: 0, y: 0, width: dims.width, height: dims.height };
        }
        if (!state.screenSize) {
          state.screenSize = { width: dims.width, height: dims.height };
        }
        _recalculateCanvasDimensions(state);
      }),

      setDuration: (duration) => set(state => {
        state.duration = duration;

        if (duration > 0) {
          Object.values(state.zoomRegions).forEach(region => {
            const regionEndTime = region.startTime + region.duration;
            if (regionEndTime > duration) {
              const newDuration = duration - region.startTime;
              region.duration = Math.max(TIMELINE.MINIMUM_REGION_DURATION, newDuration);
            }
          });
          Object.values(state.cutRegions).forEach(region => {
            const regionEndTime = region.startTime + region.duration;
            if (regionEndTime > duration) {
              const newDuration = duration - region.startTime;
              region.duration = Math.max(TIMELINE.MINIMUM_REGION_DURATION, newDuration);
            }
          });
        }
      }),

      setCurrentTime: (time) => set(state => {
        state.currentTime = time;
        const allZoomRegions = Object.values(state.zoomRegions);
        const allCutRegions = Object.values(state.cutRegions);

        const newActiveRegion = allZoomRegions.find(r => time >= r.startTime && time < r.startTime + r.duration);
        state.activeZoomRegionId = newActiveRegion?.id ?? null;

        const activeCutRegion = allCutRegions.find(r => time >= r.startTime && time < r.startTime + r.duration);
        state.isCurrentlyCut = !!activeCutRegion;
      }),

      togglePlay: () => set(state => { state.isPlaying = !state.isPlaying; }),
      setPlaying: (isPlaying) => set(state => { state.isPlaying = isPlaying; }),

      seekToPreviousFrame: () => {
        const { isPlaying, currentTime } = get();
        if (isPlaying) {
          set({ isPlaying: false });
        }
        const frameDuration = 1 / 30; // Assuming 30 FPS
        const newTime = Math.max(0, currentTime - frameDuration);
        get().setCurrentTime(newTime);
      },
      seekToNextFrame: () => {
        const { isPlaying, currentTime, duration } = get();
        if (isPlaying) {
          set({ isPlaying: false });
        }
        const frameDuration = 1 / 30; // Assuming 30 FPS
        const newTime = Math.min(duration, currentTime + frameDuration);
        get().setCurrentTime(newTime);
      },

      seekBackward: (seconds: number) => {
        const { isPlaying, currentTime } = get();
        if (isPlaying) {
          set({ isPlaying: false });
        }
        const newTime = Math.max(0, currentTime - seconds);
        get().setCurrentTime(newTime);
      },
      
      seekForward: (seconds: number) => {
        const { isPlaying, currentTime, duration } = get();
        if (isPlaying) {
          set({ isPlaying: false });
        }
        const newTime = Math.min(duration, currentTime + seconds);
        get().setCurrentTime(newTime);
      },

      updateFrameStyle: (style) => {
        set(state => {
          Object.assign(state.frameStyles, style);
        });
        get()._ensureActivePresetIsWritable();
      },

      updateBackground: (bg) => set((state) => {
        Object.assign(state.frameStyles.background, bg);
        get()._ensureActivePresetIsWritable();
      }),

      setAspectRatio: (ratio) => {
        set(state => { 
          state.aspectRatio = ratio; 
          _recalculateCanvasDimensions(state);
        });
        get()._ensureActivePresetIsWritable();
      },

      addZoomRegion: () => {
        const { metadata, currentTime, recordingGeometry, duration } = get();
        const { width: videoWidth, height: videoHeight } = recordingGeometry || { width: 0, height: 0 };
        if (duration === 0 || videoWidth === 0) return;

        const lastMousePos = metadata.find(m => m.timestamp <= currentTime);
        const id = `zoom-${Date.now()}`;

        const newRegion: ZoomRegion = {
          id,
          type: 'zoom',
          startTime: currentTime,
          duration: ZOOM.DEFAULT_DURATION,
          zoomLevel: ZOOM.DEFAULT_LEVEL,
          easing: ZOOM.DEFAULT_EASING,
          transitionDuration: ZOOM.SPEED_OPTIONS[ZOOM.DEFAULT_SPEED as keyof typeof ZOOM.SPEED_OPTIONS],
          targetX: lastMousePos ? (lastMousePos.x / videoWidth) - 0.5 : 0,
          targetY: lastMousePos ? (lastMousePos.y / videoHeight) - 0.5 : 0,
          mode: 'auto',
          zIndex: 0,
        };

        if (newRegion.startTime + newRegion.duration > duration) {
          newRegion.duration = Math.max(TIMELINE.MINIMUM_REGION_DURATION, duration - newRegion.startTime);
        }

        set(state => {
          state.zoomRegions[id] = newRegion;
          state.selectedRegionId = id;
          recalculateZIndicesOnDraft(state);
        });
      },

      addCutRegion: (regionData) => {
        const { currentTime, duration } = get();
        if (duration === 0) return;

        const id = `cut-${Date.now()}`;

        const newRegion: CutRegion = {
          id,
          type: 'cut',
          startTime: currentTime,
          duration: 2,
          zIndex: 0,
          ...regionData,
        };

        if (newRegion.startTime + newRegion.duration > duration) {
          newRegion.duration = Math.max(TIMELINE.MINIMUM_REGION_DURATION, duration - newRegion.startTime);
        }

        set(state => {
          state.cutRegions[id] = newRegion;
          state.selectedRegionId = id;
          recalculateZIndicesOnDraft(state);
        });
      },

      updateRegion: (id, updates) => {
        // Entire logic is now inside a single `set` call.
        set(state => {
          const region = state.zoomRegions[id] || state.cutRegions[id];

          if (region) {
            const oldDuration = region.duration;
            Object.assign(region, updates);
            
            // Recalculate z-indices if duration changed
            if (oldDuration !== region.duration) {
              recalculateZIndicesOnDraft(state);
            }
          }
        });
      },

      deleteRegion: (id) => {
        // Entire logic is now inside a single `set` call.
        set(state => {
          delete state.zoomRegions[id];
          delete state.cutRegions[id];
          if (state.selectedRegionId === id) {
            state.selectedRegionId = null;
          }
          // Always recalculate after a deletion.
          recalculateZIndicesOnDraft(state);
        });
      },

      setSelectedRegionId: (id) => set(state => { state.selectedRegionId = id; }),
      toggleTheme: () => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark';
        set(state => { state.theme = newTheme; });
        window.electronAPI.setSetting('appearance.theme', newTheme);
      },
      setPreviewCutRegion: (region) => set(state => { state.previewCutRegion = region; }),
      setTimelineZoom: (zoom) => set(state => { state.timelineZoom = zoom; }),

      setCursorScale: (scale) => {
        set({ cursorScale: scale });
        window.electronAPI.setCursorScale(scale); // Update system cursor for live preview
        get()._ensureActivePresetIsWritable();
      },

      initializeSettings: async () => {
        try {
          const appearance = await window.electronAPI.getSetting<{ theme: 'light' | 'dark' }>('appearance');
          if (appearance && appearance.theme) {
            set({ theme: appearance.theme });
          }
        } catch (error) {
          console.error("Could not load app settings:", error);
        }
      },

      initializePresets: async () => {
        try {
          const loadedPresets = await window.electronAPI.getSetting<Record<string, Preset>>('presets') || {};

          // Always ensure the default preset exists and is up-to-date.
          loadedPresets[DEFAULT_PRESET_ID] = {
            id: DEFAULT_PRESET_ID,
            name: 'Default',
            ...JSON.parse(JSON.stringify(DEFAULT_PRESET))
          };
          
          let presetsModified = false;
          Object.values(loadedPresets).forEach(preset => {
              if (preset.id !== DEFAULT_PRESET_ID && preset.isDefault) {
                  delete preset.isDefault; // Clean up old default flags
                  presetsModified = true;
              }

              // Add borderColor if missing
              if (preset.styles && preset.styles.borderColor === undefined) {
                  preset.styles.borderColor = DEFAULT_PRESET_STYLES.borderColor;
                  presetsModified = true;
              }
              
              // Add webcam shape if missing
              if (preset.webcamStyles && preset.webcamStyles.shape === undefined) {
                  preset.webcamStyles.shape = 'circle';
                  presetsModified = true;
              }
              // Add webcam border radius if missing
              if (preset.webcamStyles && preset.webcamStyles.borderRadius === undefined) {
                  preset.webcamStyles.borderRadius = 50; // default for circle
                  presetsModified = true;
              }
              if (preset.cursorScale === undefined) {
                preset.cursorScale = 1;
                presetsModified = true;
              }
          });


          if (presetsModified) {
            await window.electronAPI.setSetting('presets', loadedPresets);
          }

          const lastUsedId = localStorage.getItem(APP.LAST_PRESET_ID_KEY);
          const activeId = (lastUsedId && loadedPresets[lastUsedId]) ? lastUsedId : DEFAULT_PRESET_ID;
          
          set(state => {
            state.presets = loadedPresets;
            state.activePresetId = activeId;
            state.frameStyles = JSON.parse(JSON.stringify(loadedPresets[activeId].styles));
            state.aspectRatio = loadedPresets[activeId].aspectRatio;
            state.cursorScale = loadedPresets[activeId].cursorScale || 1; // Load cursor scale
          });

        } catch (error) {
          console.error("Could not initialize presets:", error);
        }
      },

      applyPreset: (id) => {
        const preset = get().presets[id];
        if (preset) {
          set(state => {
            state.frameStyles = JSON.parse(JSON.stringify(preset.styles));
            state.aspectRatio = preset.aspectRatio;
            state.activePresetId = id;
            state.cursorScale = preset.cursorScale || 1; // Apply cursor scale from preset

            // Apply webcam settings from preset if available
            if (preset.webcamStyles) {
              state.webcamStyles = JSON.parse(JSON.stringify(preset.webcamStyles));
            }
            if (preset.webcamPosition) {
              state.webcamPosition = JSON.parse(JSON.stringify(preset.webcamPosition));
            }
            if (preset.isWebcamVisible !== undefined) {
              state.isWebcamVisible = preset.isWebcamVisible;
            }
            
            _recalculateCanvasDimensions(state);
          });
          localStorage.setItem(APP.LAST_PRESET_ID_KEY, id);
        }
      },

      resetPreset: (id) => {
        set(state => {
          const presetToReset = state.presets[id];
          if (presetToReset && presetToReset.isDefault) {
            presetToReset.styles = JSON.parse(JSON.stringify(DEFAULT_PRESET.styles));
            presetToReset.aspectRatio = DEFAULT_PRESET.aspectRatio;
            presetToReset.cursorScale = DEFAULT_PRESET.cursorScale;
            presetToReset.webcamStyles = JSON.parse(JSON.stringify(DEFAULT_PRESET.webcamStyles));
            presetToReset.webcamPosition = JSON.parse(JSON.stringify(DEFAULT_PRESET.webcamPosition));
            presetToReset.isWebcamVisible = DEFAULT_PRESET.isWebcamVisible;
            
            if (state.activePresetId === id) {
                get().applyPreset(id);
            }
          }
        });
        _persistPresets(get().presets);
      },

      _ensureActivePresetIsWritable: () => {
        const { activePresetId, presets } = get();
        if (activePresetId && presets[activePresetId]?.isDefault) {
          // Currently on the default preset, so we need to create a copy.
          const newId = `preset-${Date.now()}`;
          const newPreset: Preset = {
            ...JSON.parse(JSON.stringify(presets[activePresetId])), // Deep copy
            id: newId,
            name: 'Custom Preset',
            isDefault: false,
          };

          set(state => {
            state.presets[newId] = newPreset;
            state.activePresetId = newId; // Switch to the new preset
          });
          localStorage.setItem(APP.LAST_PRESET_ID_KEY, newId);
        }
        // Now that the active preset is guaranteed to be writable, save all changes.
        get().updateActivePreset();
      },

      updatePresetName: (id, name) => {
        set(state => {
          const preset = state.presets[id];
          if (preset && !preset.isDefault) {
            preset.name = name;
          }
        });
        _persistPresets(get().presets)
      },
      saveCurrentStyleAsPreset: (name) => {
        const id = `preset-${Date.now()}`;
        const newPreset: Preset = {
          id,
          name,
          styles: JSON.parse(JSON.stringify(get().frameStyles)),
          aspectRatio: get().aspectRatio,
          cursorScale: get().cursorScale,
          isDefault: false, // New presets are never the default one

          // Save current webcam settings with the preset
          webcamPosition: JSON.parse(JSON.stringify(get().webcamPosition)),
          webcamStyles: JSON.parse(JSON.stringify(get().webcamStyles)),
          isWebcamVisible: get().isWebcamVisible,
        };
        set(state => {
          state.presets[id] = newPreset;
          state.activePresetId = id;
        });
        localStorage.setItem(APP.LAST_PRESET_ID_KEY, id);
        window.electronAPI.setSetting('presets', get().presets);
      },

      updateActivePreset: () => {
        const { activePresetId, presets, frameStyles, aspectRatio, cursorScale, webcamPosition, webcamStyles, isWebcamVisible } = get();
        if (activePresetId && presets[activePresetId]) {
          set(state => {
            state.presets[activePresetId].styles = JSON.parse(JSON.stringify(frameStyles));
            state.presets[activePresetId].aspectRatio = aspectRatio;
            state.presets[activePresetId].cursorScale = cursorScale;
            state.presets[activePresetId].webcamPosition = JSON.parse(JSON.stringify(webcamPosition));
            state.presets[activePresetId].webcamStyles = JSON.parse(JSON.stringify(webcamStyles));
            state.presets[activePresetId].isWebcamVisible = isWebcamVisible;
          });
          _persistPresets(get().presets);
        }
      },

      deletePreset: (id) => {
        const state = get();
        if (state.presets[id]?.isDefault || id === DEFAULT_PRESET_ID) {
          console.warn("Cannot delete the default preset.");
          return;
        }

        set(state => {
          delete state.presets[id];
          if (state.activePresetId === id) {
            get().applyPreset(DEFAULT_PRESET_ID);
          }
        });
        _persistPresets(get().presets);
      },

      reset: () => set(state => {
        Object.assign(state, initialProjectState);
        Object.assign(state, initialAppState);
        state.frameStyles = initialFrameStyles;
      }),

      togglePreviewFullScreen: () => set(state => { state.isPreviewFullScreen = !state.isPreviewFullScreen }),

      applyAnimationSettingsToAll: ({ transitionDuration, easing, zoomLevel }) => {
        set(state => {
          Object.values(state.zoomRegions).forEach(region => {
            region.transitionDuration = transitionDuration;
            region.easing = easing;
            region.zoomLevel = zoomLevel;
          });
        });
      },

      setWebcamPosition: (position) => {
        set({ webcamPosition: position });
        get()._ensureActivePresetIsWritable();
      },
      setWebcamVisibility: (isVisible) => {
        set({ isWebcamVisible: isVisible });
        get()._ensureActivePresetIsWritable();
      },
      updateWebcamStyle: (style) => {
        set(state => {
          Object.assign(state.webcamStyles, style);
        });
        get()._ensureActivePresetIsWritable();
      },
    })),
    {
      // Configuration for Zundo (undo/redo)
      partialize: (state) => {
        // Only include these properties in the history.
        // Excludes transient state like `currentTime`, `isPlaying`, etc.
        const {
          frameStyles,
          aspectRatio,
          zoomRegions,
          cutRegions,
          presets,
          activePresetId,
          cursorScale,
          webcamPosition,
          webcamStyles,
          isWebcamVisible
        } = state;

        return {
          frameStyles,
          aspectRatio,
          zoomRegions,
          cutRegions,
          presets,
          activePresetId,
          cursorScale,
          webcamPosition,
          webcamStyles,
          isWebcamVisible
        };
      },
      equality: shallow,
    }
  )
);

export const usePlaybackState = () => useEditorStore(useShallow(state => ({
  currentTime: state.currentTime,
  duration: state.duration,
  isPlaying: state.isPlaying,
  isCurrentlyCut: state.isCurrentlyCut
})));

export const useFrameStyles = () => useEditorStore(useShallow(state => state.frameStyles));

export const useAllRegions = () => useEditorStore(useShallow(state => ({
  zoomRegions: state.zoomRegions,
  cutRegions: state.cutRegions,
})));