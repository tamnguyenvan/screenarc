import { TIMELINE, ZOOM } from '../../lib/constants';
import type { TimelineState, TimelineActions, Slice } from '../../types';
import type { CutRegion, ZoomRegion } from '../../types';

export const initialTimelineState: TimelineState = {
  zoomRegions: {},
  cutRegions: {},
  previewCutRegion: null,
  selectedRegionId: null,
  activeZoomRegionId: null,
  isCurrentlyCut: false,
  timelineZoom: 1,
};

/**
 * Recalculates and assigns z-index values to all timeline regions based on their duration.
 * Shorter regions get a higher z-index to ensure they are clickable on top of longer ones.
 * This function mutates the draft state directly within an Immer producer.
 * @param state - The current EditorState draft.
 */
const recalculateZIndices = (state: {
  zoomRegions: Record<string, ZoomRegion>;
  cutRegions: Record<string, CutRegion>;
}) => {
  const allRegions = [...Object.values(state.zoomRegions), ...Object.values(state.cutRegions)];
  allRegions.sort((a, b) => a.duration - b.duration);

  const regionCount = allRegions.length;
  allRegions.forEach((region, index) => {
    const newZIndex = 10 + (regionCount - 1 - index);
    if (state.zoomRegions[region.id]) {
      state.zoomRegions[region.id].zIndex = newZIndex;
    } else if (state.cutRegions[region.id]) {
      state.cutRegions[region.id].zIndex = newZIndex;
    }
  });
};

export const createTimelineSlice: Slice<TimelineState, TimelineActions> = (set, get) => ({
  ...initialTimelineState,
  addZoomRegion: () => {
    const { metadata, currentTime, recordingGeometry, duration } = get();
    if (duration === 0) return;

    const lastMousePos = metadata.slice().reverse().find(m => m.timestamp <= currentTime);
    const id = `zoom-${Date.now()}`;

    const newRegion: ZoomRegion = {
      id,
      type: 'zoom',
      startTime: currentTime,
      duration: ZOOM.DEFAULT_DURATION,
      zoomLevel: ZOOM.DEFAULT_LEVEL,
      easing: ZOOM.DEFAULT_EASING,
      transitionDuration: ZOOM.SPEED_OPTIONS[ZOOM.DEFAULT_SPEED as keyof typeof ZOOM.SPEED_OPTIONS],
      targetX: lastMousePos && recordingGeometry ? (lastMousePos.x / recordingGeometry.width) - 0.5 : 0,
      targetY: lastMousePos && recordingGeometry ? (lastMousePos.y / recordingGeometry.height) - 0.5 : 0,
      mode: 'auto',
      zIndex: 0,
    };

    if (newRegion.startTime + newRegion.duration > duration) {
      newRegion.duration = Math.max(TIMELINE.MINIMUM_REGION_DURATION, duration - newRegion.startTime);
    }

    set(state => {
      state.zoomRegions[id] = newRegion;
      state.selectedRegionId = id;
      recalculateZIndices(state);
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
      recalculateZIndices(state);
    });
  },
  updateRegion: (id, updates) => {
    set(state => {
      const region = state.zoomRegions[id] || state.cutRegions[id];
      if (region) {
        const oldDuration = region.duration;
        Object.assign(region, updates);
        if (oldDuration !== region.duration) {
          recalculateZIndices(state);
        }
      }
    });
  },
  deleteRegion: (id) => {
    set(state => {
      delete state.zoomRegions[id];
      delete state.cutRegions[id];
      if (state.selectedRegionId === id) {
        state.selectedRegionId = null;
      }
      recalculateZIndices(state);
    });
  },
  setSelectedRegionId: (id) => set(state => { state.selectedRegionId = id; }),
  setPreviewCutRegion: (region) => set(state => { state.previewCutRegion = region; }),
  setTimelineZoom: (zoom) => set(state => { state.timelineZoom = zoom; }),
  applyAnimationSettingsToAll: ({ transitionDuration, easing, zoomLevel }) => {
    set(state => {
      Object.values(state.zoomRegions).forEach(region => {
        region.transitionDuration = transitionDuration;
        region.easing = easing;
        region.zoomLevel = zoomLevel;
      });
    });
  },
});