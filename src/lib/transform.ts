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
 * Clamps a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

function getSmoothedMousePosition(
  metadata: MetaDataItem[],
  currentTime: number,
  windowDuration: number
): { x: number; y: number } | null {
  if (!metadata || metadata.length === 0) return null;

  // Tìm vị trí bắt đầu (mẫu đầu tiên >= currentTime)
  let startIndex = -1;
  for (let i = 0; i < metadata.length; i++) {
    if (metadata[i].timestamp >= currentTime) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    // Không có dữ liệu tương lai -> dùng sample cuối cùng
    return {
      x: metadata[metadata.length - 1].x,
      y: metadata[metadata.length - 1].y,
    };
  }

  const endTime = currentTime + windowDuration;

  let totalX = 0;
  let totalY = 0;
  let count = 0;

  for (let i = startIndex; i < metadata.length; i++) {
    const point = metadata[i];
    if (point.timestamp > endTime) break;
    totalX += point.x;
    totalY += point.y;
    count++;
  }

  if (count > 0) {
    return {
      x: totalX / count,
      y: totalY / count,
    };
  }

  // Nếu không có sample nào trong window -> fallback mẫu đầu tiên sau currentTime
  return { x: metadata[startIndex].x, y: metadata[startIndex].y };
}


/**
 * Calculates the transform-origin based on a normalized target point [-0.5, 0.5].
 * Implements edge snapping to prevent zooming outside the video frame.
 * The output is a value from 0 to 1 for CSS transform-origin.
 */
function getTransformOrigin(targetX: number, targetY: number, zoomLevel: number): { x: number; y: number } {
  // Safe boundary, transform-origin will be "stuck" to the edge when exceeded
  const boundary = 0.5 * (1 - 1 / zoomLevel);

  let originX: number;
  if (targetX > boundary) originX = 1;
  else if (targetX < -boundary) originX = 0;
  else originX = 0.5 + targetX;

  let originY: number;
  if (targetY > boundary) originY = 1;
  else if (targetY < -boundary) originY = 0;
  else originY = 0.5 + targetY;

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

  const { startTime, duration, zoomLevel, targetX, targetY, mode, easing, transitionDuration } = activeRegion;
  const zoomOutStartTime = startTime + duration - transitionDuration;
  const zoomInEndTime = startTime + transitionDuration;

  const fixedOrigin = getTransformOrigin(targetX, targetY, zoomLevel);
  const transformOrigin = `${fixedOrigin.x * 100}% ${fixedOrigin.y * 100}%`;

  let currentScale = 1;
  let currentTranslateX = 0;
  let currentTranslateY = 0;

  // --- ZOOM-IN ---
  if (currentTime >= startTime && currentTime < zoomInEndTime) {
    const t = (EASING_MAP[easing as keyof typeof EASING_MAP] || EASING_MAP.easeInOutQuint)(
      (currentTime - startTime) / transitionDuration
    );
    currentScale = lerp(1, zoomLevel, t);
  }

  // --- PAN ---
  else if (currentTime >= zoomInEndTime && currentTime < zoomOutStartTime) {
    currentScale = zoomLevel;

    if (mode === 'auto' && metadata.length > 0 && originalVideoDimensions.width > 0) {
      const PAN_SMOOTHING_WINDOW = 0.25;
      const smoothedMousePos = getSmoothedMousePosition(metadata, currentTime, PAN_SMOOTHING_WINDOW);

      if (smoothedMousePos) {
        // // Mouse position in original video coordinates (pixels)
        // const mouseX = smoothedMousePos.x;
        // const mouseY = smoothedMousePos.y;

        // // Normalize mouse position to [0, 1] in original video space
        // const normalizedX = Math.max(0, Math.min(1, mouseX / originalVideoDimensions.width));
        // const normalizedY = Math.max(0, Math.min(1, mouseY / originalVideoDimensions.height));

        // const maxPanXLeft = frameContentDimensions.width * fixedOrigin.x * (1 - 1 / zoomLevel) / 2;
        // const maxPanXRight = frameContentDimensions.width * (1 - fixedOrigin.x) * (1 - 1 / zoomLevel) / 2;
        // const maxPanYTop = frameContentDimensions.height * fixedOrigin.y * (1 - 1 / zoomLevel) / 2;
        // const maxPanYBottom = frameContentDimensions.height * (1 - fixedOrigin.y) * (1 - 1 / zoomLevel) / 2;

        // const clampedX = Math.max(0, Math.min(1, normalizedX));
        // const clampedY = Math.max(0, Math.min(1, normalizedY));
        // console.log(`mouseX: ${mouseX}, mouseY: ${mouseY} | normalizedX: ${normalizedX}, normalizedY: ${normalizedY} | clampedX: ${clampedX}, clampedY: ${clampedY}`)
        // console.log(`maxPanXLeft: ${maxPanXLeft}, maxPanXRight: ${maxPanXRight}, maxPanYTop: ${maxPanYTop}, maxPanYBottom: ${maxPanYBottom}`)
        // const targetTranslateX = map(clampedX, 0, 1, -maxPanXRight, maxPanXLeft);
        // const targetTranslateY = map(clampedY, 0, 1, -maxPanYBottom, maxPanYTop);

        // currentTranslateX = targetTranslateX / zoomLevel;
        // currentTranslateY = targetTranslateY / zoomLevel;
      }
    }
  }

  // --- ZOOM-OUT ---
  else if (currentTime >= zoomOutStartTime && currentTime <= startTime + duration) {
    const t = (EASING_MAP[easing as keyof typeof EASING_MAP] || EASING_MAP.easeInOutQuint)(
      (currentTime - zoomOutStartTime) / transitionDuration
    );
    currentScale = lerp(zoomLevel, 1, t);
  }

  return { scale: currentScale, translateX: currentTranslateX, translateY: currentTranslateY, transformOrigin };
};