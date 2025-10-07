import { ZOOM } from './constants';
import { EASING_MAP } from './easing';
import { ZoomRegion, MetaDataItem } from '../types/store';

// --- HELPER FUNCTIONS ---

/**
 * Maps a value from one range to another.
 */
function map(value: number, start1: number, stop1: number, start2: number, stop2: number): number {
  return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
}

/**
 * Linearly interpolates between two values.
 */
function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}

/**
 * Finds the index of the last metadata item with a timestamp less than or equal to the given time.
 * Uses binary search for performance optimization.
 */
const findLastMetadataIndex = (metadata: MetaDataItem[], currentTime: number): number => {
  if (metadata.length === 0) return -1;
  let left = 0;
  let right = metadata.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (metadata[mid].timestamp <= currentTime) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return result;
};

/**
 * Gets the smoothed mouse position by averaging points over a time window.
 * This helps eliminate jerky movements and creates smoother panning.
 */
const getSmoothedMousePosition = (metadata: MetaDataItem[], endTime: number, windowDuration: number): { x: number; y: number } | null => {
  const startIndex = findLastMetadataIndex(metadata, endTime);
  if (startIndex === -1) {
    return metadata.length > 0 ? { x: metadata[0].x, y: metadata[0].y } : null;
  }

  const startTime = endTime - windowDuration;
  let totalX = 0;
  let totalY = 0;
  let count = 0;

  // Loop backwards from the current position to find points within the smoothing window.
  for (let i = startIndex; i >= 0; i--) {
    const point = metadata[i];
    if (point.timestamp < startTime) {
      break; // Đã ra khỏi khoảng thời gian
    }
    totalX += point.x;
    totalY += point.y;
    count++;
  }

  if (count === 0) {
    // If no points are within the smoothing window, return the last point.
    const lastPoint = metadata[startIndex];
    return { x: lastPoint.x, y: lastPoint.y };
  }

  return { x: totalX / count, y: totalY / count };
};


/**
 * Calculates the transform-origin based on a normalized target point [-0.5, 0.5].
 * Implements edge snapping to prevent zooming outside the video frame.
 * The output is a value from 0 to 1 for CSS transform-origin.
 */
function getTransformOrigin(targetX: number, targetY: number, zoomLevel: number): { x: number; y: number } {
  // Safe boundary, transform-origin will be "stuck" to the edge when exceeded
  const boundary = 0.5 * (1 - 1 / zoomLevel);

  // Calculate the origin for the X axis
  // If the target is beyond the boundary, it will be stuck to the right edge
  // If the target is beyond the boundary, it will be stuck to the left edge
  // Otherwise, it will move freely in the middle
  let originX: number;
  if (targetX > boundary) originX = 1; // Stuck to the right edge
  else if (targetX < -boundary) originX = 0; // Stuck to the left edge
  else originX = 0.5 + targetX; // Move freely in the middle

  // Calculate the origin for the Y axis
  // If the target is beyond the boundary, it will be stuck to the bottom edge
  // If the target is beyond the boundary, it will be stuck to the top edge
  // Otherwise, it will move freely in the middle
  let originY: number;
  if (targetY > boundary) originY = 1; // Stuck to the bottom edge
  else if (targetY < -boundary) originY = 0; // Stuck to the top edge
  else originY = 0.5 + targetY; // Move freely in the middle

  return { x: originX, y: originY };
}


export const calculateZoomTransform = (
  currentTime: number,
  zoomRegions: Record<string, ZoomRegion>,
  metadata: MetaDataItem[],
  originalVideoDimensions: { width: number; height: number },
  frameContentDimensions: { width: number; height: number }
): { scale: number; translateX: number; translateY: number; transformOrigin: string } => {
  const activeRegion = Object.values(zoomRegions).find(
    r => currentTime >= r.startTime && currentTime < r.startTime + r.duration
  );

  const defaultTransform = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    transformOrigin: '50% 50%',
  };

  if (!activeRegion) return defaultTransform;

  const { startTime, duration, zoomLevel, targetX, targetY, mode } = activeRegion;
  const zoomOutStartTime = startTime + duration - ZOOM.TRANSITION_DURATION;
  const zoomInEndTime = startTime + ZOOM.TRANSITION_DURATION;

  const fixedOrigin = getTransformOrigin(targetX, targetY, zoomLevel);
  const transformOrigin = `${fixedOrigin.x * 100}% ${fixedOrigin.y * 100}%`;

  let currentScale = 1;
  let currentTranslateX = 0;
  let currentTranslateY = 0;

  // --- ZOOM-IN ---
  if (currentTime >= startTime && currentTime < zoomInEndTime) {
    const t = EASING_MAP[ZOOM.ZOOM_EASING as keyof typeof EASING_MAP](
      (currentTime - startTime) / ZOOM.TRANSITION_DURATION
    );
    currentScale = lerp(1, zoomLevel, t);
  }

  // --- PAN ---
  else if (currentTime >= zoomInEndTime && currentTime < zoomOutStartTime) {
    currentScale = zoomLevel;

    if (mode === 'auto' && metadata.length > 0 && originalVideoDimensions.width > 0) {
      // Time window to average mouse position, helps with smoother panning
      const PAN_SMOOTHING_WINDOW = 0.25; // 250ms

      // Get smoothed mouse position
      const smoothedMousePos = getSmoothedMousePosition(metadata, currentTime, PAN_SMOOTHING_WINDOW);

      if (smoothedMousePos) {
        // Normalize mouse position to [0, 1]
        const normalizedX = smoothedMousePos.x / originalVideoDimensions.width;
        const normalizedY = smoothedMousePos.y / originalVideoDimensions.height;

        // The visible ratio of the video when zoomed in (e.g., zoom 2x then only see 1/2 = 0.5)
        const visibleRatio = 1 / zoomLevel;
        
        // Calculate the maximum pan that can be performed without going outside the frame
        const maxPanX = frameContentDimensions.width * (1 - visibleRatio) / 2;
        const maxPanY = frameContentDimensions.height * (1 - visibleRatio) / 2;

        // Map the normalized mouse position to the pan range
        // When mouse is at the left edge (0), video pans to the right (maxPanX)
        // When mouse is at the right edge (1), video pans to the left (-maxPanX)
        const targetTranslateX = map(normalizedX, 0, 1, maxPanX, -maxPanX);
        const targetTranslateY = map(normalizedY, 0, 1, maxPanY, -maxPanY);

        // Divide by zoom level because translation is applied in the scaled space
        currentTranslateX = targetTranslateX / zoomLevel;
        currentTranslateY = targetTranslateY / zoomLevel;
      }
    }
  }

  // --- ZOOM-OUT ---
  else if (currentTime >= zoomOutStartTime && currentTime <= startTime + duration) {
    const t = EASING_MAP[ZOOM.ZOOM_EASING as keyof typeof EASING_MAP](
      (currentTime - zoomOutStartTime) / ZOOM.TRANSITION_DURATION
    );
    currentScale = lerp(zoomLevel, 1, t);
    
    // Keep the final pan position of the frame before zoom-out to avoid jitters
    if (mode === 'auto' && metadata.length > 0 && originalVideoDimensions.width > 0) {
        const PAN_SMOOTHING_WINDOW = 0.25;
        const smoothedMousePos = getSmoothedMousePosition(metadata, zoomOutStartTime, PAN_SMOOTHING_WINDOW);
        if (smoothedMousePos) {
            const normalizedX = smoothedMousePos.x / originalVideoDimensions.width;
            const normalizedY = smoothedMousePos.y / originalVideoDimensions.height;
            const visibleRatio = 1 / zoomLevel;
            const maxPanX = frameContentDimensions.width * (1 - visibleRatio) / 2;
            const maxPanY = frameContentDimensions.height * (1 - visibleRatio) / 2;

            const lastPanX = map(normalizedX, 0, 1, maxPanX, -maxPanX);
            const lastPanY = map(normalizedY, 0, 1, maxPanY, -maxPanY);

            // Interpolate from the final pan position to 0 when zooming out
            currentTranslateX = lerp(lastPanX / zoomLevel, 0, t);
            currentTranslateY = lerp(lastPanY / zoomLevel, 0, t);
        }
    }
  }

  return { scale: currentScale, translateX: currentTranslateX, translateY: currentTranslateY, transformOrigin };
};