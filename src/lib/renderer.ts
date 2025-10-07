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

  // ctx.translate(frameX, frameY);
  // ctx.translate(originPxX, originPxY);
  // ctx.scale(scale, scale);
  // ctx.translate(translateX, translateY);
  // ctx.translate(-originPxX, -originPxY);

  ctx.translate(
    frameX + originPxX + translateX - (originPxX * scale),
    frameY + originPxY + translateY - (originPxY * scale)
  );
  ctx.scale(scale, scale);

  const { shadow, borderRadius, shadowColor, borderWidth } = frameStyles;

  // Create paths - outer path for border, inner path for video
  const outerPath = new Path2D();
  outerPath.roundRect(0, 0, frameContentWidth, frameContentHeight, borderRadius);

  const innerRadius = Math.max(0, borderRadius - borderWidth);
  const innerPath = new Path2D();
  innerPath.roundRect(
    borderWidth,
    borderWidth,
    frameContentWidth - 2 * borderWidth,
    frameContentHeight - 2 * borderWidth,
    innerRadius
  );

  // Step 1: Draw shadow bên ngoài border (từ mép ngoài của outerPath)
  if (shadow > 0) {
    ctx.save();
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadow * 2;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = shadow * 0.4;

    // Fill một hình trong suốt để tạo shadow, shadow sẽ nằm bên ngoài
    ctx.fillStyle = 'rgba(0, 0, 0, 0.01)';
    ctx.fill(outerPath);
    ctx.restore();
  }

  // Step 2: Draw video content (bên trong border)
  ctx.save();
  ctx.clip(innerPath);
  ctx.drawImage(
    videoElement,
    borderWidth,
    borderWidth,
    frameContentWidth - 2 * borderWidth,
    frameContentHeight - 2 * borderWidth
  );
  ctx.restore();

  // Step 3: Draw border/ring với backdrop-filter blur effect
  // Border được vẽ cuối cùng, không bị ảnh hưởng bởi shadow
  if (borderWidth > 0) {
    ctx.save();

    // Clip vùng border (giữa outerPath và innerPath)
    ctx.clip(outerPath);
    ctx.clip(innerPath, 'evenodd'); // Inverse clip để chỉ lấy vùng border

    // Backdrop blur simulation: semi-transparent white with slight blur effect
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(0, 0, frameContentWidth, frameContentHeight);

    ctx.restore();

    // Draw border ring stroke
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = borderWidth;
    ctx.stroke(outerPath);
    ctx.restore();
  }

  ctx.restore(); // Restore from main zoom/pan transforms

  // --- 4. Draw Webcam with same technique ---
  const { webcamPosition, webcamStyles, isWebcamVisible } = state;
  if (isWebcamVisible && webcamVideoElement) {
    const baseSize = Math.min(outputWidth, outputHeight);
    const webcamHeight = baseSize * (webcamStyles.size / 100);
    const webcamWidth = webcamHeight;
    const webcamRadius = webcamHeight * 0.35;
    const webcamBorderWidth = Math.max(2, webcamWidth * 0.012);
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

    // Create webcam paths
    const webcamOuterPath = new Path2D();
    webcamOuterPath.roundRect(webcamX, webcamY, webcamWidth, webcamHeight, webcamRadius);

    const webcamInnerRadius = Math.max(0, webcamRadius - webcamBorderWidth);
    const webcamInnerPath = new Path2D();
    webcamInnerPath.roundRect(
      webcamX + webcamBorderWidth,
      webcamY + webcamBorderWidth,
      webcamWidth - 2 * webcamBorderWidth,
      webcamHeight - 2 * webcamBorderWidth,
      webcamInnerRadius
    );

    // Draw webcam shadow (bên ngoài border)
    if (webcamStyles.shadow > 0) {
      ctx.save();
      ctx.shadowColor = webcamStyles.shadowColor;
      ctx.shadowBlur = webcamStyles.shadow * 2;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = webcamStyles.shadow * 0.4;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.01)';
      ctx.fill(webcamOuterPath);
      ctx.restore();
    }

    // Draw webcam video
    ctx.save();
    ctx.clip(webcamInnerPath);
    ctx.drawImage(
      webcamVideoElement,
      webcamX + webcamBorderWidth,
      webcamY + webcamBorderWidth,
      webcamWidth - 2 * webcamBorderWidth,
      webcamHeight - 2 * webcamBorderWidth
    );
    ctx.restore();

    // Draw webcam border/ring
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = webcamBorderWidth;
    ctx.stroke(webcamOuterPath);
    ctx.restore();
  }
};