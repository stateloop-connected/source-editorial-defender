import { prepareWithSegments } from "@chenglou/pretext";

import {
  AMBIENT_GLYPH_CHARS,
  AMBIENT_GLYPH_MAX_COUNT,
  AMBIENT_GLYPH_MIN_COUNT,
  BASE_STAGE_AREA,
  SAFE_ZONE_HEIGHT,
  SAFE_ZONE_WIDTH,
  TEXT_CHAR_GAP,
  TEXT_CORPUS_WORDS,
  TEXT_FONT,
  TEXT_HORIZONTAL_PADDING,
  TEXT_ISLAND_INSET_X,
  TEXT_ISLAND_INSET_Y,
  TEXT_LINE_HEIGHT,
  TEXT_MAX_BLOCKS,
  TEXT_VERTICAL_PADDING,
} from "./constants";
import { AmbientGlyph, TextBlock } from "./entities";
import { clamp, getTextBucketKey, hashNoise } from "./utils";

import type { LayoutCluster, LayoutRect, SafeRect } from "./types";

export type StageLayout = {
  textBlocks: TextBlock[];
  ambientGlyphs: AmbientGlyph[];
};

let currentWidth = 0;
let currentHeight = 0;

type CorpusToken = {
  text: string;
  graphemes: string[];
  graphemeWidths: number[];
  width: number;
};

const graphemeSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function splitGraphemes(text: string): string[] {
  if (graphemeSegmenter === null) return Array.from(text);
  return Array.from(
    graphemeSegmenter.segment(text),
    (segment) => segment.segment,
  );
}

function buildUnitsFromPrepared(
  prepared: ReturnType<typeof prepareWithSegments>,
): Array<{ text: string; width: number }> {
  const units: Array<{ text: string; width: number }> = [];

  for (
    let segmentIndex = 0;
    segmentIndex < prepared.segments.length;
    segmentIndex++
  ) {
    const segmentText = prepared.segments[segmentIndex];
    const segmentWidth = prepared.widths[segmentIndex];
    if (
      segmentText === undefined ||
      segmentWidth === undefined ||
      segmentText.trim().length === 0
    ) {
      continue;
    }

    const breakableWidths = prepared.breakableWidths[segmentIndex];
    const graphemes = splitGraphemes(segmentText);
    if (
      breakableWidths !== null &&
      breakableWidths !== undefined &&
      breakableWidths.length === graphemes.length
    ) {
      for (
        let graphemeIndex = 0;
        graphemeIndex < graphemes.length;
        graphemeIndex++
      ) {
        const grapheme = graphemes[graphemeIndex];
        const graphemeWidth = breakableWidths[graphemeIndex];
        if (grapheme === undefined || graphemeWidth === undefined) continue;
        units.push({ text: grapheme, width: graphemeWidth });
      }
      continue;
    }

    if (graphemes.length <= 1) {
      units.push({ text: segmentText, width: segmentWidth });
      continue;
    }

    const nestedPrepared = prepareWithSegments(segmentText, TEXT_FONT);
    if (
      nestedPrepared.segments.length === 1 &&
      nestedPrepared.segments[0] === segmentText
    ) {
      units.push({ text: segmentText, width: segmentWidth });
      continue;
    }

    units.push(...buildUnitsFromPrepared(nestedPrepared));
  }

  return units;
}

const preparedSpace = prepareWithSegments(" ", TEXT_FONT);
const corpusWordGap = Math.max(10, (preparedSpace.widths[0] ?? 0) * 2.5);

function buildCorpusToken(text: string): CorpusToken {
  const prepared = prepareWithSegments(text, TEXT_FONT);
  const units = buildUnitsFromPrepared(prepared);
  const graphemes = units.map((unit) => unit.text);
  const graphemeWidths = units.map((unit) => unit.width);

  const width = graphemeWidths.reduce(
    (sum, graphemeWidth) => sum + graphemeWidth,
    0,
  );
  return { text, graphemes, graphemeWidths, width };
}

const corpusTokens = TEXT_CORPUS_WORDS.map((word) => buildCorpusToken(word));
const maxCorpusTokenWidth = corpusTokens.reduce(
  (maxWidth, token) => Math.max(maxWidth, token.width),
  0,
);

function getViewportFitScale(): number {
  return clamp(Math.min(currentWidth / 1280, currentHeight / 800), 0.78, 1.12);
}

function getSafeZoneScale(): number {
  return clamp(Math.min(currentWidth / 1100, currentHeight / 760), 0.82, 1);
}

function getIslandInsetX(): number {
  return clamp(TEXT_ISLAND_INSET_X * getViewportFitScale(), 14, TEXT_ISLAND_INSET_X);
}

function getIslandInsetY(): number {
  return clamp(TEXT_ISLAND_INSET_Y * getViewportFitScale(), 10, TEXT_ISLAND_INSET_Y);
}

function getIslandLineHeight(): number {
  return clamp(TEXT_LINE_HEIGHT * (0.9 + getViewportFitScale() * 0.1), 26, TEXT_LINE_HEIGHT);
}

function getIslandWordGap(): number {
  return clamp(corpusWordGap * (0.88 + getViewportFitScale() * 0.12), 10, corpusWordGap);
}

export function rebuildTextBuckets(
  textGrid: TextBlock[],
  textBuckets: Map<string, TextBlock[]>,
): void {
  textBuckets.clear();

  for (let i = 0; i < textGrid.length; i++) {
    const textBlock = textGrid[i];
    if (textBlock === undefined || textBlock.dead) continue;
    const key = getTextBucketKey(textBlock.x, textBlock.y);
    const bucket = textBuckets.get(key);
    if (bucket === undefined) {
      textBuckets.set(key, [textBlock]);
    } else {
      bucket.push(textBlock);
    }
  }
}

function createTextElement(char: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = "text-block";
  element.textContent = char;
  element.style.transform = "translate(-50%, -50%)";
  return element;
}

function rectsOverlap(a: LayoutRect, b: LayoutRect, padding = 0): boolean {
  return !(
    a.x + a.w <= b.x - padding ||
    a.x >= b.x + b.w + padding ||
    a.y + a.h <= b.y - padding ||
    a.y >= b.y + b.h + padding
  );
}

function rectCenterX(rect: LayoutRect): number {
  return rect.x + rect.w / 2;
}

function rectCenterY(rect: LayoutRect): number {
  return rect.y + rect.h / 2;
}

function getRectBounds(rects: LayoutRect[]): LayoutRect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    if (rect === undefined) continue;
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function getRectGap(a: LayoutRect, b: LayoutRect): number {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.hypot(dx, dy);
}

function isRectInsideStage(rect: LayoutRect): boolean {
  return (
    rect.x >= TEXT_HORIZONTAL_PADDING &&
    rect.y >= TEXT_VERTICAL_PADDING &&
    rect.x + rect.w <= currentWidth - TEXT_HORIZONTAL_PADDING &&
    rect.y + rect.h <= currentHeight - TEXT_VERTICAL_PADDING
  );
}

function connectCorridorNodes(
  rects: LayoutRect[],
  from: { x: number; y: number; width: number },
  to: { x: number; y: number; width: number },
  connectorHeight: number,
): void {
  const width = Math.max(from.width, to.width);
  const top = Math.min(from.y, to.y);
  const height = Math.abs(to.y - from.y);
  const verticalHeight = Math.max(height, connectorHeight);
  const verticalY = clamp(
    top - Math.max(0, (connectorHeight - height) / 2),
    TEXT_VERTICAL_PADDING,
    currentHeight - TEXT_VERTICAL_PADDING - verticalHeight,
  );

  rects.push({
    x: from.x - width / 2,
    y: verticalY,
    w: width,
    h: verticalHeight,
  });

  if (Math.abs(to.x - from.x) < 6) return;

  rects.push({
    x: Math.min(from.x, to.x) - width / 2,
    y: to.y - connectorHeight / 2,
    w: Math.abs(to.x - from.x) + width,
    h: connectorHeight,
  });
}

function buildCorridorRects(safeRect: SafeRect): LayoutRect[] {
  const stageScale = Math.sqrt(
    (currentWidth * currentHeight) / BASE_STAGE_AREA,
  );
  const viewportScale = getViewportFitScale();
  const corridorWidth = clamp(182 * viewportScale, 132, 280);
  const connectorHeight = clamp(106 * viewportScale, 74, 156);
  const chamberMarginX = clamp(54 * viewportScale, 28, 88);
  const chamberMarginY = clamp(38 * viewportScale, 22, 64);
  const chamber: LayoutRect = {
    x: safeRect.x - chamberMarginX,
    y: safeRect.y - chamberMarginY,
    w: safeRect.w + chamberMarginX * 2,
    h: safeRect.h + chamberMarginY * 2,
  };
  const driftLimit = clamp(currentWidth * 0.14, 82, 210);
  const topTravel = chamber.y - TEXT_VERTICAL_PADDING;
  const bottomTravel =
    currentHeight - TEXT_VERTICAL_PADDING - (chamber.y + chamber.h);
  const topNodeCount = Math.max(
    1,
    Math.round(topTravel / clamp(210 * stageScale, 160, 240)),
  );
  const bottomNodeCount = Math.max(
    1,
    Math.round(bottomTravel / clamp(210 * stageScale, 160, 240)),
  );
  const centerX =
    rectCenterX(chamber) +
    (hashNoise(currentWidth, currentHeight, 5) - 0.5) *
      clamp(currentWidth * 0.05, 18, 54);

  const rects: LayoutRect[] = [chamber];
  let previous = {
    x: clamp(
      centerX +
        (hashNoise(currentWidth, currentHeight, 11) - 0.5) * driftLimit * 0.25,
      TEXT_HORIZONTAL_PADDING + corridorWidth / 2,
      currentWidth - TEXT_HORIZONTAL_PADDING - corridorWidth / 2,
    ),
    y: TEXT_VERTICAL_PADDING,
    width: corridorWidth,
  };

  for (let index = 1; index <= topNodeCount; index++) {
    const progress = index / (topNodeCount + 1);
    const node = {
      x: clamp(
        centerX +
          (hashNoise(index, currentWidth, 17) - 0.5) *
            driftLimit *
            (0.65 + progress * 0.35),
        TEXT_HORIZONTAL_PADDING + corridorWidth / 2,
        currentWidth - TEXT_HORIZONTAL_PADDING - corridorWidth / 2,
      ),
      y: TEXT_VERTICAL_PADDING + topTravel * progress,
      width: corridorWidth * (0.9 + hashNoise(index, currentHeight, 19) * 0.18),
    };
    connectCorridorNodes(rects, previous, node, connectorHeight);
    previous = node;
  }

  connectCorridorNodes(
    rects,
    previous,
    { x: rectCenterX(chamber), y: chamber.y, width: corridorWidth * 1.02 },
    connectorHeight,
  );

  previous = {
    x: rectCenterX(chamber),
    y: chamber.y + chamber.h,
    width: corridorWidth * 1.02,
  };
  for (let index = 1; index <= bottomNodeCount; index++) {
    const progress = index / (bottomNodeCount + 1);
    const node = {
      x: clamp(
        centerX +
          (hashNoise(index, currentWidth, 23) - 0.5) *
            driftLimit *
            (0.7 + (1 - progress) * 0.25),
        TEXT_HORIZONTAL_PADDING + corridorWidth / 2,
        currentWidth - TEXT_HORIZONTAL_PADDING - corridorWidth / 2,
      ),
      y: chamber.y + chamber.h + bottomTravel * progress,
      width: corridorWidth * (0.88 + hashNoise(index, currentHeight, 29) * 0.2),
    };
    connectCorridorNodes(rects, previous, node, connectorHeight);
    previous = node;
  }

  connectCorridorNodes(
    rects,
    previous,
    {
      x: clamp(
        centerX +
          (hashNoise(currentWidth, currentHeight, 31) - 0.5) *
            driftLimit *
            0.22,
        TEXT_HORIZONTAL_PADDING + corridorWidth / 2,
        currentWidth - TEXT_HORIZONTAL_PADDING - corridorWidth / 2,
      ),
      y: currentHeight - TEXT_VERTICAL_PADDING,
      width: corridorWidth,
    },
    connectorHeight,
  );

  const bayLength = clamp(205 * viewportScale, 138, 320);
  const bayHeight = clamp(92 * viewportScale, 68, 132);
  const bayY = clamp(
    rectCenterY(chamber) +
      (hashNoise(currentWidth, currentHeight, 37) - 0.5) * chamber.h * 0.42,
    TEXT_VERTICAL_PADDING + bayHeight / 2,
    currentHeight - TEXT_VERTICAL_PADDING - bayHeight / 2,
  );
  const baySide = hashNoise(currentWidth, currentHeight, 41) > 0.5 ? 1 : -1;
  rects.push({
    x:
      baySide > 0
        ? chamber.x + chamber.w - bayHeight * 0.25
        : chamber.x - bayLength + bayHeight * 0.25,
    y: bayY - bayHeight / 2,
    w: bayLength,
    h: bayHeight,
  });

  const spurLength = clamp(150 * viewportScale, 108, 230);
  const spurHeight = clamp(76 * viewportScale, 58, 112);
  const spurAnchorY = clamp(
    chamber.y - clamp(70 * stageScale, 56, 96),
    TEXT_VERTICAL_PADDING + spurHeight / 2,
    currentHeight - TEXT_VERTICAL_PADDING - spurHeight / 2,
  );
  rects.push({
    x:
      baySide > 0
        ? chamber.x - spurLength + spurHeight * 0.2
        : chamber.x + chamber.w - spurHeight * 0.2,
    y: spurAnchorY - spurHeight / 2,
    w: spurLength,
    h: spurHeight,
  });

  return rects;
}

function buildIslandCluster(
  anchorX: number,
  anchorY: number,
  seed: number,
  viewportScale: number,
): LayoutRect[] {
  const shapeNoise = hashNoise(seed, 1);
  const islandInsetX = getIslandInsetX();
  const minWidth = Math.min(
    currentWidth - TEXT_HORIZONTAL_PADDING * 2,
    maxCorpusTokenWidth + islandInsetX * 2 + 18,
  );
  const minHeight = clamp(96 * viewportScale, 80, 140);
  let width = clamp((178 + hashNoise(seed, 3) * 144) * viewportScale, minWidth, 340);
  let height = clamp((108 + hashNoise(seed, 5) * 116) * viewportScale, minHeight, 250);

  if (shapeNoise < 0.33) {
    width *= 1.34;
    height *= 0.74;
  } else if (shapeNoise < 0.66) {
    width *= 0.76;
    height *= 1.3;
  }

  const main: LayoutRect = {
    x: anchorX - width / 2,
    y: anchorY - height / 2,
    w: width,
    h: height,
  };
  const rects: LayoutRect[] = [main];
  const attachmentCount =
    hashNoise(seed, 7) > 0.8 ? 2 : hashNoise(seed, 11) > 0.3 ? 1 : 0;

  for (let index = 0; index < attachmentCount; index++) {
    const side = Math.floor(hashNoise(seed, 13 + index * 17) * 4);
    const along = (hashNoise(seed, 17 + index * 17) - 0.5) * 0.42;
    const overlap = clamp(18 * viewportScale, 10, 26);
    const wideAttachment = hashNoise(seed, 19 + index * 17) > 0.52;
    let rect: LayoutRect;

    if (side === 0 || side === 1) {
      const w = main.w * (0.34 + hashNoise(seed, 23 + index * 17) * 0.26);
      const h =
        main.h *
        (wideAttachment
          ? 0.8 + hashNoise(seed, 29 + index * 17) * 0.32
          : 0.44 + hashNoise(seed, 31 + index * 17) * 0.24);
      rect = {
        x: side === 0 ? main.x - w + overlap : main.x + main.w - overlap,
        y: main.y + (main.h - h) * 0.5 + main.h * along,
        w,
        h,
      };
    } else {
      const w =
        main.w *
        (wideAttachment
          ? 0.74 + hashNoise(seed, 37 + index * 17) * 0.28
          : 0.46 + hashNoise(seed, 41 + index * 17) * 0.24);
      const h = main.h * (0.34 + hashNoise(seed, 43 + index * 17) * 0.22);
      rect = {
        x: main.x + (main.w - w) * 0.5 + main.w * along,
        y: side === 2 ? main.y - h + overlap : main.y + main.h - overlap,
        w,
        h,
      };
    }

    rects.push(rect);
  }

  return rects;
}

function canPlaceIslandCluster(
  clusterRects: LayoutRect[],
  safeRect: SafeRect,
  corridorRects: LayoutRect[],
  placedRects: LayoutRect[],
  minGap: number,
): boolean {
  const islandInsetX = getIslandInsetX();
  const lineHeight = getIslandLineHeight();
  const minWidth = Math.min(
    currentWidth - TEXT_HORIZONTAL_PADDING * 2,
    maxCorpusTokenWidth + islandInsetX * 2,
  );
  const minHeight = Math.max(74, lineHeight * 2.4);

  for (let index = 0; index < clusterRects.length; index++) {
    const rect = clusterRects[index];
    if (rect === undefined) return false;
    if (!isRectInsideStage(rect)) return false;
    if (rect.w < minWidth || rect.h < minHeight) return false;
    if (rectsOverlap(rect, safeRect, minGap * 0.9)) return false;
    if (
      corridorRects.some((corridor) =>
        rectsOverlap(rect, corridor, minGap * 0.3),
      )
    ) {
      return false;
    }
    if (placedRects.some((placed) => rectsOverlap(rect, placed, minGap))) {
      return false;
    }
  }
  return true;
}

function buildFallbackIslandCandidates(): LayoutRect[] {
  const islandInsetX = getIslandInsetX();
  const baseWidth = clamp(
    Math.max(currentWidth * 0.22, maxCorpusTokenWidth + islandInsetX * 2 + 12),
    maxCorpusTokenWidth + islandInsetX * 2 + 12,
    currentWidth * 0.34,
  );
  const baseHeight = clamp(
    Math.max(currentHeight * 0.16, getIslandLineHeight() * 2.7),
    getIslandLineHeight() * 2.4,
    currentHeight * 0.24,
  );
  const anchors = [
    { x: 0.18, y: 0.18 },
    { x: 0.34, y: 0.2 },
    { x: 0.66, y: 0.2 },
    { x: 0.82, y: 0.18 },
    { x: 0.16, y: 0.35 },
    { x: 0.84, y: 0.35 },
    { x: 0.16, y: 0.65 },
    { x: 0.84, y: 0.65 },
    { x: 0.18, y: 0.82 },
    { x: 0.34, y: 0.8 },
    { x: 0.66, y: 0.8 },
    { x: 0.82, y: 0.82 },
  ];

  return anchors.map((anchor, index) => {
    const width = baseWidth * (0.92 + hashNoise(index, currentWidth, 151) * 0.18);
    const height =
      baseHeight * (0.9 + hashNoise(index, currentHeight, 157) * 0.2);
    const jitterX =
      (hashNoise(index, currentWidth, 163) - 0.5) * Math.min(34, currentWidth * 0.05);
    const jitterY =
      (hashNoise(index, currentHeight, 167) - 0.5) *
      Math.min(30, currentHeight * 0.045);

    return {
      x: clamp(
        currentWidth * anchor.x + jitterX - width / 2,
        TEXT_HORIZONTAL_PADDING,
        currentWidth - TEXT_HORIZONTAL_PADDING - width,
      ),
      y: clamp(
        currentHeight * anchor.y + jitterY - height / 2,
        TEXT_VERTICAL_PADDING,
        currentHeight - TEXT_VERTICAL_PADDING - height,
      ),
      w: width,
      h: height,
    };
  });
}

function buildIslandRects(
  safeRect: SafeRect,
  corridorRects: LayoutRect[],
): LayoutRect[] {
  const area = currentWidth * currentHeight;
  const viewportScale = getViewportFitScale();
  const clusters: LayoutCluster[] = [];
  const placedRects: LayoutRect[] = [];
  const targetClusters = Math.round(clamp(5 + area / 240_000, 5, 18));
  const minRects = Math.round(clamp(4 + area / 280_000, 5, 14));
  const maxRects = Math.round(clamp(14 + area / 140_000, 16, 44));
  const baseGap = clamp(24 * viewportScale, 14, 34);
  const safeCenterX = rectCenterX(safeRect);
  const safeCenterY = rectCenterY(safeRect);
  const maxAttempts = targetClusters * 48;

  for (
    let attempt = 0;
    attempt < maxAttempts &&
    clusters.length < targetClusters &&
    placedRects.length < maxRects;
    attempt++
  ) {
    const seed = attempt + currentWidth * 0.17 + currentHeight * 0.09;
    const mode = hashNoise(seed, 47);
    let anchorX = safeCenterX;
    let anchorY = safeCenterY;
    let nearCorridor = false;

    if (mode < 0.56) {
      const corridorIndex = Math.floor(
        hashNoise(seed, 53) * corridorRects.length,
      );
      const corridor = corridorRects[corridorIndex];
      if (corridor === undefined) continue;
      const side = hashNoise(seed, 59) > 0.5 ? 1 : -1;
      const flankGap = clamp(72 * viewportScale, 44, 110);
      anchorX =
        side > 0 ? corridor.x + corridor.w + flankGap : corridor.x - flankGap;
      anchorY = corridor.y + corridor.h * (0.18 + hashNoise(seed, 61) * 0.64);
      nearCorridor = true;
    } else if (mode < 0.82) {
      const angle = Math.floor(hashNoise(seed, 67) * 4);
      const offsetX =
        safeRect.w / 2 +
        clamp(120 * viewportScale, 72, 152) +
        hashNoise(seed, 71) * 88;
      const offsetY =
        safeRect.h / 2 +
        clamp(84 * viewportScale, 54, 124) +
        hashNoise(seed, 73) * 72;
      anchorX = safeCenterX + (angle % 2 === 0 ? -offsetX : offsetX);
      anchorY = safeCenterY + (angle < 2 ? -offsetY : offsetY);
    } else {
      anchorX =
        TEXT_HORIZONTAL_PADDING +
        hashNoise(seed, 79) * (currentWidth - TEXT_HORIZONTAL_PADDING * 2);
      anchorY =
        TEXT_VERTICAL_PADDING +
        hashNoise(seed, 83) * (currentHeight - TEXT_VERTICAL_PADDING * 2);
    }

    const clusterRects = buildIslandCluster(anchorX, anchorY, seed, viewportScale);
    const minGap = nearCorridor ? baseGap * 0.55 : baseGap;
    if (
      !canPlaceIslandCluster(
        clusterRects,
        safeRect,
        corridorRects,
        placedRects,
        minGap,
      )
    ) {
      continue;
    }

    const bounds = getRectBounds(clusterRects);
    const safeDist = Math.hypot(
      rectCenterX(bounds) - safeCenterX,
      rectCenterY(bounds) - safeCenterY,
    );
    let nearestCorridorGap = Number.POSITIVE_INFINITY;
    for (let index = 0; index < corridorRects.length; index++) {
      const corridor = corridorRects[index];
      if (corridor === undefined) continue;
      nearestCorridorGap = Math.min(
        nearestCorridorGap,
        getRectGap(bounds, corridor),
      );
    }

    const score =
      (nearCorridor ? 240 : 0) +
      Math.max(0, 180 - safeDist * 0.38) +
      Math.max(0, 110 - nearestCorridorGap * 1.8) +
      clusterRects.length * 14;

    clusters.push({ rects: clusterRects, score });
    placedRects.push(...clusterRects);
  }

  if (placedRects.length < minRects) {
    const fallbackCandidates = buildFallbackIslandCandidates();
    for (
      let index = 0;
      index < fallbackCandidates.length &&
      placedRects.length < minRects &&
      placedRects.length < maxRects;
      index++
    ) {
      const candidate = fallbackCandidates[index];
      if (candidate === undefined) continue;
      if (
        !canPlaceIslandCluster(
          [candidate],
          safeRect,
          corridorRects,
          placedRects,
          baseGap * 0.68,
        )
      ) {
        continue;
      }

      clusters.push({
        rects: [candidate],
        score: 160 - index * 3,
      });
      placedRects.push(candidate);
    }
  }

  clusters.sort((a, b) => b.score - a.score);
  return clusters.flatMap((cluster) => cluster.rects).slice(0, maxRects);
}

function buildAmbientGlyphs(
  safeRect: SafeRect,
  islandRects: LayoutRect[],
  corridorRects: LayoutRect[],
): AmbientGlyph[] {
  const ambientCount = Math.round(
    clamp(
      48 + (currentWidth * currentHeight) / 220_000,
      AMBIENT_GLYPH_MIN_COUNT,
      AMBIENT_GLYPH_MAX_COUNT,
    ),
  );
  const glyphs: AmbientGlyph[] = [];
  const maxAttempts = ambientCount * 18;

  for (
    let attempt = 0;
    attempt < maxAttempts && glyphs.length < ambientCount;
    attempt++
  ) {
    const x =
      TEXT_HORIZONTAL_PADDING +
      hashNoise(attempt, currentWidth, 131) *
        (currentWidth - TEXT_HORIZONTAL_PADDING * 2);
    const y =
      TEXT_VERTICAL_PADDING +
      hashNoise(attempt, currentHeight, 137) *
        (currentHeight - TEXT_VERTICAL_PADDING * 2);
    const probe: LayoutRect = { x: x - 14, y: y - 14, w: 28, h: 28 };
    if (rectsOverlap(probe, safeRect, 24)) continue;
    if (islandRects.some((island) => rectsOverlap(probe, island, 12))) continue;
    if (corridorRects.some((corridor) => rectsOverlap(probe, corridor, 16))) {
      continue;
    }

    const charIndex = Math.floor(
      hashNoise(attempt, 149) * AMBIENT_GLYPH_CHARS.length,
    );
    const char = AMBIENT_GLYPH_CHARS[charIndex] ?? AMBIENT_GLYPH_CHARS[0];
    glyphs.push(
      new AmbientGlyph(
        x,
        y,
        char,
        attempt + currentWidth * 0.1 + currentHeight * 0.05,
      ),
    );
  }

  return glyphs;
}

function appendToken(
  token: CorpusToken,
  startX: number,
  centerY: number,
  blocks: TextBlock[],
  fragment: DocumentFragment,
  maxBlocks: number,
): number {
  let currentX = startX;

  for (
    let graphemeIndex = 0;
    graphemeIndex < token.graphemes.length && blocks.length < maxBlocks;
    graphemeIndex++
  ) {
    const grapheme = token.graphemes[graphemeIndex];
    const graphemeWidth = token.graphemeWidths[graphemeIndex];
    if (grapheme === undefined || graphemeWidth === undefined) continue;
    const x = currentX + graphemeWidth / 2;
    const element = createTextElement(grapheme);
    fragment.appendChild(element);
    blocks.push(new TextBlock(x, centerY, grapheme, element));
    currentX += graphemeWidth;
  }

  return currentX;
}

function appendIslandLayout(
  rect: LayoutRect,
  blocks: TextBlock[],
  fragment: DocumentFragment,
  cursor: number,
  maxBlocks: number,
): number {
  const islandInsetX = getIslandInsetX();
  const islandInsetY = getIslandInsetY();
  const lineHeight = getIslandLineHeight();
  const wordGap = getIslandWordGap();
  const left = rect.x + islandInsetX;
  const right = rect.x + rect.w - islandInsetX;
  const top = rect.y + islandInsetY;
  const bottom = rect.y + rect.h - islandInsetY;
  const availableWidth = right - left;
  if (
    availableWidth < TEXT_CHAR_GAP * 2 ||
    availableWidth < maxCorpusTokenWidth ||
    corpusTokens.length === 0
  ) {
    return cursor;
  }

  for (
    let lineTop = top;
    lineTop + lineHeight <= bottom && blocks.length < maxBlocks;
    lineTop += lineHeight
  ) {
    const centerY = lineTop + lineHeight / 2;
    let currentX = left;
    let placedTokens = 0;
    let skippedTokens = 0;

    while (blocks.length < maxBlocks && skippedTokens < corpusTokens.length) {
      const token = corpusTokens[cursor % corpusTokens.length];
      if (token === undefined) break;

      if (token.width > availableWidth) {
        cursor = (cursor + 1) % corpusTokens.length;
        skippedTokens++;
        continue;
      }

      const gap = placedTokens > 0 ? wordGap : 0;
      if (placedTokens > 0 && currentX + gap + token.width > right) break;

      currentX += gap;
      currentX = appendToken(
        token,
        currentX,
        centerY,
        blocks,
        fragment,
        maxBlocks,
      );
      cursor = (cursor + 1) % corpusTokens.length;
      placedTokens++;
      skippedTokens = 0;
    }

    if (placedTokens === 0) break;
  }

  return cursor;
}

export function buildStageLayout(
  stageWidth: number,
  stageHeight: number,
  textLayer: HTMLDivElement,
): StageLayout {
  currentWidth = stageWidth;
  currentHeight = stageHeight;
  textLayer.replaceChildren();

  const blocks: TextBlock[] = [];
  const safeZoneScale = getSafeZoneScale();
  const safeZoneWidth = SAFE_ZONE_WIDTH * safeZoneScale;
  const safeZoneHeight = SAFE_ZONE_HEIGHT * safeZoneScale;
  const safeRect: SafeRect = {
    x: currentWidth / 2 - safeZoneWidth / 2,
    y: currentHeight / 2 - safeZoneHeight / 2,
    w: safeZoneWidth,
    h: safeZoneHeight,
  };

  const maxBlocks = Math.round(
    clamp(1500 + (currentWidth * currentHeight) / 5_500, 1500, TEXT_MAX_BLOCKS),
  );
  const corridorRects = buildCorridorRects(safeRect);
  const islandRects = buildIslandRects(safeRect, corridorRects);
  const ambient = buildAmbientGlyphs(safeRect, islandRects, corridorRects);

  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (let islandIndex = 0; islandIndex < islandRects.length; islandIndex++) {
    const island = islandRects[islandIndex];
    if (island === undefined) continue;
    cursor = appendIslandLayout(island, blocks, fragment, cursor, maxBlocks);
    if (blocks.length >= maxBlocks) break;
  }

  textLayer.appendChild(fragment);
  return { textBlocks: blocks, ambientGlyphs: ambient };
}
