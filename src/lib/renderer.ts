import { EditorState } from '../types/store';
import { calculateZoomTransform } from './transform';

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
  preloadedBgImage: HTMLImageElement | null
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
    { width: frameContentWidth, height: frameContentHeight }
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
    ctx.fillStyle = 'rgba(0,0,0,1)'; // Color doesn't matter, only needed to cast shadow
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
      ctx.lineWidth = borderWidth * 2; // Stroke is centered, so double the width to get full width inside
      ctx.stroke(path);
  }
  ctx.restore();

  ctx.restore(); // Restore from main zoom/pan transforms

  // --- 4. Draw Webcam with same technique ---
  const { webcamPosition, webcamStyles, isWebcamVisible } = state;
  if (isWebcamVisible && webcamVideoElement) {
    const baseSize = Math.min(outputWidth, outputHeight);
    const webcamHeight = baseSize * (webcamStyles.size / 100);
    const webcamWidth = webcamHeight;
    const webcamRadius = webcamHeight * 0.35;
    const webcamEdgePadding = baseSize * 0.02;
    let webcamX, webcamY;

    switch (webcamPosition.pos) {
      case 'top-left':
        webcamX = webcamEdgePadding;
        webcamY = webcamEdgePadding;
        break;
      case 'top-right':
        webcamX = outputWidth - webcamWidth - webcamEdgePadding;
        webcamY = webcamEdgePadding;
        break;
      case 'bottom-left':
        webcamX = webcamEdgePadding;
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
    ctx.drawImage(webcamVideoElement, webcamX, webcamY, webcamWidth, webcamHeight);
    ctx.restore();
  }
};