import { ZOOM } from './constants';
import { EASING_MAP } from './easing';
import { ZoomRegion, MetaDataItem } from '../types/store';

// --- HELPER FUNCTIONS ---

/**
 * Ánh xạ một giá trị từ một khoảng này sang một khoảng khác.
 * Tương tự hàm map() trong Processing hay p5.js.
 */
function map(value: number, start1: number, stop1: number, start2: number, stop2: number): number {
  return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
}

/**
 * Nội suy tuyến tính giữa hai giá trị.
 */
function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}

/**
 * Tìm index của item metadata cuối cùng có timestamp nhỏ hơn hoặc bằng thời gian cho trước.
 * Sử dụng tìm kiếm nhị phân để tối ưu hiệu suất.
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
 * Lấy vị trí chuột đã được làm mượt bằng cách lấy trung bình các điểm trong một khoảng thời gian.
 * Điều này giúp loại bỏ các chuyển động giật cục và tạo ra đường pan mượt hơn.
 */
const getSmoothedMousePosition = (metadata: MetaDataItem[], endTime: number, windowDuration: number): { x: number; y: number } | null => {
  const startIndex = findLastMetadataIndex(metadata, endTime);
  if (startIndex === -1) {
    return metadata.length > 0 ? { x: metadata[0].x, y: metadata[0].y } : null;
  }

  const startTime = endTime - windowDuration;
  let totalX = 0;
  let totalY = 0;
  let count = 0;

  // Lặp ngược từ vị trí hiện tại để tìm các điểm trong khoảng thời gian làm mượt
  for (let i = startIndex; i >= 0; i--) {
    const point = metadata[i];
    if (point.timestamp < startTime) {
      break; // Đã ra khỏi khoảng thời gian
    }
    totalX += point.x;
    totalY += point.y;
    count++;
  }

  if (count === 0) {
    // Nếu không có điểm nào trong khoảng thời gian, trả về điểm cuối cùng
    const lastPoint = metadata[startIndex];
    return { x: lastPoint.x, y: lastPoint.y };
  }

  return { x: totalX / count, y: totalY / count };
};


/**
 * Calculates the transform-origin based on a normalized target point [-0.5, 0.5].
 * Implements edge snapping to prevent zooming outside the video frame.
 * The output is a value from 0 to 1 for CSS transform-origin.
 */
function getTransformOrigin(targetX: number, targetY: number, zoomLevel: number): { x: number; y: number } {
  // Biên an toàn, vượt qua biên này thì transform-origin sẽ bị "dính" vào cạnh
  const boundary = 0.5 * (1 - 1 / zoomLevel);

  // Tính toán vị trí gốc cho trục X
  let originX: number;
  if (targetX > boundary) originX = 1; // Dính vào cạnh phải
  else if (targetX < -boundary) originX = 0; // Dính vào cạnh trái
  else originX = 0.5 + targetX; // Di chuyển tự do ở giữa

  // Tính toán vị trí gốc cho trục Y
  let originY: number;
  if (targetY > boundary) originY = 1; // Dính vào cạnh dưới
  else if (targetY < -boundary) originY = 0; // Dính vào cạnh trên
  else originY = 0.5 + targetY; // Di chuyển tự do ở giữa

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

  const { startTime, duration, zoomLevel, targetX, targetY, mode } = activeRegion;
  const zoomOutStartTime = startTime + duration - ZOOM.TRANSITION_DURATION;
  const zoomInEndTime = startTime + ZOOM.TRANSITION_DURATION;

  const fixedOrigin = getTransformOrigin(targetX, targetY, zoomLevel);
  const transformOrigin = `${fixedOrigin.x * 100}% ${fixedOrigin.y * 100}%`;

  let currentScale = 1;
  let currentTranslateX = 0;
  let currentTranslateY = 0;

  // --- ZOOM-IN ---
  if (currentTime >= startTime && currentTime < zoomInEndTime) {
    const t = EASING_MAP[ZOOM.ZOOM_EASING as keyof typeof EASING_MAP](
      (currentTime - startTime) / ZOOM.TRANSITION_DURATION
    );
    currentScale = lerp(1, zoomLevel, t);
  }

  // --- PAN (LOGIC MỚI) ---
  else if (currentTime >= zoomInEndTime && currentTime < zoomOutStartTime) {
    currentScale = zoomLevel;

    if (mode === 'auto' && metadata.length > 0 && originalVideoDimensions.width > 0) {
      // Khoảng thời gian để lấy trung bình vị trí chuột, giúp pan mượt hơn
      const PAN_SMOOTHING_WINDOW = 0.25; // 250ms

      // Lấy vị trí chuột đã được làm mượt
      const smoothedMousePos = getSmoothedMousePosition(metadata, currentTime, PAN_SMOOTHING_WINDOW);

      if (smoothedMousePos) {
        // Chuẩn hóa tọa độ chuột về khoảng [0, 1]
        const normalizedX = smoothedMousePos.x / originalVideoDimensions.width;
        const normalizedY = smoothedMousePos.y / originalVideoDimensions.height;

        // Vùng có thể nhìn thấy của video khi đã zoom (ví dụ: zoom 2x thì chỉ thấy 1/2 = 0.5)
        const visibleRatio = 1 / zoomLevel;
        
        // Tính toán khoảng pan tối đa có thể thực hiện mà không lộ ra ngoài khung hình
        const maxPanX = frameContentDimensions.width * (1 - visibleRatio) / 2;
        const maxPanY = frameContentDimensions.height * (1 - visibleRatio) / 2;

        // Ánh xạ vị trí chuột đã chuẩn hóa sang khoảng pan
        // Khi chuột ở rìa trái (0), video dịch sang phải (maxPanX)
        // Khi chuột ở rìa phải (1), video dịch sang trái (-maxPanX)
        const targetTranslateX = map(normalizedX, 0, 1, maxPanX, -maxPanX);
        const targetTranslateY = map(normalizedY, 0, 1, maxPanY, -maxPanY);

        // Chia cho mức zoom vì translation được áp dụng trong không gian đã được scale
        currentTranslateX = targetTranslateX / zoomLevel;
        currentTranslateY = targetTranslateY / zoomLevel;
      }
    }
  }

  // --- ZOOM-OUT ---
  else if (currentTime >= zoomOutStartTime && currentTime <= startTime + duration) {
    const t = EASING_MAP[ZOOM.ZOOM_EASING as keyof typeof EASING_MAP](
      (currentTime - zoomOutStartTime) / ZOOM.TRANSITION_DURATION
    );
    currentScale = lerp(zoomLevel, 1, t);
    
    // Giữ nguyên vị trí pan của frame cuối cùng trước khi zoom-out để tránh bị giật
    if (mode === 'auto' && metadata.length > 0 && originalVideoDimensions.width > 0) {
        const PAN_SMOOTHING_WINDOW = 0.25;
        const smoothedMousePos = getSmoothedMousePosition(metadata, zoomOutStartTime, PAN_SMOOTHING_WINDOW);
        if (smoothedMousePos) {
            const normalizedX = smoothedMousePos.x / originalVideoDimensions.width;
            const normalizedY = smoothedMousePos.y / originalVideoDimensions.height;
            const visibleRatio = 1 / zoomLevel;
            const maxPanX = frameContentDimensions.width * (1 - visibleRatio) / 2;
            const maxPanY = frameContentDimensions.height * (1 - visibleRatio) / 2;

            const lastPanX = map(normalizedX, 0, 1, maxPanX, -maxPanX);
            const lastPanY = map(normalizedY, 0, 1, maxPanY, -maxPanY);

            // Nội suy từ vị trí pan cuối cùng về 0 khi zoom-out
            currentTranslateX = lerp(lastPanX / zoomLevel, 0, t);
            currentTranslateY = lerp(lastPanY / zoomLevel, 0, t);
        }
    }
  }

  return { scale: currentScale, translateX: currentTranslateX, translateY: currentTranslateY, transformOrigin };
};