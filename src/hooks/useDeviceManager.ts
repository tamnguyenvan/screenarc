import { useState, useEffect, useCallback } from 'react';

type Device = { id: string; name: string; };

/**
 * Custom hook to manage loading and reloading of media devices (webcams, microphones).
 * It handles platform-specific logic (dshow on Windows) and provides a unified interface.
 *
 * @returns An object containing device lists, loading status, platform info, and a reload function.
 */
export const useDeviceManager = () => {
  const [platform, setPlatform] = useState<NodeJS.Platform | null>(null);
  const [webcams, setWebcams] = useState<Device[]>([]);
  const [mics, setMics] = useState<Device[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);

  /**
   * Fetches devices of a specific kind, handling platform differences.
   */
  const fetchDevices = useCallback(async (kind: 'videoinput' | 'audioinput') => {
    const currentPlatform = platform ?? (await window.electronAPI.getPlatform());
    if (!platform) setPlatform(currentPlatform);

    if (currentPlatform === 'win32') {
      const { video, audio } = await window.electronAPI.getDshowDevices();
      return (kind === 'videoinput' ? video : audio).map(d => ({ id: d.alternativeName, name: d.name }));
    }

    try {
      // Request permission to ensure device labels are available
      const stream = await navigator.mediaDevices.getUserMedia({ [kind === 'videoinput' ? 'video' : 'audio']: true });
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      console.warn(`Could not get media permissions for ${kind}:`, err);
    }
    const allDevices = await navigator.mediaDevices.enumerateDevices();
    return allDevices
      .filter(d => d.kind === kind)
      .map(d => ({ id: d.deviceId, name: d.label || `Unnamed ${kind === 'videoinput' ? 'Webcam' : 'Microphone'}` }));
  }, [platform]);

  /**
   * Loads all devices concurrently.
   */
  const loadAll = useCallback(async () => {
    setIsInitializing(true);
    try {
      const [fetchedWebcams, fetchedMics] = await Promise.all([
        fetchDevices('videoinput'),
        fetchDevices('audioinput')
      ]);
      setWebcams(fetchedWebcams);
      setMics(fetchedMics);
    } catch (error) {
      console.error("Failed to load devices:", error);
    } finally {
      setIsInitializing(false);
    }
  }, [fetchDevices]);

  // Initial load on mount
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return { platform, webcams, mics, isInitializing, reload: loadAll };
};