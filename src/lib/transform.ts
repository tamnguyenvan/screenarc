// Path: src/lib/transform.ts

import { ZOOM } from './constants';
import { EASING_MAP } from './easing';
import { ZoomRegion, MetaDataItem } from '../types/store';

// --- Constants ---
const SMOOTHING_WINDOW_SIZE = 0.5; // seconds. Lấy dữ liệu chuột trong khoảng +/- 0.25s so với currentTime.
const WEIGHT_EPSILON = 0.001; // Một hằng số nhỏ để tránh chia cho 0.

// --- Helper Functions ---

/**
 * Nội suy tuyến tính giữa hai số.
 */
function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}

/**
 * Tìm index của metadata item cuối cùng tại hoặc trước một thời điểm nhất định.
 * Sử dụng tìm kiếm nhị phân để tối ưu hiệu suất (O(log n)).
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


/**
 * Tính toán vị trí chuột đã được làm mượt tại một thời điểm cụ thể.
 * Đây là cốt lõi của giải pháp stateless. Nó xem xét một cửa sổ các điểm dữ liệu chuột
 * xung quanh currentTime và tính trung bình có trọng số của chúng.
 */
const calculateSmoothedMousePosition = (
  metadata: MetaDataItem[],
  currentTime: number,
  windowSize: number
): { x: number; y: number } | null => {
  const startIndex = findLastMetadataIndex(metadata, currentTime);
  if (startIndex === -1) return metadata.length > 0 ? { x: metadata[0].x, y: metadata[0].y } : null;

  const windowStart = currentTime - windowSize / 2;
  const windowEnd = currentTime + windowSize / 2;

  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;
  let pointsInWindow = 0;

  // Quét lùi từ startIndex
  for (let i = startIndex; i >= 0 && metadata[i].timestamp >= windowStart; i--) {
    const point = metadata[i];
    const weight = 1 / (Math.abs(point.timestamp - currentTime) + WEIGHT_EPSILON);
    weightedX += point.x * weight;
    weightedY += point.y * weight;
    totalWeight += weight;
    pointsInWindow++;
  }

  // Quét tiến từ startIndex + 1
  for (let i = startIndex + 1; i < metadata.length && metadata[i].timestamp <= windowEnd; i++) {
    const point = metadata[i];
    const weight = 1 / (Math.abs(point.timestamp - currentTime) + WEIGHT_EPSILON);
    weightedX += point.x * weight;
    weightedY += point.y * weight;
    totalWeight += weight;
    pointsInWindow++;
  }

  if (pointsInWindow === 0) {
    // Nếu không có điểm nào trong cửa sổ, chỉ cần trả về điểm gần nhất
    return { x: metadata[startIndex].x, y: metadata[startIndex].y };
  }

  return {
    x: weightedX / totalWeight,
    y: weightedY / totalWeight,
  };
};


/**
 * Tính toán transform-origin dựa trên một điểm mục tiêu đã được chuẩn hóa [-0.5, 0.5].
 * Triển khai "edge snapping" để ngăn việc zoom ra ngoài khung video.
 * Kết quả trả về là một giá trị từ 0 đến 1 cho CSS transform-origin.
 */
function getTransformOrigin(targetX: number, targetY: number, zoomLevel: number): { x: number; y: number } {
  const boundary = 0.5 * (1 - 1 / zoomLevel);

  let originX: number;
  if (targetX > boundary) originX = 1;
  else if (targetX < -boundary) originX = 0;
  else originX = targetX + 0.5;

  let originY: number;
  if (targetY > boundary) originY = 1;
  else if (targetY < -boundary) originY = 0;
  else originY = targetY + 0.5;

  return { x: originX, y: originY };
}


/**
 * Hàm chính để tính toán các thuộc tính transform (scale, translate, origin) cho một frame cụ thể.
 * Hàm này hoàn toàn stateless.
 */
export const calculateZoomTransform = (
  currentTime: number,
  zoomRegions: Record<string, ZoomRegion>,
  metadata: MetaDataItem[],
  originalVideoDimensions: { width: number; height: number },
  frameContentDimensions: { width: number; height: number }
): { scale: number; translateX: number; translateY: number; transformOrigin: string } => {
  const activeRegion = Object.values(zoomRegions).find(r => currentTime >= r.startTime && currentTime < r.startTime + r.duration);

  const defaultTransform = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    transformOrigin: '50% 50%',
  };

  if (!activeRegion || !originalVideoDimensions.width) {
    return defaultTransform;
  }

  const { startTime, duration, zoomLevel, targetX, targetY, mode } = activeRegion;
  const zoomOutStartTime = startTime + duration - ZOOM.TRANSITION_DURATION;
  const zoomInEndTime = startTime + ZOOM.TRANSITION_DURATION;

  // Tính toán một transform-origin cố định cho toàn bộ vùng zoom, dựa trên mục tiêu ban đầu.
  // Đây là "điểm neo" của hiệu ứng zoom.
  const fixedOrigin = getTransformOrigin(targetX, targetY, zoomLevel);
  const transformOrigin = `${fixedOrigin.x * 100}% ${fixedOrigin.y * 100}%`;

  let currentScale = 1;
  let currentTranslateX = 0;
  let currentTranslateY = 0;

  // --- Xác định vị trí pan mục tiêu ---
  let panTargetPosition = { x: 0, y: 0 };
  if (mode === 'auto' && metadata.length > 0) {
    const smoothedPos = calculateSmoothedMousePosition(metadata, currentTime, SMOOTHING_WINDOW_SIZE);
    if (smoothedPos) {
      panTargetPosition = {
        x: smoothedPos.x / originalVideoDimensions.width,
        y: smoothedPos.y / originalVideoDimensions.height,
      };
    }
  } else {
    // Chế độ 'fixed' hoặc không có metadata
    panTargetPosition = {
      x: targetX + 0.5,
      y: targetY + 0.5,
    };
  }

  // Tính toán giá trị translate cuối cùng nếu đang ở mức zoom tối đa
  const finalTranslateX = -(panTargetPosition.x - fixedOrigin.x) * frameContentDimensions.width * zoomLevel;
  const finalTranslateY = -(panTargetPosition.y - fixedOrigin.y) * frameContentDimensions.height * zoomLevel;

  // --- Giai đoạn 1: ZOOM-IN ---
  if (currentTime >= startTime && currentTime < zoomInEndTime) {
    const t = EASING_MAP[ZOOM.ZOOM_EASING as keyof typeof EASING_MAP]((currentTime - startTime) / ZOOM.TRANSITION_DURATION);
    currentScale = lerp(1, zoomLevel, t);
    // Pan cũng được nội suy mượt mà từ 0 đến vị trí mục tiêu
    currentTranslateX = lerp(0, finalTranslateX, t);
    currentTranslateY = lerp(0, finalTranslateY, t);
  }
  // --- Giai đoạn 2: HOLD (Giữ zoom và pan) ---
  else if (currentTime >= zoomInEndTime && currentTime < zoomOutStartTime) {
    currentScale = zoomLevel;
    currentTranslateX = finalTranslateX;
    currentTranslateY = finalTranslateY;
  }
  // --- Giai đoạn 3: ZOOM-OUT ---
  else if (currentTime >= zoomOutStartTime && currentTime <= startTime + duration) {
    const t = EASING_MAP[ZOOM.ZOOM_EASING as keyof typeof EASING_MAP]((currentTime - zoomOutStartTime) / ZOOM.TRANSITION_DURATION);
    currentScale = lerp(zoomLevel, 1, t);
    // Pan cũng được nội suy mượt mà về 0
    currentTranslateX = lerp(finalTranslateX, 0, t);
    currentTranslateY = lerp(finalTranslateY, 0, t);
  }

  return {
    scale: currentScale,
    translateX: currentTranslateX,
    translateY: currentTranslateY,
    transformOrigin,
  };
};