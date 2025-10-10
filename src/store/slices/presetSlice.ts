import { APP } from '../../lib/constants';
import type { PresetState, PresetActions, Slice } from '../../types';
import type { Preset, FrameStyles, WebcamStyles, WebcamPosition } from '../../types';
import { initialFrameState } from './frameSlice';
import { initialWebcamState } from './webcamSlice';

const DEFAULT_PRESET_ID = 'default-preset-v1';

const DEFAULT_PRESET_STYLES: FrameStyles = initialFrameState.frameStyles;
const DEFAULT_WEBCAM_STYLES: WebcamStyles = initialWebcamState.webcamStyles;
const DEFAULT_WEBCAM_POSITION: WebcamPosition = initialWebcamState.webcamPosition;

const DEFAULT_PRESET_TEMPLATE: Omit<Preset, 'id' | 'name'> = {
  styles: DEFAULT_PRESET_STYLES,
  aspectRatio: '16:9',
  isDefault: true,
  webcamStyles: DEFAULT_WEBCAM_STYLES,
  webcamPosition: DEFAULT_WEBCAM_POSITION,
  isWebcamVisible: false,
};

export const initialPresetState: PresetState = {
  presets: {},
  activePresetId: null,
  presetSaveStatus: 'idle',
};

export const createPresetSlice: Slice<PresetState, PresetActions> = (set, get) => ({
  ...initialPresetState,
  initializePresets: async () => {
    try {
      const loadedPresets = await window.electronAPI.getSetting<Record<string, Preset>>('presets') || {};

      loadedPresets[DEFAULT_PRESET_ID] = {
        id: DEFAULT_PRESET_ID,
        name: 'Default',
        ...JSON.parse(JSON.stringify(DEFAULT_PRESET_TEMPLATE))
      };

      let wasModified = false;
      Object.values(loadedPresets).forEach(p => {
        if (p.id !== DEFAULT_PRESET_ID && p.isDefault) {
          delete p.isDefault;
          wasModified = true;
        }
        if (p.styles && p.styles.borderColor === undefined) {
          p.styles.borderColor = DEFAULT_PRESET_STYLES.borderColor;
          wasModified = true;
        }
        if (p.webcamStyles && p.webcamStyles.shape === undefined) {
          p.webcamStyles.shape = 'circle';
          wasModified = true;
        }
        if (p.webcamStyles && p.webcamStyles.borderRadius === undefined) {
          p.webcamStyles.borderRadius = 50;
          wasModified = true;
        }
      });

      if (wasModified) {
        await window.electronAPI.setSetting('presets', loadedPresets);
      }

      const lastId = localStorage.getItem(APP.LAST_PRESET_ID_KEY);
      const activeId = (lastId && loadedPresets[lastId]) ? lastId : DEFAULT_PRESET_ID;

      set(state => {
        state.presets = loadedPresets;
        state.activePresetId = activeId;
      });

      get().applyPreset(activeId);

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
        if (preset.webcamStyles) state.webcamStyles = JSON.parse(JSON.stringify(preset.webcamStyles));
        if (preset.webcamPosition) state.webcamPosition = JSON.parse(JSON.stringify(preset.webcamPosition));
        if (preset.isWebcamVisible !== undefined) state.isWebcamVisible = preset.isWebcamVisible;
      });
      localStorage.setItem(APP.LAST_PRESET_ID_KEY, id);
    }
  },
  resetPreset: (id) => {
    set(state => {
      const presetToReset = state.presets[id];
      if (presetToReset?.isDefault) {
        presetToReset.styles = JSON.parse(JSON.stringify(DEFAULT_PRESET_TEMPLATE.styles));
        presetToReset.aspectRatio = DEFAULT_PRESET_TEMPLATE.aspectRatio;
        presetToReset.webcamStyles = JSON.parse(JSON.stringify(DEFAULT_PRESET_TEMPLATE.webcamStyles));
        presetToReset.webcamPosition = JSON.parse(JSON.stringify(DEFAULT_PRESET_TEMPLATE.webcamPosition));
        presetToReset.isWebcamVisible = DEFAULT_PRESET_TEMPLATE.isWebcamVisible;
        if (state.activePresetId === id) get().applyPreset(id);
      }
    });
    get()._persistPresets(get().presets);
  },
  _ensureActivePresetIsWritable: () => {
    const { activePresetId, presets } = get();
    if (activePresetId && presets[activePresetId]?.isDefault) {
      const newId = `preset-${Date.now()}`;
      const newPreset: Preset = {
        ...JSON.parse(JSON.stringify(presets[activePresetId])),
        id: newId,
        name: 'Custom Preset',
        isDefault: false,
      };
      set(state => {
        state.presets[newId] = newPreset;
        state.activePresetId = newId;
      });
      localStorage.setItem(APP.LAST_PRESET_ID_KEY, newId);
    }
    get().updateActivePreset();
  },

  _persistPresets: async (presets: Record<string, Preset>) => {
    try {
      set(state => { state.presetSaveStatus = 'saving'; });
      await window.electronAPI.setSetting('presets', presets);
      set(state => { state.presetSaveStatus = 'saved'; });
      setTimeout(() => {
        if (get().presetSaveStatus === 'saved') {
          set(state => { state.presetSaveStatus = 'idle'; });
        }
      }, 1500);
    } catch (error) {
      console.error("Failed to save presets:", error);
      set(state => { state.presetSaveStatus = 'idle'; });
    }
  },

  updatePresetName: (id, name) => {
    set(state => {
      const preset = state.presets[id];
      if (preset && !preset.isDefault) {
        preset.name = name;
      }
    });
    get()._persistPresets(get().presets);
  },
  saveCurrentStyleAsPreset: (name) => {
    const id = `preset-${Date.now()}`;
    const { frameStyles, aspectRatio, webcamPosition, webcamStyles, isWebcamVisible } = get();
    const newPreset: Preset = {
      id,
      name,
      styles: JSON.parse(JSON.stringify(frameStyles)),
      aspectRatio,
      isDefault: false,
      webcamPosition: JSON.parse(JSON.stringify(webcamPosition)),
      webcamStyles: JSON.parse(JSON.stringify(webcamStyles)),
      isWebcamVisible,
    };
    set(state => {
      state.presets[id] = newPreset;
      state.activePresetId = id;
    });
    localStorage.setItem(APP.LAST_PRESET_ID_KEY, id);
    get()._persistPresets(get().presets);
  },
  updateActivePreset: () => {
    const { activePresetId, presets, frameStyles, aspectRatio, webcamPosition, webcamStyles, isWebcamVisible } = get();
    if (activePresetId && presets[activePresetId]) {
      set(state => {
        const active = state.presets[activePresetId];
        active.styles = JSON.parse(JSON.stringify(frameStyles));
        active.aspectRatio = aspectRatio;
        active.webcamPosition = JSON.parse(JSON.stringify(webcamPosition));
        active.webcamStyles = JSON.parse(JSON.stringify(webcamStyles));
        active.isWebcamVisible = isWebcamVisible;
      });
      get()._persistPresets(get().presets);
    }
  },
  deletePreset: (id) => {
    if (get().presets[id]?.isDefault || id === DEFAULT_PRESET_ID) return;
    set(state => {
      delete state.presets[id];
      if (state.activePresetId === id) get().applyPreset(DEFAULT_PRESET_ID);
    });
    get()._persistPresets(get().presets);
  },
});

// Import useEditorStore late to avoid circular dependency
// let useEditorStore: any;
// setTimeout(() => {
//   useEditorStore = require('../editorStore').useEditorStore;
// }, 0);