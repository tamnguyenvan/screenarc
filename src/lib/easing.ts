// Implement common easing functions
const easeInOutCubic = (t: number): number => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const easeInOutCirc = (t: number): number => {
  return t < 0.5
    ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
    : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
}

const easeInOutQuad = (t: number): number => {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

const easeInOutQuart = (t: number): number => {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}

export function easeInOutQuint(t: number): number {
  if (t < 0.5) {
    return 16 * t * t * t * t * t; // 16t^5 cho giai đoạn đầu
  } else {
    const f = (2 * t) - 2;
    return 0.5 * f * f * f * f * f + 1; // phần sau đối xứng
  }
}

const easeOutElastic = (x: number): number => {
  const c4 = (2 * Math.PI) / 3;

  return x === 0
    ? 0
    : x === 1
      ? 1
      : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

/**
 * Creates a cubic-bezier easing function.
 * 
 * @param p0 - Start point (fixed = 0)
 * @param p1 - Control point 1 (x1, y1)
 * @param p2 - Control point 2 (x2, y2)
 * @param p3 - End point (fixed = 1)
 * @returns Function that maps t ∈ [0,1] → eased value ∈ [0,1]
 */
const cubicBezier = (x1: number, y1: number, x2: number, y2: number) => {
  // Cubic Bézier helper
  const cubic = (a: number, b: number, c: number, d: number, t: number) =>
    ((1 - t) ** 3) * a + 3 * ((1 - t) ** 2) * t * b + 3 * (1 - t) * (t ** 2) * c + (t ** 3) * d;

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Only use y-control for the easing curve
    return cubic(0, y1, y2, 1, t);
  };
}

export const easeInOutCubicBezier = cubicBezier(0.42, 0, 0.58, 1);


// Easing map
export const EASING_MAP = {
  'easeInOutCubic': easeInOutCubic,
  'easeInOutCirc': easeInOutCirc,
  'easeInOutQuad': easeInOutQuad,
  'easeInOutQuart': easeInOutQuart,
  'easeInOutQuint': easeInOutQuint,
  'easeOutElastic': easeOutElastic,
  'easeInOutCubicBezier': easeInOutCubicBezier,
};
