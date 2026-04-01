import {
  layoutNextLine,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
import noisejs from "noisejs";

import {
  AMBIENT_GLYPH_CHARS,
  AMBIENT_GLYPH_MAX_COUNT,
  AMBIENT_GLYPH_MIN_COUNT,
  SAFE_ZONE_HEIGHT,
  SAFE_ZONE_WIDTH,
  TEXT_FONT,
  TEXT_HORIZONTAL_PADDING,
  TEXT_LINE_HEIGHT,
  TEXT_MAX_BLOCKS,
  TEXT_VERTICAL_PADDING,
  TEXT_CORPUS_WORDS,
} from "./constants";
import { AmbientGlyph, TextBlock } from "./entities";
import { clamp, getTextBucketKey, hashNoise } from "./utils";

import type { SafeRect } from "./types";

type NoiseInstance = {
  perlin2: (x: number, y: number) => number;
};

type NoiseModule = {
  Noise: new (seed?: number) => NoiseInstance;
};

export type StageLayout = {
  textBlocks: TextBlock[];
  ambientGlyphs: AmbientGlyph[];
};

export type StageLayoutOptions = {
  seed?: number;
};

type TerrainMask = {
  cellSize: number;
  cols: number;
  rows: number;
  passable: Uint8Array;
  channel: Uint8Array;
  mainCenters: Float32Array;
};

type TerrainTextSlot = {
  left: number;
  right: number;
};

const noiseCtor = (noisejs as unknown as NoiseModule).Noise;
const LINE_START_CURSOR: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
const LAYOUT_FIT_MAX_WIDTH = 1_000_000;
const MIN_SLOT_WIDTH = 36;
const TERRAIN_TEXT_THRESHOLD = 0.52;
const TERRAIN_BASE_FREQUENCY = 0.08;

let currentWidth = 0;
let currentHeight = 0;

type CorpusToken = {
  text: string;
  graphemes: string[];
  graphemeWidths: number[];
  width: number;
  prepared: PreparedTextWithSegments;
  fullEnd: LayoutCursor;
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

function sameCursor(a: LayoutCursor, b: LayoutCursor): boolean {
  return (
    a.segmentIndex === b.segmentIndex && a.graphemeIndex === b.graphemeIndex
  );
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
  const fullLine = layoutNextLine(
    prepared,
    LINE_START_CURSOR,
    LAYOUT_FIT_MAX_WIDTH,
  );
  const fullEnd = fullLine?.end ?? {
    segmentIndex: prepared.segments.length,
    graphemeIndex: 0,
  };

  return { text, graphemes, graphemeWidths, width, prepared, fullEnd };
}

const corpusTokens = TEXT_CORPUS_WORDS.map((word) => buildCorpusToken(word));

function getViewportFitScale(): number {
  return clamp(Math.min(currentWidth / 1280, currentHeight / 800), 0.78, 1.16);
}

function getSafeZoneScale(): number {
  return clamp(Math.min(currentWidth / 1100, currentHeight / 760), 0.82, 1);
}

function getLineHeight(): number {
  return clamp(
    TEXT_LINE_HEIGHT * (0.9 + getViewportFitScale() * 0.1),
    26,
    TEXT_LINE_HEIGHT,
  );
}

function getWordGap(): number {
  return clamp(
    corpusWordGap * (0.88 + getViewportFitScale() * 0.12),
    10,
    corpusWordGap,
  );
}

function createTextElement(char: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = "text-block";
  element.textContent = char;
  element.style.transform = "translate(-50%, -50%)";
  return element;
}

function appendToken(
  token: CorpusToken,
  startX: number,
  centerY: number,
  blocks: TextBlock[],
  fragment: DocumentFragment,
): number {
  let currentX = startX;

  for (
    let graphemeIndex = 0;
    graphemeIndex < token.graphemes.length;
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

function terrainIndex(mask: TerrainMask, col: number, row: number): number {
  return row * mask.cols + col;
}

function isPointInsideRect(
  x: number,
  y: number,
  rect: SafeRect,
  padding = 0,
): boolean {
  return (
    x >= rect.x - padding &&
    x <= rect.x + rect.w + padding &&
    y >= rect.y - padding &&
    y <= rect.y + rect.h + padding
  );
}

function sampleFbmPerlin(noise: NoiseInstance, x: number, y: number): number {
  let amplitude = 0.58;
  let frequency = 1;
  let total = 0;
  let totalAmplitude = 0;

  for (let octave = 0; octave < 4; octave++) {
    total += noise.perlin2(x * frequency, y * frequency) * amplitude;
    totalAmplitude += amplitude;
    amplitude *= 0.52;
    frequency *= 2.03;
  }

  return total / Math.max(totalAmplitude, 0.0001);
}

function carveCorridorRow(
  mask: TerrainMask,
  row: number,
  centerX: number,
  width: number,
): void {
  if (row < 0 || row >= mask.rows) return;
  const halfWidth = width / 2;

  for (let col = 0; col < mask.cols; col++) {
    const cellCenterX = col * mask.cellSize + mask.cellSize / 2;
    if (Math.abs(cellCenterX - centerX) > halfWidth) continue;
    const index = terrainIndex(mask, col, row);
    mask.passable[index] = 1;
    mask.channel[index] = 1;
  }
}

function carveCorridorBand(
  mask: TerrainMask,
  row: number,
  centerX: number,
  width: number,
  featherRows: number,
): void {
  for (let rowOffset = -featherRows; rowOffset <= featherRows; rowOffset++) {
    const targetRow = row + rowOffset;
    if (targetRow < 0 || targetRow >= mask.rows) continue;
    const influence = 1 - Math.abs(rowOffset) / Math.max(1, featherRows + 1);
    const rowWidth = width * (0.72 + influence * 0.28);
    carveCorridorRow(mask, targetRow, centerX, rowWidth);
  }
}

function carveSafeZone(mask: TerrainMask, safeRect: SafeRect): void {
  for (let row = 0; row < mask.rows; row++) {
    for (let col = 0; col < mask.cols; col++) {
      const x = col * mask.cellSize + mask.cellSize / 2;
      const y = row * mask.cellSize + mask.cellSize / 2;
      if (!isPointInsideRect(x, y, safeRect, 22)) continue;
      const index = terrainIndex(mask, col, row);
      mask.passable[index] = 1;
      mask.channel[index] = 1;
    }
  }
}

function buildNoiseTerrainMask(seed: number, safeRect: SafeRect): TerrainMask {
  const viewportScale = getViewportFitScale();
  const cellSize = clamp(
    Math.round(18 * (0.88 + viewportScale * 0.14)),
    14,
    24,
  );
  const cols = Math.max(1, Math.ceil(currentWidth / cellSize));
  const rows = Math.max(1, Math.ceil(currentHeight / cellSize));
  const passable = new Uint8Array(cols * rows);
  const channel = new Uint8Array(cols * rows);
  const mainCenters = new Float32Array(rows);
  const mask: TerrainMask = {
    cellSize,
    cols,
    rows,
    passable,
    channel,
    mainCenters,
  };
  const noise = new noiseCtor(seed / 65_536);
  const seedX = seed * 0.000031;
  const seedY = seed * 0.000047;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * TERRAIN_BASE_FREQUENCY + seedX;
      const y = row * TERRAIN_BASE_FREQUENCY + seedY;
      const fbm = sampleFbmPerlin(noise, x, y);
      const macro = noise.perlin2(x * 0.37 + 21.7, y * 0.37 + 11.3);
      const textStrength = (fbm + 1) * 0.5 * 0.78 + (macro + 1) * 0.5 * 0.22;
      const index = terrainIndex(mask, col, row);
      passable[index] = textStrength > TERRAIN_TEXT_THRESHOLD ? 0 : 1;
    }
  }

  const mainBaseWidth = clamp(170 * viewportScale, 130, 284);
  const corridorPadding = clamp(mainBaseWidth * 0.6, 76, 168);

  for (let row = 0; row < rows; row++) {
    const yProgress = row / Math.max(1, rows - 1);
    const driftLarge = noise.perlin2(13.4 + seedX, yProgress * 1.8 + seedY);
    const driftSmall = noise.perlin2(31.9 + seedX, yProgress * 5 + seedY * 1.3);
    const centerX = clamp(
      currentWidth * 0.5 +
        driftLarge * currentWidth * 0.17 +
        driftSmall * currentWidth * 0.06,
      TEXT_HORIZONTAL_PADDING + corridorPadding,
      currentWidth - TEXT_HORIZONTAL_PADDING - corridorPadding,
    );
    mainCenters[row] = centerX;

    const widthNoise = noise.perlin2(
      69.7 + seedX,
      yProgress * 4.6 + seedY * 1.8,
    );
    const width = clamp(
      mainBaseWidth + widthNoise * clamp(44 * viewportScale, 24, 72),
      clamp(114 * viewportScale, 92, 150),
      clamp(286 * viewportScale, 230, 342),
    );
    carveCorridorBand(mask, row, centerX, width, 1);
  }

  const branchCount = hashNoise(seed, 401) > 0.52 ? 2 : 1;
  const firstBranchSide = hashNoise(seed, 409) > 0.5 ? 1 : -1;

  for (let branchIndex = 0; branchIndex < branchCount; branchIndex++) {
    const side = branchIndex === 0 ? firstBranchSide : -firstBranchSide;
    const startRatio = 0.18 + hashNoise(seed, 419 + branchIndex * 17) * 0.44;
    const spanRatio = 0.24 + hashNoise(seed, 431 + branchIndex * 17) * 0.24;
    const startRow = Math.floor(startRatio * (rows - 1));
    const endRow = Math.min(rows - 1, startRow + Math.floor(spanRatio * rows));
    const lateralReach =
      clamp(currentWidth * 0.2, 130, 260) *
      (0.84 + hashNoise(seed, 443 + branchIndex * 17) * 0.34);

    for (let row = startRow; row <= endRow; row++) {
      const progress = (row - startRow) / Math.max(1, endRow - startRow);
      const rowCenter = mainCenters[row] ?? currentWidth * 0.5;
      const arc = Math.sin(progress * Math.PI);
      const wobble =
        noise.perlin2(92 + branchIndex * 8 + seedX, row * 0.12 + seedY) *
        clamp(currentWidth * 0.045, 24, 62);
      const branchCenterX = clamp(
        rowCenter + side * lateralReach * arc + wobble * 0.35,
        TEXT_HORIZONTAL_PADDING + corridorPadding * 0.4,
        currentWidth - TEXT_HORIZONTAL_PADDING - corridorPadding * 0.4,
      );
      const widthNoise =
        noise.perlin2(
          141 + branchIndex * 11 + seedX,
          row * 0.16 + seedY * 1.7,
        ) * clamp(22 * viewportScale, 12, 34);
      const branchWidth = clamp(mainBaseWidth * 0.72 + widthNoise, 82, 210);
      carveCorridorBand(mask, row, branchCenterX, branchWidth, 0);
    }
  }

  carveSafeZone(mask, safeRect);
  return mask;
}

function isPassableAt(mask: TerrainMask, x: number, y: number): boolean {
  const col = clamp(Math.floor(x / mask.cellSize), 0, mask.cols - 1);
  const row = clamp(Math.floor(y / mask.cellSize), 0, mask.rows - 1);
  return mask.passable[terrainIndex(mask, col, row)] === 1;
}

function isChannelAt(mask: TerrainMask, x: number, y: number): boolean {
  const col = clamp(Math.floor(x / mask.cellSize), 0, mask.cols - 1);
  const row = clamp(Math.floor(y / mask.cellSize), 0, mask.rows - 1);
  return mask.channel[terrainIndex(mask, col, row)] === 1;
}

function buildTextSlotsForBand(
  terrain: TerrainMask,
  lineTop: number,
  lineHeight: number,
): TerrainTextSlot[] {
  const rowStart = clamp(
    Math.floor(lineTop / terrain.cellSize),
    0,
    terrain.rows - 1,
  );
  const rowEnd = clamp(
    Math.floor((lineTop + lineHeight - 1) / terrain.cellSize),
    0,
    terrain.rows - 1,
  );
  const slotPadding = clamp(terrain.cellSize * 0.16, 2, 5);
  const slots: TerrainTextSlot[] = [];
  let runStartCol = -1;

  for (let col = 0; col <= terrain.cols; col++) {
    const isTextCell = (() => {
      if (col >= terrain.cols) return false;
      for (let row = rowStart; row <= rowEnd; row++) {
        if (terrain.passable[terrainIndex(terrain, col, row)] === 0)
          return true;
      }
      return false;
    })();

    if (isTextCell) {
      if (runStartCol < 0) runStartCol = col;
      continue;
    }

    if (runStartCol < 0) continue;

    const left = clamp(
      runStartCol * terrain.cellSize + slotPadding,
      TEXT_HORIZONTAL_PADDING,
      currentWidth - TEXT_HORIZONTAL_PADDING,
    );
    const right = clamp(
      col * terrain.cellSize - slotPadding,
      TEXT_HORIZONTAL_PADDING,
      currentWidth - TEXT_HORIZONTAL_PADDING,
    );

    if (right - left >= MIN_SLOT_WIDTH) {
      slots.push({ left, right });
    }
    runStartCol = -1;
  }

  return slots;
}

function tokenFitsWidth(token: CorpusToken, availableWidth: number): boolean {
  if (token.width > availableWidth) return false;
  const line = layoutNextLine(
    token.prepared,
    LINE_START_CURSOR,
    availableWidth,
  );
  if (line === null) return false;
  return sameCursor(line.end, token.fullEnd);
}

function appendSlotLayout(
  slot: TerrainTextSlot,
  centerY: number,
  blocks: TextBlock[],
  fragment: DocumentFragment,
  cursor: number,
  blockLimit: number,
): number {
  if (corpusTokens.length === 0) return cursor;

  const wordGap = getWordGap();
  let currentX = slot.left;
  let placedTokens = 0;
  let skippedTokens = 0;

  while (blocks.length < blockLimit && skippedTokens < corpusTokens.length) {
    const token = corpusTokens[cursor % corpusTokens.length];
    if (token === undefined) break;

    const gap = placedTokens > 0 ? wordGap : 0;
    const availableWidth = slot.right - (currentX + gap);
    if (availableWidth < MIN_SLOT_WIDTH) break;

    if (!tokenFitsWidth(token, availableWidth)) {
      if (placedTokens > 0) break;
      cursor = (cursor + 1) % corpusTokens.length;
      skippedTokens++;
      continue;
    }

    if (blocks.length + token.graphemes.length > blockLimit) {
      if (placedTokens > 0) break;
      cursor = (cursor + 1) % corpusTokens.length;
      skippedTokens++;
      continue;
    }

    currentX += gap;
    currentX = appendToken(token, currentX, centerY, blocks, fragment);
    cursor = (cursor + 1) % corpusTokens.length;
    placedTokens++;
    skippedTokens = 0;
  }

  return cursor;
}

function buildAmbientGlyphs(
  safeRect: SafeRect,
  terrain: TerrainMask,
  seed: number,
): AmbientGlyph[] {
  const ambientCount = Math.round(
    clamp(
      48 + (currentWidth * currentHeight) / 220_000,
      AMBIENT_GLYPH_MIN_COUNT,
      AMBIENT_GLYPH_MAX_COUNT,
    ),
  );
  const glyphs: AmbientGlyph[] = [];
  const maxAttempts = ambientCount * 28;

  for (
    let attempt = 0;
    attempt < maxAttempts && glyphs.length < ambientCount;
    attempt++
  ) {
    const x =
      TEXT_HORIZONTAL_PADDING +
      hashNoise(seed, attempt, currentWidth, 131) *
        (currentWidth - TEXT_HORIZONTAL_PADDING * 2);
    const y =
      TEXT_VERTICAL_PADDING +
      hashNoise(seed, attempt, currentHeight, 137) *
        (currentHeight - TEXT_VERTICAL_PADDING * 2);

    if (isPointInsideRect(x, y, safeRect, 24)) continue;
    if (!isPassableAt(terrain, x, y)) continue;
    if (isChannelAt(terrain, x, y)) continue;

    const charIndex = Math.floor(
      hashNoise(seed, attempt, 149) * AMBIENT_GLYPH_CHARS.length,
    );
    const char = AMBIENT_GLYPH_CHARS[charIndex] ?? AMBIENT_GLYPH_CHARS[0];
    glyphs.push(new AmbientGlyph(x, y, char, seed + attempt * 1.73));
  }

  return glyphs;
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

export function buildStageLayout(
  stageWidth: number,
  stageHeight: number,
  textLayer: HTMLDivElement,
  options: StageLayoutOptions = {},
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

  const seed = options.seed ?? Math.floor(Math.random() * 65_536);
  const terrain = buildNoiseTerrainMask(seed, safeRect);
  const ambient = buildAmbientGlyphs(safeRect, terrain, seed);

  const maxBlocks = Math.round(
    clamp(1500 + (currentWidth * currentHeight) / 5_500, 1500, TEXT_MAX_BLOCKS),
  );

  const lineHeight = getLineHeight();
  const minLineTop = TEXT_VERTICAL_PADDING;
  const maxLineBottom = currentHeight - TEXT_VERTICAL_PADDING;
  const totalLineCount = Math.max(
    0,
    Math.floor((maxLineBottom - minLineTop) / lineHeight),
  );
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  let lineIndex = 0;

  for (
    let lineTop = minLineTop;
    lineTop + lineHeight <= maxLineBottom && blocks.length < maxBlocks;
    lineTop += lineHeight
  ) {
    const remainingLineCount = totalLineCount - lineIndex;
    if (remainingLineCount <= 0) break;
    const remainingBlockBudget = maxBlocks - blocks.length;
    if (remainingBlockBudget <= 0) break;
    const lineBudget = Math.max(
      1,
      Math.ceil(remainingBlockBudget / remainingLineCount),
    );
    const lineBlockLimit = Math.min(maxBlocks, blocks.length + lineBudget);

    const centerY = lineTop + lineHeight / 2;
    const slots = buildTextSlotsForBand(terrain, lineTop, lineHeight);

    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const slot = slots[slotIndex];
      if (slot === undefined) continue;
      cursor = appendSlotLayout(
        slot,
        centerY,
        blocks,
        fragment,
        cursor,
        lineBlockLimit,
      );
      if (blocks.length >= lineBlockLimit || blocks.length >= maxBlocks) break;
    }

    lineIndex++;
  }

  textLayer.appendChild(fragment);
  return { textBlocks: blocks, ambientGlyphs: ambient };
}
