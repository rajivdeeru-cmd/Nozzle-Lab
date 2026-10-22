export type Point = { x: number; y: number };

export function distancePx(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function calibrateFromPoints(knownLengthMm: number, measuredPixels: number) {
  if (!Number.isFinite(knownLengthMm) || knownLengthMm <= 0) throw new Error("Known length must be greater than zero.");
  if (!Number.isFinite(measuredPixels) || measuredPixels <= 0) throw new Error("Calibration points must be separated.");
  return { mmPerPx: knownLengthMm / measuredPixels, pxPerMm: measuredPixels / knownLengthMm };
}
