import { WALLPAPERS } from '../../lib/constants';
import type { FrameState, FrameActions, Slice } from '../../types';
import type { AspectRatio, FrameStyles } from '../../types';

export const initialFrameState: FrameState = {
  frameStyles: {
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
  },
  aspectRatio: '16:9' as AspectRatio,
};

/**
 * Calculates new canvas dimensions based on screen size and aspect ratio.
 * This helper ensures the output canvas fits within the screen while maintaining the target aspect ratio.
 * @param state - The current EditorState draft.
 */
export const recalculateCanvasDimensions = (state: {
  screenSize: { width: number, height: number } | null,
  aspectRatio: AspectRatio,
  canvasDimensions: { width: number, height: number }
}) => {
  if (!state.screenSize || !state.aspectRatio) {
    state.canvasDimensions = { width: 1920, height: 1080 }; // Fallback
    return;
  }
  const { width: screenWidth, height: screenHeight } = state.screenSize;
  const [ratioW, ratioH] = state.aspectRatio.split(':').map(Number);
  const screenAspectRatio = screenWidth / screenHeight;
  const targetAspectRatio = ratioW / ratioH;

  let canvasWidth: number, canvasHeight: number;

  if (targetAspectRatio > screenAspectRatio) {
    canvasWidth = screenWidth;
    canvasHeight = Math.round(screenWidth / targetAspectRatio);
  } else {
    canvasHeight = screenHeight;
    canvasWidth = Math.round(screenHeight * targetAspectRatio);
  }

  // Ensure dimensions are even numbers for video encoders
  state.canvasDimensions = {
    width: canvasWidth % 2 === 0 ? canvasWidth : canvasWidth + 1,
    height: canvasHeight % 2 === 0 ? canvasHeight : canvasHeight + 1,
  };
};

export const createFrameSlice: Slice<FrameState, FrameActions> = (set, get) => ({
  ...initialFrameState,
  updateFrameStyle: (style: Partial<Omit<FrameStyles, 'background'>>) => {
    set(state => {
      Object.assign(state.frameStyles, style);
    });
    get()._ensureActivePresetIsWritable();
  },
  updateBackground: (bg) => {
    set((state) => {
      Object.assign(state.frameStyles.background, bg);
    });
    get()._ensureActivePresetIsWritable();
  },
  setAspectRatio: (ratio) => {
    set(state => {
      state.aspectRatio = ratio;
      recalculateCanvasDimensions(state);
    });
    get()._ensureActivePresetIsWritable();
  },
});