/**
 * A helper class to calculate the necessary translation for the pan phase of a zoom effect.
 * It keeps the specified mouse position centered within the viewport, respecting boundaries.
 *
 * This version focuses on calculating the *target* translation for a given mouse coordinate
 * and zoom level, applying clamping to keep the view within the video boundaries.
 * Smoothing of the pan transition over time is handled externally (e.g., in calculateZoomTransform).
 */
export class PanHelper {
  canvasWidth: number;
  canvasHeight: number;
  padding: number;
  zoomLevel: number;
  ease: number;
  movementThreshold: number;

  imageRect: { x: number; y: number; width: number; height: number };
  imageScale: number;
  position: { x: number; y: number };
  destination: { x: number; y: number };
  mousePos: { x: number; y: number };
  accumulatedPos: { x: number; y: number };

  pxStart: number;
  pxEnd: number;
  pyStart: number;
  pyEnd: number;

  constructor(
    canvasWidth: number,
    canvasHeight: number,
    padding: number = 0.1,
    zoomLevel: number = 2,
    ease: number = 0.08,
    movementThreshold: number = 30,
  ) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.padding = padding;
    this.zoomLevel = zoomLevel;
    this.ease = ease;
    this.movementThreshold = movementThreshold;

    this.imageRect = { x: 0, y: 0, width: 0, height: 0 };
    this.imageScale = 1;
    this.position = { x: 0, y: 0 };
    this.destination = { x: 0, y: 0 };
    this.mousePos = { x: 0, y: 0 };
    this.accumulatedPos = { x: 0, y: 0 };

    this.pxStart = this.canvasWidth * this.padding;
    this.pxEnd = this.canvasWidth * this.padding;
    this.pyStart = this.canvasHeight * this.padding;
    this.pyEnd = this.canvasHeight * this.padding;
  }

  /** Khởi tạo thông tin ảnh */
  setImageInitialState(imgWidth: number, imgHeight: number, transformOriginX: number, transformOriginY: number) {
    const availableWidth = this.canvasWidth - this.pxStart - this.pxEnd;
    const availableHeight = this.canvasHeight - this.pyStart - this.pyEnd;

    const imageAspect = imgWidth / imgHeight;
    const availableAspect = availableWidth / availableHeight;

    let width, height;
    if (imageAspect > availableAspect) {
      width = (availableWidth * transformOriginX) * this.zoomLevel;  // fixed zoom 2x
      height = width / imageAspect;
    } else {
      height = (availableHeight * transformOriginY) * this.zoomLevel;
      width = height * imageAspect;
    }

    console.log(`canvasWidth: ${this.canvasWidth} | canvasHeight: ${this.canvasHeight} | availableWidth: ${availableWidth} | availableHeight: ${availableHeight} | imageAspect: ${imageAspect} | availableAspect: ${availableAspect}`)
    

    const x = this.pxStart + (availableWidth * transformOriginX - width) / 2;
    const y = this.pyStart + (availableHeight * transformOriginY - height) / 2;
    this.imageScale = Math.min(availableWidth / imgWidth, availableHeight / imgHeight);

    this.imageRect = { x, y, width, height };
  }

  setImagePosition(x: number, y: number) {
    this.imageRect.x = x;
    this.imageRect.y = y;
  }

  /** Cập nhật vị trí chuột tính theo canvas */
  updateMouse(x: number, y: number) {
    this.mousePos.x = x;
    this.mousePos.y = y;
    this.updateDestination();
  }

  /** Tính toán điểm đến mới dựa theo vị trí chuột */
  updateDestination() {
    const dx = this.mousePos.x - this.accumulatedPos.x;
    const dy = this.mousePos.y - this.accumulatedPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    console.log('distance', distance)
    if (distance <= this.movementThreshold) return;

    this.accumulatedPos.x = this.mousePos.x;
    this.accumulatedPos.y = this.mousePos.y;

    const zoomedWidth = this.imageRect.width;
    const zoomedHeight = this.imageRect.height;

    // Map chuột sang offset pan
    const offsetX = this.map(this.mousePos.x, 0, this.canvasWidth, zoomedWidth / 2, -zoomedWidth / 2);
    const offsetY = this.map(this.mousePos.y, 0, this.canvasHeight, zoomedHeight / 2, -zoomedHeight / 2);

    const centerX = this.imageRect.x + this.imageRect.width / 2;
    const centerY = this.imageRect.y + this.imageRect.height / 2;
    const halfW = zoomedWidth / 2;
    const halfH = zoomedHeight / 2;

    let minX = this.canvasWidth - this.pxEnd - centerX - halfW;
    let maxX = this.pxStart - centerX + halfW;
    if (minX > maxX) { const mid = (minX + maxX) / 2; minX = maxX = mid; }

    let minY = this.canvasHeight - this.pyEnd - centerY - halfH;
    let maxY = this.pyStart - centerY + halfH;
    if (minY > maxY) { const mid = (minY + maxY) / 2; minY = maxY = mid; }

    this.destination.x = Math.max(minX, Math.min(maxX, offsetX));
    this.destination.y = Math.max(minY, Math.min(maxY, offsetY));
  }

  /** Gọi mỗi frame để tính vị trí mượt */
  tick() {
    this.position.x += (this.destination.x - this.position.x) * this.ease;
    this.position.y += (this.destination.y - this.position.y) * this.ease;
    return { ...this.position };
  }

  map(val: number, oldMin: number, oldMax: number, newMin: number, newMax: number) {
    return newMin + ((val - oldMin) * (newMax - newMin)) / (oldMax - oldMin);
  }

  /** Lấy thông tin để render */
  getDestination() {
    return {
      position: { ...this.position },
      imageRect: { ...this.imageRect },
    };
  }

  getPadding() {
    return {
      pxStart: this.pxStart,
      pxEnd: this.pxEnd,
      pyStart: this.pyStart,
      pyEnd: this.pyEnd,
    };
  }

  getImageRect() {
    return { ...this.imageRect };
  }

  getImageScale() {
    return this.imageScale;
  }
}