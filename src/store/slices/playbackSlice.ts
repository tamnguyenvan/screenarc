import type { PlaybackState, PlaybackActions, Slice } from '../../types';

export const initialPlaybackState: PlaybackState = {
  isPlaying: false,
  currentTime: 0,
};

export const createPlaybackSlice: Slice<PlaybackState, PlaybackActions> = (set, get) => ({
  ...initialPlaybackState,
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
    if (isPlaying) set(state => { state.isPlaying = false; });
    const frameDuration = 1 / 30; // Assuming 30 FPS for frame-by-frame seeking
    const newTime = Math.max(0, currentTime - frameDuration);
    get().setCurrentTime(newTime);
  },
  seekToNextFrame: () => {
    const { isPlaying, currentTime, duration } = get();
    if (isPlaying) set(state => { state.isPlaying = false; });
    const frameDuration = 1 / 30; // Assuming 30 FPS
    const newTime = Math.min(duration, currentTime + frameDuration);
    get().setCurrentTime(newTime);
  },
  seekBackward: (seconds) => {
    const { isPlaying, currentTime } = get();
    if (isPlaying) set(state => { state.isPlaying = false; });
    const newTime = Math.max(0, currentTime - seconds);
    get().setCurrentTime(newTime);
  },
  seekForward: (seconds) => {
    const { isPlaying, currentTime, duration } = get();
    if (isPlaying) set(state => { state.isPlaying = false; });
    const newTime = Math.min(duration, currentTime + seconds);
    get().setCurrentTime(newTime);
  },
});