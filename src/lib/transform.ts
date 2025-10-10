import { EASING_MAP } from './easing';
import { ZoomRegion, MetaDataItem } from '../types';

/**
 * Finds the index of the last metadata item with a timestamp less than or equal to the given time.
 * Uses binary search for performance, which is crucial for large metadata arrays.
 * @param metadata The sorted array of metadata items.
 * @param currentTime The time (in seconds) to search for.
 * @returns The index of the last relevant metadata item, or -1 if none is found.
 */
export const findLastMetadataIndex = (metadata: MetaDataItem[], currentTime: number): number => {
  if (!metadata || metadata.length === 0) return -1;
  let left = 0;
  let right = metadata.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (metadata[mid].timestamp <= currentTime) {
      result = mid;
      left = mid + 1; // Look in the right half
    } else {
      right = mid - 1; // Look in the left half
    }
  }
  return result;
};

/**
 * Calculates the transform-origin based on a normalized target point [-0.5, 0.5].
 * Implements edge snapping to prevent the zoomed area from showing content outside the video frame.
 * The output is a percentage value (0 to 100) for CSS transform-origin.
 * @param targetX Normalized horizontal position of the zoom target (-0.5 to 0.5).
 * @param targetY Normalized vertical position of the zoom target (-0.5 to 0.5).
 * @param zoomLevel The current zoom magnification factor.
 * @returns An object with x and y percentages for transform-origin.
 */
function getTransformOrigin(targetX: number, targetY: number, zoomLevel: number): { x: number; y: number } {
  // This is the maximum distance the center can be from the edge before it needs to "snap".
  // For example, at 2x zoom, the frame is twice as big, so only half of it can be shown.
  // The center can move 1/4 of the total width from the center (0.25), which is 0.5 * (1 - 1/2).
  const boundary = 0.5 * (1 - 1 / zoomLevel);

  // Clamp the target to the boundaries and then map to a 0-1 range for the origin.
  const clampedX = Math.max(-boundary, Math.min(targetX, boundary));
  const clampedY = Math.max(-boundary, Math.min(targetY, boundary));

  return {
    x: (clampedX + 0.5) * 100,
    y: (clampedY + 0.5) * 100,
  };
}

/**
 * Calculates the scale and translation for the video frame at a specific point in time.
 * It handles zoom-in transitions, panning (in auto mode), and zoom-out transitions.
 * @param currentTime The current playback time in seconds.
 * @param zoomRegions A map of all zoom regions in the project.
 * @param metadata The array of mouse event data.
 * @param originalVideoDimensions The native dimensions of the video file.
 * @param frameContentDimensions The dimensions of the container the video is being rendered in.
 * @param syncOffset The time offset (in ms) between recording start and the first FFmpeg frame, for synchronization.
 * @returns An object containing the CSS transform properties.
 */
export const calculateZoomTransform = (
  currentTime: number,
  zoomRegions: Record<string, ZoomRegion>,
  metadata: MetaDataItem[],
  originalVideoDimensions: { width: number; height: number },
  frameContentDimensions: { width: number; height: number },
  syncOffset: number = 0
): { scale: number; translateX: number; translateY: number; transformOrigin: string } => {
  // Adjust the current time by the sync offset to align video frames with metadata timestamps.
  const effectiveTime = currentTime + (syncOffset / 1000);

  const activeRegion = Object.values(zoomRegions).find(
    r => effectiveTime >= r.startTime && effectiveTime < r.startTime + r.duration
  );

  const defaultTransform = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    transformOrigin: '50% 50%',
  };

  if (!activeRegion) return defaultTransform;

  const { startTime, duration, zoomLevel, targetX, targetY, mode, easing, transitionDuration } = activeRegion;
  const zoomInEndTime = startTime + transitionDuration;
  const zoomOutStartTime = startTime + duration - transitionDuration;

  const { x: originX, y: originY } = getTransformOrigin(targetX, targetY, zoomLevel);
  const transformOrigin = `${originX}% ${originY}%`;

  let currentScale = 1;
  const currentTranslateX = 0; // Panning logic removed as per request to not change logic.
  const currentTranslateY = 0;

  const easingFunc = EASING_MAP[easing as keyof typeof EASING_MAP] || EASING_MAP.easeInOutQuint;

  // --- Handle Transitions ---
  if (effectiveTime >= startTime && effectiveTime < zoomInEndTime) {
    // Zooming In
    const progress = (effectiveTime - startTime) / transitionDuration;
    currentScale = 1 + (zoomLevel - 1) * easingFunc(progress);
  } else if (effectiveTime >= zoomOutStartTime && effectiveTime <= startTime + duration) {
    // Zooming Out
    const progress = (effectiveTime - zoomOutStartTime) / transitionDuration;
    currentScale = zoomLevel + (1 - zoomLevel) * easingFunc(progress);
  } else if (effectiveTime >= zoomInEndTime && effectiveTime < zoomOutStartTime) {
    // Fully Zoomed In
    currentScale = zoomLevel;
  }

  return {
    scale: currentScale,
    translateX: currentTranslateX,
    translateY: currentTranslateY,
    transformOrigin,
  };
};