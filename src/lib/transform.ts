// Path: src/lib/transform.ts

import { ZOOM } from './constants';
import { EASING_MAP } from './easing';
import { ZoomRegion, MetaDataItem } from '../types/store';

// --- Constants ---
const SMOOTHING_WINDOW_SIZE = 0.5; // seconds. Lấy dữ liệu chuột trong khoảng +/- 0.25s so với currentTime.
const WEIGHT_EPSILON = 0.001; // Một hằng số nhỏ để tránh chia cho 0.
const PAN_UPDATE_THRESHOLD = 0.01; // Ngưỡng di chuyển (tỷ lệ 0-1 so với chiều rộng video) để cập nhật mục tiêu pan.

// --- State Management for Pan Target ---
/**
 * Quản lý trạng thái của MỤC TIÊU pan.
 * Cần thiết để triển khai ngưỡng di chuyển. Nó lưu lại vị trí mục tiêu cuối cùng
 * để so sánh với vị trí tiềm năng mới.
 * Nó được reset mỗi khi vào một vùng zoom mới.
 */
const panTargetState = {
  lastRegionId: null as string | null,
  targetX: 0, // Tọa độ đã chuẩn hóa [0, 1]
  targetY: 0,
};

// --- Helper Functions ---

function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}

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

const calculateSmoothedMousePosition = (
  metadata: MetaDataItem[],
  currentTime: number,
  windowSize: number
): { x: number; y: number } | null => {
  const startIndex = findLastMetadataIndex(metadata, currentTime);
  if (startIndex === -1) return metadata.length > 0 ? { x: metadata[0].x, y: metadata[0].y } : null;

  const windowStart = currentTime - windowSize / 2;
  const windowEnd = currentTime + windowSize / 2;
  let totalWeight = 0, weightedX = 0, weightedY = 0, pointsInWindow = 0;

  for (let i = startIndex; i >= 0 && metadata[i].timestamp >= windowStart; i--) {
    const point = metadata[i];
    const weight = 1 / (Math.abs(point.timestamp - currentTime) + WEIGHT_EPSILON);
    weightedX += point.x * weight;
    weightedY += point.y * weight;
    totalWeight += weight;
    pointsInWindow++;
  }

  for (let i = startIndex + 1; i < metadata.length && metadata[i].timestamp <= windowEnd; i++) {
    const point = metadata[i];
    const weight = 1 / (Math.abs(point.timestamp - currentTime) + WEIGHT_EPSILON);
    weightedX += point.x * weight;
    weightedY += point.y * weight;
    totalWeight += weight;
    pointsInWindow++;
  }

  if (pointsInWindow === 0) return { x: metadata[startIndex].x, y: metadata[startIndex].y };
  return { x: weightedX / totalWeight, y: weightedY / totalWeight };
};

function getTransformOrigin(targetX: number, targetY: number, zoomLevel: number): { x: number; y: number } {
  const boundary = 0.5 * (1 - 1 / zoomLevel);
  let originX, originY;

  if (targetX > boundary) originX = 1;
  else if (targetX < -boundary) originX = 0;
  else originX = targetX + 0.5;

  if (targetY > boundary) originY = 1;
  else if (targetY < -boundary) originY = 0;
  else originY = targetY + 0.5;

  return { x: originX, y: originY };
}


export const calculateZoomTransform = (
  currentTime: number,
  zoomRegions: Record<string, ZoomRegion>,
  metadata: MetaDataItem[],
  originalVideoDimensions: { width: number; height: number },
  frameContentDimensions: { width: number; height: number }
): { scale: number; translateX: number; translateY: number; transformOrigin: string } => {
  const activeRegion = Object.values(zoomRegions).find(r => currentTime >= r.startTime && currentTime < r.startTime + r.duration);

  const defaultTransform = { scale: 1, translateX: 0, translateY: 0, transformOrigin: '50% 50%' };
  if (!activeRegion || !originalVideoDimensions.width) return defaultTransform;

  const { id: regionId, startTime, duration, zoomLevel, targetX, targetY, mode } = activeRegion;
  const zoomOutStartTime = startTime + duration - ZOOM.TRANSITION_DURATION;
  const zoomInEndTime = startTime + ZOOM.TRANSITION_DURATION;
  const fixedOrigin = getTransformOrigin(targetX, targetY, zoomLevel);
  const transformOrigin = `${fixedOrigin.x * 100}% ${fixedOrigin.y * 100}%`;

  let currentScale = 1;
  let panTargetPosition = { x: targetX + 0.5, y: targetY + 0.5 }; // Mặc định là điểm click

  // --- Logic quản lý mục tiêu Pan ---
  if (mode === 'auto' && metadata.length > 0) {
    // Nếu vào vùng zoom mới, reset mục tiêu pan về điểm click ban đầu
    if (panTargetState.lastRegionId !== regionId) {
      panTargetState.lastRegionId = regionId;
      panTargetState.targetX = targetX + 0.5;
      panTargetState.targetY = targetY + 0.5;
    }

    // Tính toán vị trí chuột tiềm năng mới (đã làm mượt)
    const smoothedPos = calculateSmoothedMousePosition(metadata, currentTime, SMOOTHING_WINDOW_SIZE);
    if (smoothedPos) {
      const potentialTargetX = smoothedPos.x / originalVideoDimensions.width;
      const potentialTargetY = smoothedPos.y / originalVideoDimensions.height;

      // **LOGIC NGƯỠNG DI CHUYỂN (REQUEST 2)**
      // Chỉ cập nhật mục tiêu pan nếu chuột di chuyển đủ xa
      const distance = Math.sqrt(
        Math.pow(potentialTargetX - panTargetState.targetX, 2) +
        Math.pow(potentialTargetY - panTargetState.targetY, 2)
      );
      if (distance > PAN_UPDATE_THRESHOLD) {
        panTargetState.targetX = potentialTargetX;
        panTargetState.targetY = potentialTargetY;
      }
    }
    // Sử dụng mục tiêu đã được xác thực (có qua ngưỡng) để pan
    panTargetPosition = { x: panTargetState.targetX, y: panTargetState.targetY };
  }


  // Tính toán các giá trị translate và scale
  let t = 0;
  if (currentTime >= startTime && currentTime < zoomInEndTime) {
    t = EASING_MAP[ZOOM.ZOOM_EASING as keyof typeof EASING_MAP]((currentTime - startTime) / ZOOM.TRANSITION_DURATION);
    currentScale = lerp(1, zoomLevel, t);
  } else if (currentTime >= zoomInEndTime && currentTime < zoomOutStartTime) {
    t = 1; // Đang ở trạng thái hold
    currentScale = zoomLevel;
  } else if (currentTime >= zoomOutStartTime && currentTime <= startTime + duration) {
    t = EASING_MAP[ZOOM.ZOOM_EASING as keyof typeof EASING_MAP]((currentTime - zoomOutStartTime) / ZOOM.TRANSITION_DURATION);
    currentScale = lerp(zoomLevel, 1, t);
    // Khi zoom out, nội suy mục tiêu pan về lại điểm click ban đầu để kết thúc mượt mà
    const finalTarget = { x: targetX + 0.5, y: targetY + 0.5 };
    panTargetPosition.x = lerp(panTargetState.targetX, finalTarget.x, t);
    panTargetPosition.y = lerp(panTargetState.targetY, finalTarget.y, t);
  }


  // Tính toán translate X, Y dựa trên mục tiêu pan
  let finalTranslateX = -(panTargetPosition.x - fixedOrigin.x) * frameContentDimensions.width * currentScale;
  let finalTranslateY = -(panTargetPosition.y - fixedOrigin.y) * frameContentDimensions.height * currentScale;

  // **LOGIC GIỚI HẠN PAN (REQUEST 1)**
  // Tính toán khoảng pan tối đa để các cạnh không lọt vào view
  const maxPanX = (frameContentDimensions.width * (currentScale - 1)) / 2;
  const maxPanY = (frameContentDimensions.height * (currentScale - 1)) / 2;

  // Giới hạn giá trị translate
  finalTranslateX = Math.max(-maxPanX, Math.min(finalTranslateX, maxPanX));
  finalTranslateY = Math.max(-maxPanY, Math.min(finalTranslateY, maxPanY));


  // Áp dụng easing cho translate khi zoom-in và zoom-out
  const finalTranslateXEased = lerp(0, finalTranslateX, t);
  const finalTranslateYEased = lerp(0, finalTranslateY, t);

  return {
    scale: currentScale,
    translateX: finalTranslateXEased,
    translateY: finalTranslateYEased,
    transformOrigin,
  };
};