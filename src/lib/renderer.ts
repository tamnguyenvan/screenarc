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
>;

/**
 * Draws the background, now accepts an optional pre-loaded image object for performance.
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
        gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) / 2);
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
      // Use the pre-loaded image if available
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
        // Fallback or initial state
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
 * The main shared rendering function for both live preview and export.
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

  const { scale, translateX, translateY, transformOrigin } = calculateZoomTransform(currentTime, state.zoomRegions);
  const [originXStr, originYStr] = transformOrigin.split(' ');
  const originXMul = parseFloat(originXStr) / 100;
  const originYMul = parseFloat(originYStr) / 100;
  const originPxX = originXMul * frameContentWidth;
  const originPxY = originYMul * frameContentHeight;

  ctx.translate(frameX, frameY);
  ctx.translate(originPxX, originPxY);
  ctx.scale(scale, scale);
  ctx.translate((translateX / 100) * frameContentWidth, (translateY / 100) * frameContentHeight);
  ctx.translate(-originPxX, -originPxY);

  const { shadow, borderRadius, shadowColor, borderWidth } = frameStyles;

  const framePath = new Path2D();
  framePath.roundRect(0, 0, frameContentWidth, frameContentHeight, borderRadius);
  const videoPath = new Path2D();
  const videoRadius = Math.max(0, borderRadius - borderWidth);
  videoPath.roundRect(borderWidth, borderWidth, frameContentWidth - 2 * borderWidth, frameContentHeight - 2 * borderWidth, videoRadius);

  ctx.save();
  // Apply shadow
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadow * 1.5;

  // Draw frame effects (gradient, border), these will automatically have shadow
  ctx.clip(framePath);
  const linearGrad = ctx.createLinearGradient(0, 0, frameContentWidth, frameContentHeight);
  linearGrad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
  linearGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
  linearGrad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
  ctx.fillStyle = linearGrad;
  ctx.fillRect(0, 0, frameContentWidth, frameContentHeight);

  const radialGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, frameContentWidth * 0.7);
  radialGrad.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
  radialGrad.addColorStop(0.5, 'transparent');
  ctx.fillStyle = radialGrad;
  ctx.fillRect(0, 0, frameContentWidth, frameContentHeight);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke(framePath); // Use framePath to draw border
  ctx.restore(); // Restore after drawing frame and its shadow

  // Draw video inside
  ctx.save();
  ctx.clip(videoPath);
  ctx.drawImage(videoElement, borderWidth, borderWidth, frameContentWidth - 2 * borderWidth, frameContentHeight - 2 * borderWidth);
  ctx.restore();

  ctx.restore();

  // --- 4. Draw Webcam ---
  const { webcamPosition, webcamStyles, isWebcamVisible } = state;
  if (isWebcamVisible && webcamVideoElement) {
    const baseSize = Math.min(outputWidth, outputHeight);
    const webcamHeight = baseSize * (webcamStyles.size / 100);
    const webcamWidth = webcamHeight;
    const webcamSquircleRadius = webcamHeight * 0.35;
    const webcamEdgePadding = baseSize * 0.02;
    let webcamX, webcamY;

    switch (webcamPosition.pos) {
      case 'top-left': webcamX = webcamEdgePadding; webcamY = webcamEdgePadding; break;
      case 'top-right': webcamX = outputWidth - webcamWidth - webcamEdgePadding; webcamY = webcamEdgePadding; break;
      case 'bottom-left': webcamX = webcamEdgePadding; webcamY = outputHeight - webcamHeight - webcamEdgePadding; break;
      default: webcamX = outputWidth - webcamWidth - webcamEdgePadding; webcamY = outputHeight - webcamHeight - webcamEdgePadding; break;
    }

    // Separate the shadow drawing logic from the webcam image drawing
    const webcamPath = new Path2D();
    webcamPath.roundRect(webcamX, webcamY, webcamWidth, webcamHeight, webcamSquircleRadius);

    ctx.save();
    ctx.shadowColor = webcamStyles.shadowColor;
    ctx.shadowBlur = webcamStyles.shadow * 1.5;
    // We fill a random color to create shadow, this color will be covered by video
    ctx.fillStyle = '#000';
    ctx.fill(webcamPath);
    ctx.restore(); // Restore to prevent shadow affecting subsequent drawing commands

    // Step 2: Draw webcam video, clip according to the shadow shape
    ctx.save();
    ctx.clip(webcamPath);
    ctx.drawImage(webcamVideoElement, webcamX, webcamY, webcamWidth, webcamHeight);
    ctx.restore();
  }
};