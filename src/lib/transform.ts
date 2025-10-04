// Path: src/lib/transform.ts

import { ZOOM } from './constants';
import { EASING_MAP } from './easing';
import { ZoomRegion } from '../types/store';

function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}

/**
 * Calculates the transform-origin based on a normalized anchor point [-0.5, 0.5].
 * Implements edge snapping to prevent zooming outside the video frame.
 * The output is a value from 0 to 1 for CSS transform-origin.
 */
function getTransformOrigin(anchorX: number, anchorY: number, zoomLevel: number): { x: number; y: number } {
  // The boundary for the anchor point before edge snapping is needed.
  // This is half the width of the non-zoomed area.
  const boundary = 0.5 * (1 - 1 / zoomLevel);

  let originX: number;
  if (anchorX > boundary) {
    originX = 1; // Snap to the right edge
  } else if (anchorX < -boundary) {
    originX = 0; // Snap to the left edge
  } else {
    // The origin is the anchor's position, converted from [-0.5, 0.5] to [0, 1].
    originX = anchorX + 0.5;
  }

  let originY: number;
  if (anchorY > boundary) {
    originY = 1; // Snap to the bottom edge
  } else if (anchorY < -boundary) {
    originY = 0; // Snap to the top edge
  } else {
    originY = anchorY + 0.5;
  }

  return { x: originX, y: originY };
}

export const calculateZoomTransform = (
  currentTime: number,
  zoomRegions: Record<string, ZoomRegion>,
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

  const { startTime, duration, zoomLevel, targetX, targetY } = activeRegion;
  const zoomOutStartTime = startTime + duration - ZOOM.TRANSITION_DURATION;
  const zoomInEndTime = startTime + ZOOM.TRANSITION_DURATION;

  // Calculate a single, fixed transform-origin for the entire duration of the zoom
  const fixedOrigin = getTransformOrigin(targetX, targetY, zoomLevel);
  const transformOrigin = `${fixedOrigin.x * 100}% ${fixedOrigin.y * 100}%`;

  // --- Phase 1: ZOOM-IN ---
  if (currentTime >= startTime && currentTime < zoomInEndTime) {
    const t = EASING_MAP[ZOOM.ZOOM_EASING as keyof typeof EASING_MAP]((currentTime - startTime) / ZOOM.TRANSITION_DURATION);
    const scale = lerp(1, zoomLevel, t);
    return {
      scale,
      translateX: 0,
      translateY: 0,
      transformOrigin,
    };
  }

  // --- Phase 2: STATIC ZOOM (previously PAN) ---
  if (currentTime >= zoomInEndTime && currentTime < zoomOutStartTime) {
    // Hold the zoom at the target level without any panning
    return {
      scale: zoomLevel,
      translateX: 0,
      translateY: 0,
      transformOrigin,
    };
  }

  // --- Phase 3: ZOOM-OUT ---
  if (currentTime >= zoomOutStartTime && currentTime <= startTime + duration) {
    const t = EASING_MAP[ZOOM.ZOOM_EASING as keyof typeof EASING_MAP]((currentTime - zoomOutStartTime) / ZOOM.TRANSITION_DURATION);
    const scale = lerp(zoomLevel, 1, t);
    return {
      scale,
      translateX: 0,
      translateY: 0,
      transformOrigin,
    };
  }

  // --- Phase 4: DEFAULT ---
  return defaultTransform;
};