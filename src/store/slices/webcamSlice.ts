import type { WebcamState, WebcamActions, Slice } from '../../types';
import type { WebcamPosition, WebcamStyles } from '../../types';

export const initialWebcamState: WebcamState = {
  webcamVideoPath: null,
  webcamVideoUrl: null,
  isWebcamVisible: false,
  webcamPosition: { pos: 'bottom-right' },
  webcamStyles: {
    shape: 'square',
    borderRadius: 35,
    size: 30,
    shadowBlur: 20,
    shadowOffsetX: 0,
    shadowOffsetY: 10,
    shadowColor: 'rgba(0, 0, 0, 0.4)'
  },
};

export const createWebcamSlice: Slice<WebcamState, WebcamActions> = (set, get) => ({
  ...initialWebcamState,
  setWebcamPosition: (position: WebcamPosition) => {
    set(state => { state.webcamPosition = position; });
    get()._ensureActivePresetIsWritable();
  },
  setWebcamVisibility: (isVisible: boolean) => {
    set(state => { state.isWebcamVisible = isVisible; });
    get()._ensureActivePresetIsWritable();
  },
  updateWebcamStyle: (style: Partial<WebcamStyles>) => {
    set(state => {
      Object.assign(state.webcamStyles, style);
    });
    get()._ensureActivePresetIsWritable();
  },
});