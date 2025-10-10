import { CursorImage, EditorState } from '../types';
import { calculateZoomTransform } from './transform';
import { findLastMetadataIndex } from './transform';
import { EFFECTS } from './constants';
import { EASING_MAP } from './easing';

type RenderableState = Pick<
  EditorState,
  | 'frameStyles'
  | 'videoDimensions'
  | 'aspectRatio'
  | 'webcamPosition'
  | 'webcamStyles'
  | 'isWebcamVisible'
  | 'zoomRegions'
  | 'metadata'
  | 'recordingGeometry'
  | 'cursorImages'
  | 'syncOffset'
>;

/**
 * Draws the background with optimized rendering
 */
const drawBackground = async (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  backgroundState: EditorState['frameStyles']['background'],
  preloadedImage: HTMLImageElement | null
): Promise<void> => {
  ctx.clearRect(0, 0, width, height);

  switch (backgroundState.type) {
    case 'color':
      ctx.fillStyle = backgroundState.color || '#000000';
      ctx.fillRect(0, 0, width, height);
      break;
    case 'gradient': {
      const start = backgroundState.gradientStart || '#000000';
      const end = backgroundState.gradientEnd || '#ffffff';
      const direction = backgroundState.gradientDirection || 'to right';
      let gradient;

      if (direction.startsWith('circle')) {
        gradient = ctx.createRadialGradient(
          width / 2, height / 2, 0,
          width / 2, height / 2, Math.max(width, height) / 2
        );
        if (direction === 'circle-in') {
          gradient.addColorStop(0, end);
          gradient.addColorStop(1, start);
        } else {
          gradient.addColorStop(0, start);
          gradient.addColorStop(1, end);
        }
      } else {
        const getCoords = (dir: string) => {
          switch (dir) {
            case 'to bottom': return [0, 0, 0, height];
            case 'to top': return [0, height, 0, 0];
            case 'to right': return [0, 0, width, 0];
            case 'to left': return [width, 0, 0, 0];
            case 'to bottom right': return [0, 0, width, height];
            case 'to bottom left': return [width, 0, 0, height];
            case 'to top right': return [0, height, width, 0];
            case 'to top left': return [width, height, 0, 0];
            default: return [0, 0, width, 0];
          }
        };
        const coords = getCoords(direction);
        gradient = ctx.createLinearGradient(coords[0], coords[1], coords[2], coords[3]);
        gradient.addColorStop(0, start);
        gradient.addColorStop(1, end);
      }

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      break;
    }
    case 'image':
    case 'wallpaper': {
      if (preloadedImage && preloadedImage.complete) {
        const img = preloadedImage;
        const imgRatio = img.width / img.height;
        const canvasRatio = width / height;
        let sx, sy, sWidth, sHeight;

        if (imgRatio > canvasRatio) {
          sHeight = img.height;
          sWidth = sHeight * canvasRatio;
          sx = (img.width - sWidth) / 2;
          sy = 0;
        } else {
          sWidth = img.width;
          sHeight = sWidth / canvasRatio;
          sx = 0;
          sy = (img.height - sHeight) / 2;
        }
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, width, height);
      } else {
        ctx.fillStyle = 'oklch(0.2077 0.0398 265.7549)';
        ctx.fillRect(0, 0, width, height);
      }
      break;
    }
    default:
      ctx.fillStyle = 'oklch(0.2077 0.0398 265.7549)';
      ctx.fillRect(0, 0, width, height);
  }
};

/**
 * Main rendering function with enhanced visuals
 */
export const drawScene = async (
  ctx: CanvasRenderingContext2D,
  state: RenderableState,
  videoElement: HTMLVideoElement,
  webcamVideoElement: HTMLVideoElement | null,
  currentTime: number,
  outputWidth: number,
  outputHeight: number,
  preloadedBgImage: HTMLImageElement | null,
): Promise<void> => {
  if (!state.videoDimensions.width || !state.videoDimensions.height) return;

  // Enable high-quality rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // --- 1. Draw Background ---
  await drawBackground(ctx, outputWidth, outputHeight, state.frameStyles.background, preloadedBgImage);

  // --- 2. Calculate Frame and Content Dimensions ---
  const { frameStyles, videoDimensions } = state;
  const paddingPercent = frameStyles.padding / 100;
  const availableWidth = outputWidth * (1 - 2 * paddingPercent);
  const availableHeight = outputHeight * (1 - 2 * paddingPercent);
  const videoAspectRatio = videoDimensions.width / videoDimensions.height;

  let frameContentWidth, frameContentHeight;
  if (availableWidth / availableHeight > videoAspectRatio) {
    frameContentHeight = availableHeight;
    frameContentWidth = frameContentHeight * videoAspectRatio;
  } else {
    frameContentWidth = availableWidth;
    frameContentHeight = frameContentWidth / videoAspectRatio;
  }

  const frameX = (outputWidth - frameContentWidth) / 2;
  const frameY = (outputHeight - frameContentHeight) / 2;

  // --- 3. Main video frame transform and drawing ---
  ctx.save();

  const { scale, translateX, translateY, transformOrigin } = calculateZoomTransform(
    currentTime,
    state.zoomRegions,
    state.metadata,
    state.videoDimensions,
    { width: frameContentWidth, height: frameContentHeight },
    state.syncOffset
  );
  const [originXStr, originYStr] = transformOrigin.split(' ');
  const originXMul = parseFloat(originXStr) / 100;
  const originYMul = parseFloat(originYStr) / 100;
  const originPxX = originXMul * frameContentWidth;
  const originPxY = originYMul * frameContentHeight;

  ctx.translate(frameX, frameY);
  ctx.translate(originPxX, originPxY);
  ctx.scale(scale, scale);
  ctx.translate(translateX, translateY);
  ctx.translate(-originPxX, -originPxY);

  const { shadowBlur, shadowOffsetX, shadowOffsetY, borderRadius, shadowColor, borderWidth, borderColor } = frameStyles;

  // Draw shadow if needed
  if (shadowBlur > 0) {
    ctx.save();
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = shadowOffsetX;
    ctx.shadowOffsetY = shadowOffsetY;
    const shadowPath = new Path2D();
    shadowPath.roundRect(0, 0, frameContentWidth, frameContentHeight, borderRadius);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill(shadowPath);
    ctx.restore();
  }

  // Draw the video and border
  ctx.save();
  const path = new Path2D();
  path.roundRect(0, 0, frameContentWidth, frameContentHeight, borderRadius);
  ctx.clip(path);
  ctx.drawImage(videoElement, 0, 0, frameContentWidth, frameContentHeight);

  // Draw border on top of the video content
  if (borderWidth > 0) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth * 2;
    ctx.stroke(path);
  }
  ctx.restore();

  // --- 4. Draw Click Animations ---
  const { DURATION, MAX_RADIUS, EASING, COLOR } = EFFECTS.CLICK_ANIMATION;
  const clickAnimationEasing = EASING_MAP[EASING as keyof typeof EASING_MAP] || ((t: number) => t);

  // Use the synchronized time for click animations
  const effectiveTime = currentTime + (state.syncOffset / 1000) - DURATION;

  if (state.recordingGeometry) {
    const recentClicks = state.metadata.filter(event =>
      event.type === 'click' &&
      event.pressed &&
      effectiveTime >= event.timestamp &&
      effectiveTime < event.timestamp + DURATION
    );

    for (const click of recentClicks) {
      const progress = (effectiveTime - click.timestamp) / DURATION;
      const easedProgress = clickAnimationEasing(progress);

      const currentRadius = easedProgress * MAX_RADIUS;
      const currentOpacity = 1 - easedProgress;

      // Scale cursor position from original recording geometry to the current frame's content size
      const cursorX = (click.x / state.recordingGeometry.width) * frameContentWidth;
      const cursorY = (click.y / state.recordingGeometry.height) * frameContentHeight;

      // Use the pre-parsed color parts instead of running regex on every frame.
      if (COLOR) {
        const [r, g, b, baseAlpha] = COLOR;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${baseAlpha * currentOpacity})`;
      }

      ctx.beginPath();
      ctx.arc(cursorX, cursorY, currentRadius, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // --- 5. Draw Cursor ---
  const lastEventIndex = findLastMetadataIndex(state.metadata, currentTime + (state.syncOffset / 1000));
  if (lastEventIndex > -1 && state.recordingGeometry) {
    const event = state.metadata[lastEventIndex];
    const cursorData = state.cursorImages[event.cursorImageKey];

    // Improved cursor drawing logic
    const buffer = new Uint8ClampedArray(cursorData.image);
    const imageData = new ImageData(buffer, cursorData.width, cursorData.height);
    if (cursorData && imageData && imageData.width > 0) {
      // Scale cursor position from original recording geometry to the current frame's content size
      const cursorX = (event.x / state.recordingGeometry.width) * frameContentWidth;
      const cursorY = (event.y / state.recordingGeometry.height) * frameContentHeight;

      // Create a bitmap for efficient drawing.
      const bitmap = await createImageBitmap(imageData);
      
      // Draw the cursor image, offset by its hotspot.
      // This happens inside the transformed context, so it will be scaled and panned correctly.
      ctx.drawImage(
        bitmap,
        Math.round(cursorX - cursorData.xhot),
        Math.round(cursorY - cursorData.yhot)
      );
    }
  }

  ctx.restore(); // Restore from video's transform

  // --- 6. Draw Webcam with same technique ---
  const { webcamPosition, webcamStyles, isWebcamVisible } = state;
  if (isWebcamVisible && webcamVideoElement && webcamVideoElement.videoWidth > 0) {
    const baseSize = Math.min(outputWidth, outputHeight);
    let webcamWidth, webcamHeight;

    if (webcamStyles.shape === 'rectangle') {
      webcamWidth = baseSize * (webcamStyles.size / 100);
      webcamHeight = webcamWidth * (9 / 16);
    } else {
      webcamWidth = baseSize * (webcamStyles.size / 100);
      webcamHeight = webcamWidth;
    }

    const maxRadius = Math.min(webcamWidth, webcamHeight) / 2;
    let webcamRadius = 0;
    if (webcamStyles.shape === 'circle') {
      webcamRadius = maxRadius;
    } else {
      webcamRadius = maxRadius * (webcamStyles.borderRadius / 50);
    }

    const webcamEdgePadding = baseSize * 0.02;
    let webcamX, webcamY;

    switch (webcamPosition.pos) {
      case 'top-left':
        webcamX = webcamEdgePadding;
        webcamY = webcamEdgePadding;
        break;
      case 'top-center':
        webcamX = (outputWidth - webcamWidth) / 2;
        webcamY = webcamEdgePadding;
        break;
      case 'top-right':
        webcamX = outputWidth - webcamWidth - webcamEdgePadding;
        webcamY = webcamEdgePadding;
        break;
      case 'left-center':
        webcamX = webcamEdgePadding;
        webcamY = (outputHeight - webcamHeight) / 2;
        break;
      case 'right-center':
        webcamX = outputWidth - webcamWidth - webcamEdgePadding;
        webcamY = (outputHeight - webcamHeight) / 2;
        break;
      case 'bottom-left':
        webcamX = webcamEdgePadding;
        webcamY = outputHeight - webcamHeight - webcamEdgePadding;
        break;
      case 'bottom-center':
        webcamX = (outputWidth - webcamWidth) / 2;
        webcamY = outputHeight - webcamHeight - webcamEdgePadding;
        break;
      default:
        webcamX = outputWidth - webcamWidth - webcamEdgePadding;
        webcamY = outputHeight - webcamHeight - webcamEdgePadding;
        break;
    }

    // Draw webcam shadow if needed
    if (webcamStyles.shadowBlur > 0) {
      ctx.save();
      ctx.shadowColor = webcamStyles.shadowColor;
      ctx.shadowBlur = webcamStyles.shadowBlur;
      ctx.shadowOffsetX = webcamStyles.shadowOffsetX;
      ctx.shadowOffsetY = webcamStyles.shadowOffsetY;
      const webcamShadowPath = new Path2D();
      webcamShadowPath.roundRect(webcamX, webcamY, webcamWidth, webcamHeight, webcamRadius);
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fill(webcamShadowPath);
      ctx.restore();
    }

    // Draw webcam video with border radius
    ctx.save();
    const webcamPath = new Path2D();
    webcamPath.roundRect(webcamX, webcamY, webcamWidth, webcamHeight, webcamRadius);
    ctx.clip(webcamPath);

    // Crop webcam source to prevent distortion
    const webcamVideo = webcamVideoElement;
    const webcamAR = webcamVideo.videoWidth / webcamVideo.videoHeight;
    const targetAR = webcamWidth / webcamHeight;

    let sx = 0, sy = 0, sWidth = webcamVideo.videoWidth, sHeight = webcamVideo.videoHeight;

    if (webcamAR > targetAR) {
      sWidth = webcamVideo.videoHeight * targetAR;
      sx = (webcamVideo.videoWidth - sWidth) / 2;
    } else {
      sHeight = webcamVideo.videoWidth / targetAR;
      sy = (webcamVideo.videoHeight - sHeight) / 2;
    }
    ctx.drawImage(webcamVideo, sx, sy, sWidth, sHeight, webcamX, webcamY, webcamWidth, webcamHeight);

    ctx.restore();
  }
};