// Path: src/lib/transform.ts

import { ZOOM } from './constants';
import { EASING_MAP } from './easing';
import { ZoomRegion, MetaDataItem } from '../types/store';
import { PanHelper } from './pan-helper'; // Import the new PanHelper

function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}

/**
 * Calculates the transform-origin based on a normalized target point [-0.5, 0.5].
 * Implements edge snapping to prevent zooming outside the video frame.
 * The output is a value from 0 to 1 for CSS transform-origin.
 */
function getTransformOrigin(targetX: number, targetY: number, zoomLevel: number): { x: number; y: number } {
  // The boundary for the target point before edge snapping is needed.
  // This is half the width of the non-zoomed area.
  const boundary = 0.5 * (1 - 1 / zoomLevel);

  let originX: number;
  if (targetX > boundary) {
    originX = 1; // Snap to the right edge
  } else if (targetX < -boundary) {
    originX = 0; // Snap to the left edge
  } else {
    // The origin is the target's position, converted from [-0.5, 0.5] to [0, 1].
    originX = targetX + 0.5;
  }

  let originY: number;
  if (targetY > boundary) {
    originY = 1; // Snap to the bottom edge
  } else if (targetY < -boundary) {
    originY = 0; // Snap to the top edge
  } else {
    originY = targetY + 0.5;
  }

  return { x: originX, y: originY };
}

// Helper function to find the last mouse position at or before a given time.
// Uses binary search for O(log n) lookup time since metadata is sorted by timestamp.
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

  // If no timestamp <= currentTime, return the first item
  // Otherwise return the found item or the first item if result is still -1 (shouldn't happen with the check above)
  return result === -1 ? metadata[0] : metadata[result];
};

// Instantiate PanHelper for the *current* active region's fixed origin.
let panHelper: PanHelper | null = null;

export const calculateZoomTransform = (
  currentTime: number,
  zoomRegions: Record<string, ZoomRegion>,
  metadata: MetaDataItem[],
  canvasInfo: { width: number; height: number, scale: number },
  padding: number,
  videoInfo: { width: number; height: number, scale: number },
): { scale: number; translateX: number; translateY: number; transformOrigin: string } => {
  const activeRegion = Object.values(zoomRegions).find(r => currentTime >= r.startTime && currentTime < r.startTime + r.duration);

  const defaultTransform = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    transformOrigin: '50% 50%',
  };

  if (!activeRegion) {
    return defaultTransform;
  }

  const { startTime, duration, zoomLevel, targetX, targetY, mode } = activeRegion;
  const zoomOutStartTime = startTime + duration - ZOOM.TRANSITION_DURATION;
  const zoomInEndTime = startTime + ZOOM.TRANSITION_DURATION;

  // Calculate a single, fixed transform-origin for the entire duration of the zoom
  // This `fixedOrigin` is the conceptual "center" of our zoomed viewport on the unscaled video.
  const fixedOrigin = getTransformOrigin(targetX, targetY, zoomLevel);
  const transformOrigin = `${fixedOrigin.x * 100}% ${fixedOrigin.y * 100}%`;

  let currentScale = 1;
  let currentTranslateX = 0;
  let currentTranslateY = 0;

  // --- Phase 1: ZOOM-IN ---
  if (currentTime >= startTime && currentTime < zoomInEndTime) {
    const t = EASING_MAP[ZOOM.ZOOM_EASING as keyof typeof EASING_MAP]((currentTime - startTime) / ZOOM.TRANSITION_DURATION);
    currentScale = lerp(1, zoomLevel, t);
    // No pan during zoom-in
  }
  // --- Phase 2: PAN (Hold Zoom & Follow Mouse) ---
  else if (currentTime >= zoomInEndTime && currentTime < zoomOutStartTime) {
    currentScale = zoomLevel; // Hold maximum zoom level

    if (mode === 'fixed' || !videoInfo.width || metadata.length === 0) {
      // If mode is fixed OR video dimensions are unknown, no dynamic pan.
      // Or if there's no metadata to follow.
      currentTranslateX = 0;
      currentTranslateY = 0;
    } else {
      const lastMousePos = findLastMousePosition(metadata, currentTime);
      if (lastMousePos) {
        if (!panHelper) {
          panHelper = new PanHelper(
            canvasInfo.width * canvasInfo.scale,
            canvasInfo.height * canvasInfo.scale,
            padding,
            zoomLevel,
            0.08,
            0 * canvasInfo.scale
          );
          panHelper.setImageInitialState(videoInfo.width, videoInfo.height, fixedOrigin.x, fixedOrigin.y);
          console.log('fixedOrigin', fixedOrigin)
          console.log('init', panHelper.getImageRect());
        }

        // Convert mouse position to canvas coordinates
        const imageScale = panHelper.getImageScale();
        const canvasPadding = panHelper.getPadding();
        const canvasX = lastMousePos.x + canvasPadding.pxStart;
        const canvasY = lastMousePos.y + canvasPadding.pyStart;

        console.log(`lastMousePos: ${JSON.stringify(lastMousePos)} | videoInfo: ${JSON.stringify(videoInfo)} | imageScale: ${imageScale} | canvasPadding: ${JSON.stringify(canvasPadding)} | canvasX: ${canvasX} | canvasY: ${canvasY}`);

        panHelper.updateMouse(canvasX, canvasY);

        const imageRect = panHelper.getImageRect();
        const { position } = panHelper.getDestination();

        console.log('imageRect', imageRect)
        console.log('position', position)

        currentTranslateX = position.x / imageRect.width;
        currentTranslateY = position.y / imageRect.height;

        console.log('currentTranslateX', currentTranslateX)
        console.log('currentTranslateY', currentTranslateY)

        console.log('----------------\n')

        const { position: positionBefore } = panHelper.getDestination();
        console.log('before', positionBefore)
        panHelper.tick();
        const { position: positionAfter } = panHelper.getDestination();
        console.log('after', positionAfter)
      }
    }
  }
  // --- Phase 3: ZOOM-OUT ---
  else if (currentTime >= zoomOutStartTime && currentTime <= startTime + duration) {
    const t = EASING_MAP[ZOOM.ZOOM_EASING as keyof typeof EASING_MAP]((currentTime - zoomOutStartTime) / ZOOM.TRANSITION_DURATION);
    currentScale = lerp(zoomLevel, 1, t);
    // No pan during zoom-out

    if (panHelper) {
      panHelper = null;
    }
  }

  return {
    scale: currentScale,
    translateX: currentTranslateX,
    translateY: currentTranslateY,
    transformOrigin,
  };
};