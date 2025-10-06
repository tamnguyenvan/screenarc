// Path: src/lib/transform.ts

import { ZOOM } from './constants';
import { EASING_MAP } from './easing';
import { ZoomRegion, MetaDataItem } from '../types/store';

// --- Constants for Panning ---
const PAN_EASING_FACTOR = 0.08; // How quickly the pan follows the mouse. Lower is smoother.
const MOUSE_UPDATE_THRESHOLD = 5; // Min distance (in video pixels) the mouse must move to update the pan target.

/**
 * Manages the state of the pan between animation frames.
 * This is necessary because calculateZoomTransform is a pure function called on every frame,
 * but the panning effect needs to remember its previous position to create a smooth transition.
 */
const panState = {
  currentX: 0,
  currentY: 0,
  targetX: 0,
  targetY: 0,
  lastRegionId: null as string | null,
  lastMousePos: { x: 0, y: 0 },
};

/**
 * Resets the pan state to its default (centered) position.
 * @param {boolean} immediate - If true, snaps instantly. If false, allows easing back to center.
 */
function resetPanState(immediate = false) {
  panState.targetX = 0;
  panState.targetY = 0;
  panState.lastRegionId = null;
  if (immediate) {
    panState.currentX = 0;
    panState.currentY = 0;
  }
}

function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}

/**
 * Calculates the Euclidean distance between two points.
 */
function calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Calculates the transform-origin based on a normalized target point [-0.5, 0.5].
 * Implements edge snapping to prevent zooming outside the video frame.
 * The output is a value from 0 to 1 for CSS transform-origin.
 */
function getTransformOrigin(targetX: number, targetY: number, zoomLevel: number): { x: number; y: number } {
  const boundary = 0.5 * (1 - 1 / zoomLevel);
  let originX: number;
  if (targetX > boundary) {
    originX = 1;
  } else if (targetX < -boundary) {
    originX = 0;
  } else {
    originX = targetX + 0.5;
  }
  let originY: number;
  if (targetY > boundary) {
    originY = 1;
  } else if (targetY < -boundary) {
    originY = 0;
  } else {
    originY = targetY + 0.5;
  }
  return { x: originX, y: originY };
}

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

  // If no active zoom region, ease the pan back to center.
  if (!activeRegion) {
    resetPanState(); // Set target to 0, but let current ease back.
    panState.currentX = lerp(panState.currentX, panState.targetX, PAN_EASING_FACTOR);
    panState.currentY = lerp(panState.currentY, panState.targetY, PAN_EASING_FACTOR);

    // If it's very close to center, snap it to avoid lingering micro-values.
    if (Math.abs(panState.currentX) < 0.01) panState.currentX = 0;
    if (Math.abs(panState.currentY) < 0.01) panState.currentY = 0;

    // Only return pan if it's still easing out.
    if (panState.currentX !== 0 || panState.currentY !== 0) {
      return {
        ...defaultTransform,
        translateX: (panState.currentX / videoInfo.width) * 100,
        translateY: (panState.currentY / videoInfo.height) * 100,
      }
    }
    return defaultTransform;
  }

  // If we entered a new region, reset the pan state to avoid jumps.
  if (panState.lastRegionId !== activeRegion.id) {
    resetPanState(true); // Reset immediately.
    panState.lastRegionId = activeRegion.id;
  }

  const { startTime, duration, zoomLevel, targetX, targetY, mode } = activeRegion;
  const zoomOutStartTime = startTime + duration - ZOOM.TRANSITION_DURATION;
  const zoomInEndTime = startTime + ZOOM.TRANSITION_DURATION;

  const fixedOrigin = getTransformOrigin(targetX, targetY, zoomLevel);
  const transformOrigin = `${fixedOrigin.x * 100}% ${fixedOrigin.y * 100}%`;

  let currentScale = 1;

  // --- Phase 1: ZOOM-IN ---
  if (currentTime >= startTime && currentTime < zoomInEndTime) {
    const t = EASING_MAP[ZOOM.ZOOM_EASING as keyof typeof EASING_MAP]((currentTime - startTime) / ZOOM.TRANSITION_DURATION);
    currentScale = lerp(1, zoomLevel, t);
    resetPanState(); // Keep it centered during zoom-in.
  }
  // --- Phase 2: PAN (Hold Zoom & Follow Mouse) ---
  else if (currentTime >= zoomInEndTime && currentTime < zoomOutStartTime) {
    currentScale = zoomLevel;

    if (mode === 'auto' && videoInfo.width && metadata.length > 0) {
      const lastMousePos = findLastMousePosition(metadata, currentTime);

      if (lastMousePos) {
        // Update target only if mouse moved enough to prevent jitter.
        if (calculateDistance(lastMousePos.x, lastMousePos.y, panState.lastMousePos.x, panState.lastMousePos.y) > MOUSE_UPDATE_THRESHOLD) {
            
            // 1. Calculate the size of the zoomed video on the canvas.
            const zoomedWidth = videoInfo.width * zoomLevel;
            const zoomedHeight = videoInfo.height * zoomLevel;

            // 2. Convert mouse position (video coords) to a target offset.
            // The goal is to shift the video so the mouse cursor is at the center of the viewport.
            // `(0.5 - mouseX / videoW)` gives a normalized offset.
            // Multiply by zoomed size to get pixel offset.
            const targetOffsetX = (0.5 - (lastMousePos.x / videoInfo.width)) * zoomedWidth;
            const targetOffsetY = (0.5 - (lastMousePos.y / videoInfo.height)) * zoomedHeight;
            
            // 3. Calculate max pannable distance to stay within frame boundaries.
            const maxPanX = (zoomedWidth - videoInfo.width) / 2;
            const maxPanY = (zoomedHeight - videoInfo.height) / 2;
            
            // 4. Clamp the target offset to the boundaries.
            panState.targetX = Math.max(-maxPanX, Math.min(maxPanX, targetOffsetX));
            panState.targetY = Math.max(-maxPanY, Math.min(maxPanY, targetOffsetY));

            panState.lastMousePos = { x: lastMousePos.x, y: lastMousePos.y };
        }
      }
    } else {
      // Fixed mode or no data, stay centered.
      resetPanState();
    }
  }
  // --- Phase 3: ZOOM-OUT ---
  else if (currentTime >= zoomOutStartTime && currentTime <= startTime + duration) {
    const t = EASING_MAP[ZOOM.ZOOM_EASING as keyof typeof EASING_MAP]((currentTime - zoomOutStartTime) / ZOOM.TRANSITION_DURATION);
    currentScale = lerp(zoomLevel, 1, t);
    resetPanState(); // Ease back to center during zoom-out.
  }

  // --- Apply Easing to Pan ---
  panState.currentX = lerp(panState.currentX, panState.targetX, PAN_EASING_FACTOR);
  panState.currentY = lerp(panState.currentY, panState.targetY, PAN_EASING_FACTOR);

  // Return values as percentages for the renderer
  const translateXPercent = (panState.currentX / videoInfo.width) * 100;
  const translateYPercent = (panState.currentY / videoInfo.height) * 100;

  return {
    scale: currentScale,
    translateX: translateXPercent,
    translateY: translateYPercent,
    transformOrigin,
  };
};