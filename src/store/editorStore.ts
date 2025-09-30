import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/react/shallow';
import { temporal } from 'zundo';
import { WALLPAPERS, APP, TIMELINE, ZOOM } from '../lib/constants';
import { shallow } from 'zustand/shallow';
import {
  AspectRatio, Background, FrameStyles, Preset, ZoomRegion, CutRegion, TimelineRegion,
  EditorState, MetaDataItem, WebcamStyles,
  WebcamPosition,
  AnchorPoint
} from '../types/store';

// --- Constants ---
const DEFAULT_PRESET_STYLES: FrameStyles = {
  padding: 4,
  background: {
    type: 'wallpaper',
    thumbnailUrl: WALLPAPERS[0].thumbnailUrl,
    imageUrl: WALLPAPERS[0].imageUrl,
  },
  borderRadius: 8,
  shadow: 30,
  shadowColor: 'rgba(0, 0, 0, 0.5)',
  borderWidth: 4,
};

const DEFAULT_PRESET: Omit<Preset, 'id' | 'name'> = {
  styles: DEFAULT_PRESET_STYLES,
  aspectRatio: '16:9',
  isDefault: true,
  webcamStyles: {
    size: 30,  // percent
    shadow: 30,
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
  reset: () => void;
  _ensureActivePresetIsWritable: () => void;
  initializeSettings: () => Promise<void>;
  initializePresets: () => Promise<void>;
  applyPreset: (id: string) => void;
  _recalculateZIndices: () => void;
  resetPreset: (id: string) => void;
  updatePresetName: (id: string, name: string) => void;
  saveCurrentStyleAsPreset: (name: string) => void;
  updateActivePreset: () => void;
  deletePreset: (id: string) => void;
  togglePreviewFullScreen: () => void;

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
  videoDimensions: { width: 1920, height: 1080 },
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
  webcamVideoPath: null,
  webcamVideoUrl: null,
  isWebcamVisible: false,
  webcamPosition: { pos: 'bottom-right' } as WebcamPosition,
  webcamStyles: { size: 30, shadow: 15, shadowColor: 'rgba(0, 0, 0, 0.4)' }, // Added shadowColor
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
  shadow: 5, // Controls blur and offset strength
  shadowColor: 'rgba(0, 0, 0, 0.4)', // Default shadow color with 40% opacity
  borderWidth: 6,
}

const _calculateAnchors = (
  region: ZoomRegion,
  metadata: MetaDataItem[],
  videoDimensions: { width: number; height: number }
): AnchorPoint[] => {
  if (region.mode !== 'auto' || metadata.length === 0 || videoDimensions.width === 0) {
    return [];
  }

  const { width: videoWidth, height: videoHeight } = videoDimensions;
  
  const panStartTime = region.startTime + ZOOM.TRANSITION_DURATION;
  const panEndTime = region.startTime + region.duration - ZOOM.TRANSITION_DURATION;

  // Filter metadata within the pan time range
  const relevantMetadata = metadata.filter(m => m.timestamp >= panStartTime && m.timestamp <= panEndTime);
  if (relevantMetadata.length === 0) {
    // If no mouse movement, only return start and end anchors
    return [
      { time: panStartTime, x: region.targetX, y: region.targetY },
      { time: panEndTime, x: region.targetX, y: region.targetY },
    ];
  }

  const anchors: AnchorPoint[] = [];

  // Yêu cầu quyền truy cập audio
  let lastAnchor: AnchorPoint = {
    time: relevantMetadata[0].timestamp,
    x: (relevantMetadata[0].x / videoWidth) - 0.5,
    y: (relevantMetadata[0].y / videoHeight) - 0.5,
  };
  anchors.push(lastAnchor);

  for (const dataPoint of relevantMetadata) {
    const currentPos = {
      x: (dataPoint.x / videoWidth) - 0.5,
      y: (dataPoint.y / videoHeight) - 0.5,
    };

    const dist_x = Math.abs(currentPos.x - lastAnchor.x);
    const dist_y = Math.abs(currentPos.y - lastAnchor.y);

    if (dist_x > ZOOM.ANCHOR_GENERATION_THRESHOLD || dist_y > ZOOM.ANCHOR_GENERATION_THRESHOLD) {
      const newAnchor = { time: dataPoint.timestamp, ...currentPos };
      anchors.push(newAnchor);
      lastAnchor = newAnchor;
    }
  }

  return anchors;
};

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

const _recalculateZIndices = (set: (fn: (state: EditorState) => void) => void) => {
  set(state => {
    const allRegions = [
      ...Object.values(state.zoomRegions),
      ...Object.values(state.cutRegions).filter(r => !r.trimType)
    ];

    // Sort by duration ASC (shorter regions get higher z-index)
    allRegions.sort((a, b) => a.duration - b.duration);

    // The shortest region (index 0) gets the highest z-index.
    const regionCount = allRegions.length;
    allRegions.forEach((region, index) => {
      // Start z-index from 10 to leave space for other layers (like trim regions)
      region.zIndex = 10 + (regionCount - 1 - index);
    });
  });
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
          const metadata: MetaDataItem[] = JSON.parse(metadataContent);
          const processedMetadata = metadata.map(item => ({ ...item, timestamp: item.timestamp / 1000 }));
          set(state => { state.metadata = processedMetadata });

          const clicks = processedMetadata.filter(item => item.type === 'click' && item.pressed);
          if (clicks.length === 0) return;

          const { width: videoWidth, height: videoHeight } = get().videoDimensions;
          if (videoWidth === 0 || videoHeight === 0) {
            console.warn("Video dimensions are not set, cannot generate auto zoom regions accurately.");
            return;
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
              easing: 'ease-in-out',
              targetX: (firstClick.x / videoWidth) - 0.5,
              targetY: (firstClick.y / videoHeight) - 0.5,
              mode: 'auto',
              zIndex: 0,
            };

            newRegion.anchors = _calculateAnchors(newRegion, processedMetadata, get().videoDimensions);

            acc[id] = newRegion;
            return acc;
          }, {} as Record<string, ZoomRegion>);

          set(state => {
            state.zoomRegions = newZoomRegions;
          });
          get()._recalculateZIndices();


        } catch (error) {
          console.error("Failed to process metadata file:", error);
        }
      },

      setVideoDimensions: (dims) => set(state => { state.videoDimensions = dims }),

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
        set(state => { state.aspectRatio = ratio; });
        get()._ensureActivePresetIsWritable();
      },

      addZoomRegion: () => {
        const { metadata, currentTime, videoDimensions, duration } = get();
        const { width: videoWidth, height: videoHeight } = videoDimensions;
        if (duration === 0 || videoWidth === 0) return;

        const lastMousePos = metadata.find(m => m.timestamp <= currentTime);
        const id = `zoom-${Date.now()}`;

        const newRegion: ZoomRegion = {
          id,
          type: 'zoom',
          startTime: currentTime,
          duration: ZOOM.DEFAULT_DURATION,
          zoomLevel: ZOOM.DEFAULT_LEVEL,
          easing: 'ease-in-out',
          targetX: lastMousePos ? (lastMousePos.x / videoWidth) - 0.5 : 0,
          targetY: lastMousePos ? (lastMousePos.y / videoHeight) - 0.5 : 0,
          mode: 'auto',
          zIndex: 0,  // will be set by _recalculateZIndices
        };

        newRegion.anchors = _calculateAnchors(newRegion, metadata, videoDimensions);

        if (newRegion.startTime + newRegion.duration > duration) {
          newRegion.duration = Math.max(TIMELINE.MINIMUM_REGION_DURATION, duration - newRegion.startTime);
        }

        set(state => {
          state.zoomRegions[id] = newRegion;
          state.selectedRegionId = id;
        });
        get()._recalculateZIndices();
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
          zIndex: 0,  // will be set by _recalculateZIndices
          ...regionData,
        };

        if (newRegion.startTime + newRegion.duration > duration) {
          newRegion.duration = Math.max(TIMELINE.MINIMUM_REGION_DURATION, duration - newRegion.startTime);
        }

        set(state => {
          state.cutRegions[id] = newRegion;
          state.selectedRegionId = id;
        });

        // Only recalculate for non-trim regions
        if (!regionData?.trimType) {
          get()._recalculateZIndices();
        }
      },

      updateRegion: (id, updates) => {
        set(state => {
          const region = state.zoomRegions[id] || state.cutRegions[id];

          if (region) {
            const oldDuration = region.duration;
            Object.assign(region, updates);
            const videoDuration = state.duration;
            if (videoDuration > 0) {
              region.startTime = Math.max(0, Math.min(region.startTime, videoDuration - TIMELINE.MINIMUM_REGION_DURATION));
              const maxPossibleDuration = videoDuration - region.startTime;
              region.duration = Math.max(TIMELINE.MINIMUM_REGION_DURATION, Math.min(region.duration, maxPossibleDuration));
            }

            if (updates.startTime !== undefined || updates.duration !== undefined) {
              region.anchors = _calculateAnchors(region, state.metadata, state.videoDimensions);
            }

            // Recalculate if duration changed, as it affects z-index order
            if (oldDuration !== region.duration) {
              get()._recalculateZIndices();
            }
          }
        });
      },


      deleteRegion: (id) => {
        const presetToDelete = get().presets[id];
        if (presetToDelete?.isDefault) {
          console.warn("Attempted to delete the default preset. Operation blocked.");
          return;
        }

        set(state => {
          delete state.zoomRegions[id];
          delete state.cutRegions[id];
          if (state.selectedRegionId === id) {
            state.selectedRegionId = null;
          }
        });
        get()._recalculateZIndices();
      },

      setSelectedRegionId: (id) => set(state => { state.selectedRegionId = id; }),
      toggleTheme: () => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark';
        set(state => { state.theme = newTheme; });
        window.electronAPI.setSetting('appearance.theme', newTheme);
      },
      setPreviewCutRegion: (region) => set(state => { state.previewCutRegion = region; }),
      setTimelineZoom: (zoom) => set(state => { state.timelineZoom = zoom; }),

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

          // Always ensure the default preset exists and is up-to-date. It's the source of truth.
          loadedPresets[DEFAULT_PRESET_ID] = {
            id: DEFAULT_PRESET_ID,
            name: 'Default',
            ...JSON.parse(JSON.stringify(DEFAULT_PRESET))
          };
          
          // Ensure `shadowColor` property exists in old presets for backward compatibility
          let presetsModified = false;
          Object.values(loadedPresets).forEach(preset => {
            if (preset.id !== DEFAULT_PRESET_ID && preset.isDefault) {
              delete preset.isDefault; // Clean up old default flags
              presetsModified = true;
            }
            if (preset.styles && preset.styles.shadowColor === undefined) {
              preset.styles.shadowColor = initialFrameStyles.shadowColor;
              presetsModified = true;
            }
            if (preset.webcamStyles && preset.webcamStyles.shadowColor === undefined) {
              preset.webcamStyles.shadowColor = initialProjectState.webcamStyles.shadowColor;
              presetsModified = true;
            }
            // Ensure all presets have webcam settings
            if (!preset.webcamStyles || !preset.webcamPosition || preset.isWebcamVisible === undefined) {
              preset.webcamStyles = JSON.parse(JSON.stringify(DEFAULT_PRESET.webcamStyles));
              preset.webcamPosition = JSON.parse(JSON.stringify(DEFAULT_PRESET.webcamPosition));
              preset.isWebcamVisible = DEFAULT_PRESET.isWebcamVisible;
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
          });
          localStorage.setItem(APP.LAST_PRESET_ID_KEY, id);
        }
      },

      _recalculateZIndices: () => _recalculateZIndices(set),

      resetPreset: (id) => {
        set(state => {
          const presetToReset = state.presets[id];
          if (presetToReset && presetToReset.isDefault) {
            presetToReset.styles = JSON.parse(JSON.stringify(DEFAULT_PRESET.styles));
            presetToReset.aspectRatio = DEFAULT_PRESET.aspectRatio;
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
        const { activePresetId, presets, frameStyles, aspectRatio, webcamPosition, webcamStyles, isWebcamVisible } = get();
        if (activePresetId && presets[activePresetId]) {
          set(state => {
            state.presets[activePresetId].styles = JSON.parse(JSON.stringify(frameStyles));
            state.presets[activePresetId].aspectRatio = aspectRatio;
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