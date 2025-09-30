import { useEffect, useCallback } from 'react';

// Key format: 'key' or 'modifier+key' e.g., 'Delete', 'ctrl+z', 'ctrl+shift+z'
type ShortcutMap = { [key: string]: (event: KeyboardEvent) => void };

export function useKeyboardShortcuts(shortcuts: ShortcutMap, deps: React.DependencyList = []) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    const key = event.key.toLowerCase();
    const platformModifier = event.metaKey || event.ctrlKey; // metaKey for Cmd on Mac, ctrlKey for Ctrl

    let shortcutKey: string | null = null;
    
    // Check for combinations with modifiers
    if (platformModifier) {
      const parts = ['ctrl']; // Normalize to 'ctrl' for simplicity
      if (event.shiftKey) {
        parts.push('shift');
      }
      // Add key if it's not a modifier itself
      if (key !== 'control' && key !== 'meta' && key !== 'shift') {
        parts.push(key);
        shortcutKey = parts.join('+');
      }
    } 
    // Check for single key presses without any modifiers
    else if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      shortcutKey = key;
    }

    if (shortcutKey && shortcuts[shortcutKey]) {
      event.preventDefault();
      shortcuts[shortcutKey](event);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts, ...deps]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}