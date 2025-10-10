import type { UIState, UIActions, Slice } from '../../types';

export const initialUIState: UIState = {
  theme: 'light',
  isPreviewFullScreen: false,
};

export const createUISlice: Slice<UIState, UIActions> = (set, get) => ({
  ...initialUIState,
  toggleTheme: () => {
    const newTheme = get().theme === 'dark' ? 'light' : 'dark';
    set(state => { state.theme = newTheme; });
    window.electronAPI.setSetting('appearance.theme', newTheme);
  },
  initializeSettings: async () => {
    try {
      const appearance = await window.electronAPI.getSetting<{ theme: 'light' | 'dark' }>('appearance');
      if (appearance?.theme) {
        set(state => { state.theme = appearance.theme; });
      }
    } catch (error) {
      console.error("Could not load app settings:", error);
    }
  },
  togglePreviewFullScreen: () => set(state => { state.isPreviewFullScreen = !state.isPreviewFullScreen; }),
});