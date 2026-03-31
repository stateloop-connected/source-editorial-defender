import { TEXT_BUCKET_SIZE } from "./constants";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function hashNoise(...values: number[]): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === undefined) continue;
    sum += value * (12.9898 + i * 37.719);
  }
  const noise = Math.sin(sum) * 43758.5453123;
  return noise - Math.floor(noise);
}

export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const radii = ar + br;
  return dx * dx + dy * dy < radii * radii;
}

export function roundRenderValue(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getTextBucketKey(x: number, y: number): string {
  return `${Math.floor(x / TEXT_BUCKET_SIZE)},${Math.floor(y / TEXT_BUCKET_SIZE)}`;
}
