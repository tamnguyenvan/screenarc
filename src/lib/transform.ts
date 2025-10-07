import { ZOOM } from './constants';
import { EASING_MAP } from './easing';
import { ZoomRegion, MetaDataItem } from '../types/store';

function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}

/**
 * Calculates the Euclidean distance between two points.
 */
const calculateDistance = (x1: number, y1: number, x2: number, y2: number): number => {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
};

/**
 * Calculates the transform-origin based on a normalized target point [-0.5, 0.5].
 * Implements edge snapping to prevent zooming outside the video frame.
 * The output is a value from 0 to 1 for CSS transform-origin.
 */
function getTransformOrigin(targetX: number, targetY: number, zoomLevel: number): { x: number; y: number } {
  const boundary = 0.5 * (1 - 1 / zoomLevel);
  let originX: number;
  if (targetX > boundary) originX = 1;
  else if (targetX < -boundary) originX = 0;
  else originX = targetX + 0.5;

  let originY: number;
  if (targetY > boundary) originY = 1;
  else if (targetY < -boundary) originY = 0;
  else originY = targetY + 0.5;

  return { x: originX, y: originY };
}

// Helper: binary search to find last metadata <= current time
const findLastMousePosition = (metadata: MetaDataItem[], currentTime: number): MetaDataItem | null => {
  if (metadata.length === 0) return null;
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

  return result === -1 ? metadata[0] : metadata[result];
};

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
      const PAN_TRANSITION_DURATION = 0.5;
      const PAN_THRESHOLD_PERCENT = 0.01;

      const panStartMousePos = findLastMousePosition(metadata, zoomInEndTime);
      const currentMousePos = findLastMousePosition(metadata, currentTime);

      if (panStartMousePos && currentMousePos) {
        const panDistance = calculateDistance(
          panStartMousePos.x, panStartMousePos.y, currentMousePos.x, currentMousePos.y
        );

        const panThreshold = PAN_THRESHOLD_PERCENT * originalVideoDimensions.width;
        if (panDistance > panThreshold) {
          const deltaX = currentMousePos.x - panStartMousePos.x;
          const deltaY = currentMousePos.y - panStartMousePos.y;

          const scaleFactorX = frameContentDimensions.width / originalVideoDimensions.width;
          const scaleFactorY = frameContentDimensions.height / originalVideoDimensions.height;

          let targetTranslateX = -deltaX * scaleFactorX;
          let targetTranslateY = -deltaY * scaleFactorY;

          const panElapsedTime = currentTime - zoomInEndTime;
          if (panElapsedTime < PAN_TRANSITION_DURATION) {
            const t = EASING_MAP['easeInOutCubic'](panElapsedTime / PAN_TRANSITION_DURATION);
            targetTranslateX = lerp(0, targetTranslateX, t);
            targetTranslateY = lerp(0, targetTranslateY, t);
          }

          const maxPanX = (frameContentDimensions.width * (zoomLevel - 1)) / 2;
          const maxPanY = (frameContentDimensions.height * (zoomLevel - 1)) / 2;

          const clampedTranslateX = Math.max(-maxPanX, Math.min(targetTranslateX, maxPanX));
          const clampedTranslateY = Math.max(-maxPanY, Math.min(targetTranslateY, maxPanY));

          currentTranslateX = clampedTranslateX / zoomLevel;
          currentTranslateY = clampedTranslateY / zoomLevel;
        }
      }
    }
  }

  // --- ZOOM-OUT ---
  else if (currentTime >= zoomOutStartTime && currentTime <= startTime + duration) {
    const t = EASING_MAP[ZOOM.ZOOM_EASING as keyof typeof EASING_MAP](
      (currentTime - zoomOutStartTime) / ZOOM.TRANSITION_DURATION
    );
    currentScale = lerp(zoomLevel, 1, t);
  }

  return { scale: currentScale, translateX: currentTranslateX, translateY: currentTranslateY, transformOrigin };
};
