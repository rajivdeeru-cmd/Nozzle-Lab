export type DetectionFeatures = {
  edgePixels: number;
  edgeThreshold: number;
  shockAngleDeg: number;
  cellCount: number;
  cellSpacingPx: number;
  jetWidthPx: number;
  machDiskDetected: boolean;
  jetBoundaryDetected: boolean;
  detectionConfidence: number;
  modelFeatures: [number, number, number, number, number, number];
};

export type PipelineOutput = DetectionFeatures & {
  originalUrl: string;
  enhancedUrl: string;
  preprocessedUrl: string;
  edgeUrl: string;
  overlayUrl: string;
};

function imageDataToUrl(data: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = data.width;
  canvas.height = data.height;
  canvas.getContext("2d")?.putImageData(data, 0, 0);
  return canvas.toDataURL("image/png");
}

function grayscale(data: ImageData): ImageData {
  const output = new ImageData(data.width, data.height);
  for (let i = 0; i < data.data.length; i += 4) {
    const value = data.data[i] * .299 + data.data[i + 1] * .587 + data.data[i + 2] * .114;
    output.data[i] = output.data[i + 1] = output.data[i + 2] = value;
    output.data[i + 3] = 255;
  }
  return output;
}

function bilateralLike(data: ImageData): ImageData {
  const output = new ImageData(data.width, data.height);
  const { width, height } = data;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      let total = 0; let weight = 0;
      const center = data.data[index];
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = Math.min(width - 1, Math.max(0, x + dx));
        const ny = Math.min(height - 1, Math.max(0, y + dy));
        const value = data.data[(ny * width + nx) * 4];
        const w = Math.exp(-Math.abs(value - center) / 32);
        total += value * w; weight += w;
      }
      const value = total / weight;
      output.data[index] = output.data[index + 1] = output.data[index + 2] = value;
      output.data[index + 3] = 255;
    }
  }
  return output;
}

function claheLike(data: ImageData): ImageData {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.data.length; i += 4) histogram[data.data[i]] += 1;
  const cdf = new Uint32Array(256); let running = 0;
  for (let i = 0; i < 256; i += 1) { running += histogram[i]; cdf[i] = running; }
  const first = cdf.find((value) => value > 0) || 0;
  const output = new ImageData(data.width, data.height);
  for (let i = 0; i < data.data.length; i += 4) {
    const value = Math.max(0, Math.min(255, ((cdf[data.data[i]] - first) * 255) / Math.max(1, data.data.length / 4 - first)));
    output.data[i] = output.data[i + 1] = output.data[i + 2] = value;
    output.data[i + 3] = 255;
  }
  return output;
}

function otsuThreshold(values: Uint8Array): number {
  const histogram = new Uint32Array(256);
  values.forEach((value) => { histogram[value] += 1; });
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i];
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = 0;
  let bestThreshold = 105;
  for (let threshold = 0; threshold < 256; threshold += 1) {
    backgroundWeight += histogram[threshold];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += threshold * histogram[threshold];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) { bestVariance = variance; bestThreshold = threshold; }
  }
  return Math.max(45, Math.min(180, bestThreshold));
}

function sobel(data: ImageData): { output: ImageData; edgePixels: number; threshold: number; diagonalEnergy: number; verticalEnergy: number } {
  const output = new ImageData(data.width, data.height);
  const magnitudes = new Uint8Array(data.width * data.height);
  const at = (x: number, y: number) => data.data[(Math.min(data.height - 1, Math.max(0, y)) * data.width + Math.min(data.width - 1, Math.max(0, x))) * 4];
  for (let y = 1; y < data.height - 1; y += 1) for (let x = 1; x < data.width - 1; x += 1) {
    const gx = -at(x - 1, y - 1) + at(x + 1, y - 1) - 2 * at(x - 1, y) + 2 * at(x + 1, y) - at(x - 1, y + 1) + at(x + 1, y + 1);
    const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
    const value = Math.min(255, Math.round(Math.hypot(gx, gy)));
    magnitudes[y * data.width + x] = value;
    const index = (y * data.width + x) * 4; output.data[index] = output.data[index + 1] = output.data[index + 2] = value; output.data[index + 3] = 255;
  }
  const threshold = otsuThreshold(magnitudes);
  let edgePixels = 0; let diagonalEnergy = 0; let verticalEnergy = 0;
  for (let y = 1; y < data.height - 1; y += 1) for (let x = 1; x < data.width - 1; x += 1) {
    const value = magnitudes[y * data.width + x];
    if (value > threshold) {
      edgePixels += 1;
      const horizontal = Math.abs(at(x + 1, y) - at(x - 1, y));
      const vertical = Math.abs(at(x, y + 1) - at(x, y - 1));
      diagonalEnergy += Math.min(255, Math.abs(horizontal - vertical));
      verticalEnergy += vertical;
    }
  }
  return { output, edgePixels, threshold, diagonalEnergy, verticalEnergy };
}

export async function processImage(canvas: HTMLCanvasElement, originalUrl: string): Promise<PipelineOutput> {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Unable to read image pixels.");
  const original = context.getImageData(0, 0, canvas.width, canvas.height);
  const gray = grayscale(original);
  const denoised = bilateralLike(gray);
  const enhanced = claheLike(denoised);
  const edges = sobel(enhanced);
  const enhancedCanvas = document.createElement("canvas");
  enhancedCanvas.width = canvas.width * 2; enhancedCanvas.height = canvas.height * 2;
  const enhancedContext = enhancedCanvas.getContext("2d");
  if (enhancedContext) {
    enhancedContext.imageSmoothingEnabled = true;
    enhancedContext.drawImage(canvas, 0, 0, enhancedCanvas.width, enhancedCanvas.height);
  }
  const overlay = document.createElement("canvas");
  overlay.width = canvas.width; overlay.height = canvas.height;
  const overlayContext = overlay.getContext("2d");
  overlayContext?.drawImage(canvas, 0, 0);
  if (overlayContext) {
    const overlayPixels = overlayContext.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < edges.output.data.length; i += 4) {
      if (edges.output.data[i] > edges.threshold) {
        overlayPixels.data[i] = 239; overlayPixels.data[i + 1] = 116; overlayPixels.data[i + 2] = 78; overlayPixels.data[i + 3] = 220;
      }
    }
    overlayContext.putImageData(overlayPixels, 0, 0);
  }
  const edgeDensity = edges.edgePixels / Math.max(1, canvas.width * canvas.height);
  const shockAngleDeg = 28 + Math.min(28, (edges.diagonalEnergy / Math.max(1, edges.edgePixels)) * 0.18);
  const jetBoundaryDetected = edgeDensity > 0.008;
  const machDiskDetected = edgeDensity > 0.018 && edges.verticalEnergy > edges.diagonalEnergy * 0.85;
  return {
    originalUrl, enhancedUrl: enhancedCanvas.toDataURL("image/png"), preprocessedUrl: imageDataToUrl(enhanced), edgeUrl: imageDataToUrl(edges.output),
    overlayUrl: overlay.toDataURL("image/png"), edgePixels: edges.edgePixels, edgeThreshold: edges.threshold,
    shockAngleDeg, cellCount: Math.max(0, Math.round(2 + edgeDensity * 28)),
    cellSpacingPx: Math.max(1, Math.round(canvas.width / Math.max(3, 5 + edgeDensity * 40))),
    jetWidthPx: Math.round(canvas.height * .42), machDiskDetected, jetBoundaryDetected,
    detectionConfidence: Math.max(0, Math.min(100, edgeDensity * 2200)),
    modelFeatures: [
      edgeDensity,
      shockAngleDeg / 90,
      Math.min(1, Math.max(0, Math.round(2 + edgeDensity * 28) / 20)),
      .42,
      Math.min(1, edges.verticalEnergy / Math.max(1, edges.edgePixels * 255)),
      machDiskDetected ? 1 : 0
    ]
  };
}
