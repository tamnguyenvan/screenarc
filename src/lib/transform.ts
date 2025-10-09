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
export const findLastMetadataIndex = (metadata: MetaDataItem[], currentTime: number): number => {
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
      // -------------------------------
      // Stateless PAN implementation
      // - Start of pan (t == zoomInEndTime) => translate = 0
      // - For t > zoomInEndTime => compute EMA-like smoothing
      //   using only metadata timestamps >= zoomInEndTime up to currentTime
      // - Uses exponential kernel that matches iterative easing:
      //     y[n] = y[n-1] + alpha*(x[n] - y[n-1])
      //   Equivalent closed-form (weighted sum) is applied here so function is stateless.
      // -------------------------------

      // Parameters: can be overridden in zoomRegion (optional)
      const panEase = (activeRegion as any).panEase ?? 0.08; // default = demo's 0.08
      const frameDt = 1 / 60; // assume 60 FPS for discrete alpha -> continuous mapping
      const weightBase = Math.max(0, 1 - panEase); // base for exponential weights
      const panWindowSec = (activeRegion as any).panWindowSec ?? 3.0; // how far back to consider (safety)

      const panStart = zoomInEndTime;
      const elapsedPan = currentTime - panStart;

      // If we are exactly at panStart (no time elapsed), initial state must be scaled but not panned.
      if (elapsedPan <= 0) {
        currentTranslateX = 0;
        currentTranslateY = 0;
      } else {
        // Helper: build list of metadata samples to consider (timestamps in [panStart, currentTime])
        // Also include an interpolated sample exactly at currentTime (if possible)
        const samples: MetaDataItem[] = [];

        // gather samples in window
        const windowStart = Math.max(panStart, currentTime - panWindowSec);
        for (let i = 0; i < metadata.length; i++) {
          const m = metadata[i];
          if (m.timestamp >= windowStart && m.timestamp <= currentTime) samples.push(m);
        }

        // ensure we include an interpolated sample at currentTime (important for responsiveness)
        const lastIdx = findLastMetadataIndex(metadata, currentTime);
        if (lastIdx >= 0) {
          const a = metadata[lastIdx];
          const b = metadata[lastIdx + 1];
          if (b && b.timestamp > a.timestamp) {
            const alpha = clamp((currentTime - a.timestamp) / (b.timestamp - a.timestamp), 0, 1);
            const interp: MetaDataItem = {
              ...a,
              timestamp: currentTime,
              x: lerp(a.x, b.x, alpha),
              y: lerp(a.y, b.y, alpha),
            } as MetaDataItem;
            samples.push(interp);
          } else if (!samples.some(s => s.timestamp === a.timestamp)) {
            // if last sample is exactly at currentTime or earlier but not included, add it
            if (a.timestamp >= windowStart) samples.push(a);
          }
        }

        if (samples.length === 0) {
          // no new tracking information since panStart -> stay at origin
          currentTranslateX = 0;
          currentTranslateY = 0;
        } else {
          // precompute some frequently used values
          const W = frameContentDimensions.width;
          const H = frameContentDimensions.height;
          const originPxX_local = fixedOrigin.x * W;
          const originPxY_local = fixedOrigin.y * H;
          const centerX = W / 2;
          const centerY = H / 2;

          // clamp window and compute weighted average of instantaneous targets
          let sumWx = 0, sumW = 0;
          let sumWy = 0;

          for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            // ignore samples earlier than panStart (shouldn't happen given selection), but guard:
            if (s.timestamp < panStart) continue;

            // compute normalized coordinates from metadata (supports pixels or normalized)
            let nx = (s as any).x ?? 0;
            let ny = (s as any).y ?? 0;
            if (nx > 1 || ny > 1) {
              // assume pixel coords
              nx = nx / originalVideoDimensions.width;
              ny = ny / originalVideoDimensions.height;
            }
            nx = clamp(nx, 0, 1);
            ny = clamp(ny, 0, 1);

            // map to content-local pixel coordinates
            const pX = nx * W;
            const pY = ny * H;

            // instantaneous target translate (content-space) that would bring p to center
            // formula: t = (center - o)/s - (p - o)
            const tgtTX = (centerX - originPxX_local) / zoomLevel - (pX - originPxX_local);
            const tgtTY = (centerY - originPxY_local) / zoomLevel - (pY - originPxY_local);

            // weight by exponential kernel anchored at currentTime
            const ageSec = Math.max(0, currentTime - s.timestamp);
            const exponent = ageSec / frameDt;
            // weightBase ^ exponent approximates (1 - alpha)^{n} where n = ageFrames
            const w = Math.pow(weightBase, exponent);

            sumWx += tgtTX * w;
            sumWy += tgtTY * w;
            sumW += w;
          }

          let smoothedTX = 0, smoothedTY = 0;
          if (sumW > 0) {
            smoothedTX = sumWx / sumW;
            smoothedTY = sumWy / sumW;
          } else {
            smoothedTX = 0;
            smoothedTY = 0;
          }

          // Compute pan clamp bounds so video never exposes background
          // panFactor = 1 - 1/scale  (scale = zoomLevel)
          const panFactor = 1 - 1 / zoomLevel;
          const minTX = panFactor * (originPxX_local - W);
          const maxTX = panFactor * originPxX_local;
          const minTY = panFactor * (originPxY_local - H);
          const maxTY = panFactor * originPxY_local;

          currentTranslateX = clamp(smoothedTX, minTX, maxTX);
          currentTranslateY = clamp(smoothedTY, minTY, maxTY);
        }
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