import {
  layoutNextLine,
  prepareWithSegments,
  type LayoutCursor,
  type LayoutLine,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
import Stats from "stats.js";

type GameState = "start" | "playing" | "paused" | "gameover";

type BuffKey = "freeze" | "rapid" | "invincible" | "barrage";

type Buffs = Record<BuffKey, number>;

type MouseState = {
  x: number;
  y: number;
  isDown: boolean;
};

type TankState = {
  x: number;
  y: number;
  radius: number;
  angle: number;
  color: string;
  speed: number;
  lastShot: number;
  fireRate: number;
};

type PowerUpDef = {
  type: BuffKey;
  char: string;
  color: string;
  duration: number;
};

type LayoutSlot = {
  left: number;
  right: number;
};

type SafeRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type StageDomRefs = {
  stage: HTMLDivElement;
  textLayer: HTMLDivElement;
  powerUpLayer: HTMLDivElement;
  enemyLayer: HTMLDivElement;
  bulletLayer: HTMLDivElement;
  particleLayer: HTMLDivElement;
  tankLayer: HTMLDivElement;
  tank: HTMLDivElement;
  tankShield: HTMLDivElement;
  uiContainer: HTMLDivElement;
  hud: HTMLDivElement;
  pauseUI: HTMLDivElement;
  gameOverUI: HTMLDivElement;
  scoreDisplay: HTMLSpanElement;
  finalScoreDisplay: HTMLSpanElement;
  buffDisplay: HTMLDivElement;
  startBtn: HTMLButtonElement;
  restartBtn: HTMLButtonElement;
};

type DomPoolItem<T extends HTMLElement> = {
  element: T;
};

const TEXT_FONT = '18px "Trebuchet MS", Verdana, sans-serif';
const TEXT_LINE_HEIGHT = 30;
const TEXT_CHAR_GAP = 18;
const TEXT_VERTICAL_PADDING = 22;
const TEXT_HORIZONTAL_PADDING = 28;
const SAFE_ZONE_WIDTH = 230;
const SAFE_ZONE_HEIGHT = 230;
const TEXT_REPEL_RADIUS = 120;
const TEXT_RESPAWN_DELAY = 240;
const TEXT_RESPAWN_DURATION = 90;
const TEXT_RESPAWN_STAGGER = 90;
const TEXT_BUCKET_SIZE = 48;
const TEXT_REPEL_RADIUS_SQ = TEXT_REPEL_RADIUS * TEXT_REPEL_RADIUS;

const textCorpus =
  "在这片数字荒原中文字不仅是承载信息的媒介它们构成了物理的边界与防线当错误的数据流从四面八方涌来排版引擎开始重组为了维持系统的秩序你必须在这个动态的网格中穿梭每一次射击不仅是毁灭也是重构利用文字作为掩体生存下去直到最后一个周期结束。排版防线启动，文字避让协议生效，检测到敌对节点靠近。";
const playerBulletChars = ["破", "灭", "碎", "击", "斩"] as const;
const enemyBulletChars = ["厄", "凶", "死", "噬", "虚"] as const;
const powerUpTypes: PowerUpDef[] = [
  { type: "freeze", char: "冰", color: "#60a5fa", duration: 600 },
  { type: "rapid", char: "连", color: "#fbbf24", duration: 600 },
  { type: "invincible", char: "盾", color: "#a78bfa", duration: 900 },
  { type: "barrage", char: "环", color: "#fb7185", duration: 480 },
];

let cw = 0;
let ch = 0;
let gameState: GameState = "start";
let score = 0;
let frameCount = 0;
const buffs: Buffs = { freeze: 0, rapid: 0, invincible: 0, barrage: 0 };
const mouse: MouseState = { x: -1000, y: -1000, isDown: false };

let textGrid: TextBlock[] = [];
let bullets: Bullet[] = [];
let enemies: Enemy[] = [];
let particles: Particle[] = [];
let powerUps: PowerUp[] = [];

let preparedCorpus: PreparedTextWithSegments | null = null;
let updateTimer: number | null = null;
let gameOverRevealTimer: number | null = null;
let gameOverFadeTimer: number | null = null;

const bulletPool: Array<DomPoolItem<HTMLSpanElement>> = [];
const enemyPool: Array<DomPoolItem<HTMLDivElement>> = [];
const particlePool: Array<DomPoolItem<HTMLDivElement>> = [];
const powerUpPool: Array<DomPoolItem<HTMLDivElement>> = [];
const preparedCorpusCache = new Map<number, PreparedTextWithSegments>();
const glyphWidthCache = new Map<string, number>();
const textBuckets = new Map<string, TextBlock[]>();

let lastBuffDisplayText = "";

const tank: TankState = {
  x: 0,
  y: 0,
  radius: 16,
  angle: 0,
  color: "#06b6d4",
  speed: 0.15,
  lastShot: 0,
  fireRate: 15,
};

const graphemeSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

const measureContextRaw = document.createElement("canvas").getContext("2d");
if (measureContextRaw === null) {
  throw new Error("Unable to create a measurement context for Pretext layout.");
}
const measureContext = measureContextRaw;
measureContext.font = TEXT_FONT;

const dom = buildStageDom();
const fpsMonitor = buildFpsMonitor();

class TextBlock {
  originX: number;
  originY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  char: string;
  dead: boolean;
  hp: number;
  color: string;
  alpha: number;
  respawnFrame: number;
  element: HTMLSpanElement;
  lastRenderX: number | null;
  lastRenderY: number | null;
  lastRenderColor: string | null;
  lastRenderAlpha: number | null;
  isRenderedVisible: boolean;

  constructor(x: number, y: number, char: string, element: HTMLSpanElement) {
    this.originX = x;
    this.originY = y;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.char = char;
    this.dead = false;
    this.hp = 1;
    this.color = "#334155";
    this.alpha = 1;
    this.respawnFrame = 0;
    this.element = element;
    this.lastRenderX = null;
    this.lastRenderY = null;
    this.lastRenderColor = null;
    this.lastRenderAlpha = null;
    this.isRenderedVisible = false;
  }

  destroy(): void {
    this.dead = true;
    this.alpha = 0;
    this.color = "#334155";
    this.respawnFrame =
      frameCount +
      TEXT_RESPAWN_DELAY +
      Math.floor(Math.random() * TEXT_RESPAWN_STAGGER);
  }

  applyRecoveryForces(): void {
    this.vx += (this.originX - this.x) * 0.03;
    this.vy += (this.originY - this.y) * 0.03;
    this.vx *= 0.85;
    this.vy *= 0.85;

    this.x += this.vx;
    this.y += this.vy;
  }

  update(): void {
    if (this.dead) {
      this.applyRecoveryForces();

      if (frameCount >= this.respawnFrame) {
        const progress = Math.min(
          1,
          (frameCount - this.respawnFrame) / TEXT_RESPAWN_DURATION,
        );
        this.alpha = progress;
        this.color = "#475569";

        if (progress >= 1) {
          this.dead = false;
          this.alpha = 1;
          this.color = "#334155";
        }
      }
      return;
    }

    this.alpha = 1;
    const dx = tank.x - this.x;
    const dy = tank.y - this.y;
    const distSq = dx * dx + dy * dy;

    if (
      distSq > 0.001 &&
      distSq < TEXT_REPEL_RADIUS_SQ &&
      gameState === "playing"
    ) {
      const dist = Math.sqrt(distSq);
      const force = (TEXT_REPEL_RADIUS - dist) / TEXT_REPEL_RADIUS;
      this.vx -= (dx / dist) * force * 1.5;
      this.vy -= (dy / dist) * force * 1.5;
      this.color = "#64748b";
    } else {
      this.color = "#334155";
    }

    this.applyRecoveryForces();
  }
}

class Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  isPlayer: boolean;
  radius: number;
  active: boolean;
  char: string;

  constructor(x: number, y: number, vx: number, vy: number, isPlayer: boolean) {
    this.x = x + vx * 2;
    this.y = y + vy * 2;
    this.vx = vx;
    this.vy = vy;
    this.isPlayer = isPlayer;
    this.radius = 8;
    this.active = true;
    this.char = isPlayer
      ? (playerBulletChars[
          Math.floor(Math.random() * playerBulletChars.length)
        ] ?? playerBulletChars[0])
      : (enemyBulletChars[
          Math.floor(Math.random() * enemyBulletChars.length)
        ] ?? enemyBulletChars[0]);
  }

  update(): void {
    this.x += this.vx;
    this.y += this.vy;

    if (this.x < 0 || this.x > cw || this.y < 0 || this.y > ch) {
      this.active = false;
      return;
    }

    const baseBucketX = Math.floor(this.x / TEXT_BUCKET_SIZE);
    const baseBucketY = Math.floor(this.y / TEXT_BUCKET_SIZE);
    for (let bucketY = baseBucketY - 1; bucketY <= baseBucketY + 1; bucketY++) {
      for (
        let bucketX = baseBucketX - 1;
        bucketX <= baseBucketX + 1;
        bucketX++
      ) {
        const bucket = textBuckets.get(`${bucketX},${bucketY}`);
        if (bucket === undefined) continue;

        for (let i = 0; i < bucket.length; i++) {
          const textBlock = bucket[i];
          if (textBlock === undefined || textBlock.dead) continue;
          if (
            circlesOverlap(
              this.x,
              this.y,
              this.radius,
              textBlock.x,
              textBlock.y,
              10,
            )
          ) {
            textBlock.destroy();
            this.active = false;
            createExplosion(
              this.x,
              this.y,
              this.isPlayer ? "#06b6d4" : "#ef4444",
              5,
            );
            return;
          }
        }
      }
    }
  }
}

class PowerUp {
  x: number;
  y: number;
  radius: number;
  def: PowerUpDef;
  spawnTime: number;

  constructor() {
    this.x = Math.random() * Math.max(cw - 100, 100) + 50;
    this.y = Math.random() * Math.max(ch - 100, 100) + 50;
    this.radius = 16;
    const index = Math.floor(Math.random() * powerUpTypes.length);
    this.def = powerUpTypes[index] ?? powerUpTypes[0];
    this.spawnTime = frameCount;
  }
}

class Enemy {
  x: number;
  y: number;
  radius: number;
  speed: number;
  active: boolean;
  lastShot: number;
  fireRate: number;
  color: string;
  angle: number;

  constructor() {
    this.radius = 14;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) {
      this.x = Math.random() * cw;
      this.y = -30;
    } else if (side === 1) {
      this.x = cw + 30;
      this.y = Math.random() * ch;
    } else if (side === 2) {
      this.x = Math.random() * cw;
      this.y = ch + 30;
    } else {
      this.x = -30;
      this.y = Math.random() * ch;
    }

    this.speed = Math.random() * 1.5 + 1;
    this.active = true;
    this.lastShot = frameCount + Math.random() * 100;
    this.fireRate = 120 + Math.random() * 60;
    this.color = "#ef4444";
    this.angle = 0;
  }

  update(): void {
    if (buffs.freeze > frameCount) return;

    const dx = tank.x - this.x;
    const dy = tank.y - this.y;
    const dist = Math.hypot(dx, dy);

    this.angle = Math.atan2(dy, dx);
    if (dist > 0.001) {
      this.x += (dx / dist) * this.speed;
      this.y += (dy / dist) * this.speed;
    }

    if (frameCount - this.lastShot >= this.fireRate) {
      const bulletSpeed = 5;
      bullets.push(
        new Bullet(
          this.x,
          this.y,
          Math.cos(this.angle) * bulletSpeed,
          Math.sin(this.angle) * bulletSpeed,
          false,
        ),
      );
      this.lastShot = frameCount;
    }
  }
}

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  decay: number;
  size: number;

  constructor(x: number, y: number, color: string) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 8;
    this.vy = (Math.random() - 0.5) * 8;
    this.color = color;
    this.alpha = 1;
    this.decay = Math.random() * 0.05 + 0.02;
    this.size = Math.random() * 3 + 1;
  }

  update(): void {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= this.decay;
  }
}

function getRequiredElement<T extends HTMLElement>(
  id: string,
  ctor: { new (): T },
): T {
  const element = document.getElementById(id);
  if (!(element instanceof ctor)) {
    throw new Error(`Expected #${id} to be a ${ctor.name}.`);
  }
  return element;
}

function buildStageDom(): StageDomRefs {
  const stage = getRequiredElement("gameStage", HTMLDivElement);
  const textLayer = getRequiredElement("textLayer", HTMLDivElement);
  const powerUpLayer = getRequiredElement("powerUpLayer", HTMLDivElement);
  const enemyLayer = getRequiredElement("enemyLayer", HTMLDivElement);
  const bulletLayer = getRequiredElement("bulletLayer", HTMLDivElement);
  const particleLayer = getRequiredElement("particleLayer", HTMLDivElement);
  const tankLayer = getRequiredElement("tankLayer", HTMLDivElement);
  const uiContainer = getRequiredElement("uiContainer", HTMLDivElement);
  const hud = getRequiredElement("hud", HTMLDivElement);
  const pauseUI = getRequiredElement("pauseUI", HTMLDivElement);
  const gameOverUI = getRequiredElement("gameOverUI", HTMLDivElement);
  const scoreDisplay = getRequiredElement("scoreDisplay", HTMLSpanElement);
  const finalScoreDisplay = getRequiredElement("finalScore", HTMLSpanElement);
  const buffDisplay = getRequiredElement("buffDisplay", HTMLDivElement);
  const startBtn = getRequiredElement("startBtn", HTMLButtonElement);
  const restartBtn = getRequiredElement("restartBtn", HTMLButtonElement);

  const tankElement = document.createElement("div");
  tankElement.className = "tank";
  tankElement.style.display = "none";

  const tankBarrel = document.createElement("div");
  tankBarrel.className = "tank-barrel";
  const tankBody = document.createElement("div");
  tankBody.className = "tank-body";
  const tankCore = document.createElement("div");
  tankCore.className = "tank-core";
  const tankShield = document.createElement("div");
  tankShield.className = "tank-shield";

  tankElement.append(tankBarrel, tankBody, tankCore, tankShield);
  tankLayer.appendChild(tankElement);

  return {
    stage,
    textLayer,
    powerUpLayer,
    enemyLayer,
    bulletLayer,
    particleLayer,
    tankLayer,
    tank: tankElement,
    tankShield,
    uiContainer,
    hud,
    pauseUI,
    gameOverUI,
    scoreDisplay,
    finalScoreDisplay,
    buffDisplay,
    startBtn,
    restartBtn,
  };
}

function buildFpsMonitor(): Stats {
  const stats = new Stats();
  stats.showPanel(0);
  stats.dom.setAttribute("aria-hidden", "true");
  stats.dom.title = "Click to switch performance panel";
  stats.dom.style.left = "auto";
  stats.dom.style.top = "auto";
  stats.dom.style.right = "24px";
  stats.dom.style.bottom = "24px";
  stats.dom.style.zIndex = "30";
  stats.dom.style.opacity = "0.92";
  stats.dom.style.pointerEvents = "auto";
  document.body.appendChild(stats.dom);
  return stats;
}

function splitGraphemes(text: string): string[] {
  if (graphemeSegmenter === null) return Array.from(text);
  return Array.from(
    graphemeSegmenter.segment(text),
    (segment) => segment.segment,
  );
}

function measureTextWidth(text: string, font: string): number {
  const cacheKey = `${font}\u0000${text}`;
  const cached = glyphWidthCache.get(cacheKey);
  if (cached !== undefined) return cached;
  if (measureContext.font !== font) {
    measureContext.font = font;
  }
  const width = measureContext.measureText(text).width;
  glyphWidthCache.set(cacheKey, width);
  return width;
}

function repeatCorpus(minLength: number): string {
  const repeatCount = Math.max(1, Math.ceil(minLength / textCorpus.length));
  return textCorpus.repeat(repeatCount);
}

function getPreparedCorpus(minLength: number): PreparedTextWithSegments {
  const repeatCount = Math.max(1, Math.ceil(minLength / textCorpus.length));
  const cached = preparedCorpusCache.get(repeatCount);
  if (cached !== undefined) return cached;
  const prepared = prepareWithSegments(repeatCorpus(minLength), TEXT_FONT);
  preparedCorpusCache.set(repeatCount, prepared);
  return prepared;
}

function getTextBucketKey(x: number, y: number): string {
  return `${Math.floor(x / TEXT_BUCKET_SIZE)},${Math.floor(y / TEXT_BUCKET_SIZE)}`;
}

function rebuildTextBuckets(): void {
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

function circlesOverlap(
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

function roundRenderValue(value: number): number {
  return Math.round(value * 100) / 100;
}

function carveSlots(
  left: number,
  right: number,
  lineTop: number,
  lineBottom: number,
  safeRect: SafeRect,
): LayoutSlot[] {
  const slots: LayoutSlot[] = [];
  if (lineBottom <= safeRect.y || lineTop >= safeRect.y + safeRect.h) {
    slots.push({ left, right });
    return slots;
  }

  if (safeRect.x - left >= TEXT_CHAR_GAP * 2) {
    slots.push({ left, right: safeRect.x });
  }
  if (right - (safeRect.x + safeRect.w) >= TEXT_CHAR_GAP * 2) {
    slots.push({ left: safeRect.x + safeRect.w, right });
  }

  return slots;
}

function createTextElement(char: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = "text-block";
  element.textContent = char;
  element.style.transform = "translate(-50%, -50%)";
  return element;
}

function buildTextLayout(): TextBlock[] {
  dom.textLayer.replaceChildren();

  const blocks: TextBlock[] = [];
  const safeRect: SafeRect = {
    x: cw / 2 - SAFE_ZONE_WIDTH / 2,
    y: ch / 2 - SAFE_ZONE_HEIGHT / 2,
    w: SAFE_ZONE_WIDTH,
    h: SAFE_ZONE_HEIGHT,
  };

  const approximateTextLength = Math.ceil((cw * ch) / 8);
  preparedCorpus = getPreparedCorpus(approximateTextLength);

  const fragment = document.createDocumentFragment();
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };

  for (
    let lineTop = TEXT_VERTICAL_PADDING;
    lineTop + TEXT_LINE_HEIGHT <= ch - TEXT_VERTICAL_PADDING;
    lineTop += TEXT_LINE_HEIGHT
  ) {
    const lineBottom = lineTop + TEXT_LINE_HEIGHT;
    const slots = carveSlots(
      TEXT_HORIZONTAL_PADDING,
      cw - TEXT_HORIZONTAL_PADDING,
      lineTop,
      lineBottom,
      safeRect,
    );
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const slot = slots[slotIndex];
      if (slot === undefined) continue;
      const slotWidth = slot.right - slot.left;
      if (slotWidth < TEXT_CHAR_GAP * 2) continue;

      let line: LayoutLine | null = layoutNextLine(
        preparedCorpus,
        cursor,
        slotWidth,
      );
      if (line === null) {
        cursor = { segmentIndex: 0, graphemeIndex: 0 };
        line = layoutNextLine(preparedCorpus, cursor, slotWidth);
      }
      if (line === null) continue;

      const graphemes = splitGraphemes(line.text);
      let currentX = slot.left;
      const centerY = lineTop + TEXT_LINE_HEIGHT / 2;
      for (
        let graphemeIndex = 0;
        graphemeIndex < graphemes.length;
        graphemeIndex++
      ) {
        const grapheme = graphemes[graphemeIndex];
        if (grapheme === undefined) continue;
        const glyphWidth = measureTextWidth(grapheme, TEXT_FONT);
        if (grapheme.trim().length > 0) {
          const x = currentX + glyphWidth / 2;
          const element = createTextElement(grapheme);
          fragment.appendChild(element);
          blocks.push(new TextBlock(x, centerY, grapheme, element));
        }
        currentX += glyphWidth;
      }

      cursor = line.end;
    }
  }

  dom.textLayer.appendChild(fragment);
  return blocks;
}

function buildBulletElement(): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = "bullet";
  dom.bulletLayer.appendChild(element);
  return element;
}

function buildEnemyElement(): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "enemy";

  const shape = document.createElement("div");
  shape.className = "enemy-shape";
  const core = document.createElement("div");
  core.className = "enemy-core";

  element.append(shape, core);
  dom.enemyLayer.appendChild(element);
  return element;
}

function buildParticleElement(): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "particle";
  dom.particleLayer.appendChild(element);
  return element;
}

function buildPowerUpElement(): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "powerup";
  dom.powerUpLayer.appendChild(element);
  return element;
}

function syncPool<T extends HTMLElement>(
  pool: Array<DomPoolItem<T>>,
  count: number,
  createElement: () => T,
): void {
  while (pool.length < count) {
    pool.push({ element: createElement() });
  }

  for (let index = 0; index < pool.length; index++) {
    const item = pool[index];
    if (item === undefined) continue;
    item.element.style.display = index < count ? "" : "none";
  }
}

function clearGameOverTimers(): void {
  if (gameOverRevealTimer !== null) {
    window.clearTimeout(gameOverRevealTimer);
    gameOverRevealTimer = null;
  }
  if (gameOverFadeTimer !== null) {
    window.clearTimeout(gameOverFadeTimer);
    gameOverFadeTimer = null;
  }
}

function hideElement(element: HTMLElement): void {
  element.classList.add("is-hidden", "is-transparent");
}

function showElement(element: HTMLElement): void {
  element.classList.remove("is-hidden", "is-transparent");
}

function fadeInElement(element: HTMLElement): void {
  element.classList.remove("is-transparent");
}

function fadeOutElement(element: HTMLElement): void {
  element.classList.add("is-transparent");
}

function resizeStage(): void {
  cw = window.innerWidth;
  ch = window.innerHeight;
  dom.stage.style.width = `${cw}px`;
  dom.stage.style.height = `${ch}px`;
  textGrid = buildTextLayout();
  rebuildTextBuckets();

  if (gameState !== "start") {
    tank.x = Math.max(tank.radius, Math.min(cw - tank.radius, tank.x));
    tank.y = Math.max(tank.radius, Math.min(ch - tank.radius, tank.y));
  }
}

function createExplosion(
  x: number,
  y: number,
  color: string,
  count = 15,
): void {
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(x, y, color));
  }
}

function firePlayerBullets(): void {
  const bulletSpeed = 12;
  const isBarrageActive = buffs.barrage > frameCount;

  if (isBarrageActive) {
    const bulletCount = 12;
    for (let i = 0; i < bulletCount; i++) {
      const angle = (Math.PI * 2 * i) / bulletCount;
      bullets.push(
        new Bullet(
          tank.x,
          tank.y,
          Math.cos(angle) * bulletSpeed,
          Math.sin(angle) * bulletSpeed,
          true,
        ),
      );
    }
    tank.x -= Math.cos(tank.angle) * 2;
    tank.y -= Math.sin(tank.angle) * 2;
    return;
  }

  bullets.push(
    new Bullet(
      tank.x,
      tank.y,
      Math.cos(tank.angle) * bulletSpeed,
      Math.sin(tank.angle) * bulletSpeed,
      true,
    ),
  );
  tank.x -= Math.cos(tank.angle) * 3;
  tank.y -= Math.sin(tank.angle) * 3;
}

function setScore(nextScore: number): void {
  score = nextScore;
  dom.scoreDisplay.innerText = String(score);
}

function pauseGame(): void {
  if (gameState !== "playing") return;
  gameState = "paused";
  mouse.isDown = false;
  showElement(dom.pauseUI);
}

function resumeGame(): void {
  if (gameState !== "paused") return;
  hideElement(dom.pauseUI);
  gameState = "playing";
}

function togglePause(): void {
  if (gameState === "playing") {
    pauseGame();
  } else if (gameState === "paused") {
    resumeGame();
  }
}

function updateBuffDisplay(): void {
  const activeBuffs: string[] = [];
  if (buffs.freeze > frameCount)
    activeBuffs.push(
      `❄️冻结 ${((buffs.freeze - frameCount) / 60).toFixed(1)}s`,
    );
  if (buffs.rapid > frameCount)
    activeBuffs.push(`🔥连发 ${((buffs.rapid - frameCount) / 60).toFixed(1)}s`);
  if (buffs.invincible > frameCount)
    activeBuffs.push(
      `🛡️无敌 ${((buffs.invincible - frameCount) / 60).toFixed(1)}s`,
    );
  if (buffs.barrage > frameCount)
    activeBuffs.push(
      `🌪️环射 ${((buffs.barrage - frameCount) / 60).toFixed(1)}s`,
    );
  const nextText = activeBuffs.join(" | ");
  if (nextText !== lastBuffDisplayText) {
    dom.buffDisplay.innerText = nextText;
    lastBuffDisplayText = nextText;
  }
}

function startGame(): void {
  clearGameOverTimers();
  resizeStage();

  tank.x = cw / 2;
  tank.y = ch / 2;
  tank.angle = 0;
  mouse.x = cw / 2;
  mouse.y = ch / 2;
  tank.lastShot = 0;

  bullets = [];
  enemies = [];
  particles = [];
  powerUps = [];
  preparedCorpus = null;
  setScore(0);
  frameCount = 0;

  buffs.freeze = 0;
  buffs.rapid = 0;
  buffs.invincible = 0;
  buffs.barrage = 0;

  lastBuffDisplayText = "";
  dom.buffDisplay.innerText = "";
  hideElement(dom.uiContainer);
  hideElement(dom.pauseUI);
  hideElement(dom.gameOverUI);
  fadeInElement(dom.hud);

  gameState = "playing";
}

function gameOver(): void {
  if (gameState === "gameover") return;

  gameState = "gameover";
  createExplosion(tank.x, tank.y, tank.color, 100);

  fadeOutElement(dom.hud);

  gameOverRevealTimer = window.setTimeout(() => {
    showElement(dom.gameOverUI);
    gameOverFadeTimer = window.setTimeout(() => {
      fadeInElement(dom.gameOverUI);
    }, 50);
    dom.finalScoreDisplay.innerText = String(score);
  }, 1000);
}

function update(): void {
  if (gameState !== "playing") {
    if (gameState === "paused") return;
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      if (particle === undefined) continue;
      particle.update();
      if (particle.alpha <= 0) particles.splice(i, 1);
    }
    return;
  }

  frameCount++;

  const dx = mouse.x - tank.x;
  const dy = mouse.y - tank.y;
  if (dx * dx + dy * dy > 25) {
    tank.angle = Math.atan2(dy, dx);
  }

  tank.x += dx * tank.speed;
  tank.y += dy * tank.speed;
  tank.x = Math.max(tank.radius, Math.min(cw - tank.radius, tank.x));
  tank.y = Math.max(tank.radius, Math.min(ch - tank.radius, tank.y));

  const currentFireRate = buffs.rapid > frameCount ? 3 : tank.fireRate;
  if (mouse.isDown && frameCount - tank.lastShot >= currentFireRate) {
    firePlayerBullets();
    tank.lastShot = frameCount;
  }

  if (frameCount % 600 === 0 && Math.random() < 0.8) {
    powerUps.push(new PowerUp());
  }

  for (let i = powerUps.length - 1; i >= 0; i--) {
    const powerUp = powerUps[i];
    if (powerUp === undefined) continue;
    if (frameCount - powerUp.spawnTime > 900) {
      powerUps.splice(i, 1);
      continue;
    }
    if (
      circlesOverlap(
        tank.x,
        tank.y,
        tank.radius,
        powerUp.x,
        powerUp.y,
        powerUp.radius,
      )
    ) {
      buffs[powerUp.def.type] = frameCount + powerUp.def.duration;
      createExplosion(powerUp.x, powerUp.y, powerUp.def.color, 20);
      powerUps.splice(i, 1);
    }
  }

  updateBuffDisplay();

  for (let i = 0; i < textGrid.length; i++) {
    textGrid[i]?.update();
  }
  rebuildTextBuckets();

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    if (bullet === undefined) continue;
    bullet.update();
    if (!bullet.active) bullets.splice(i, 1);
  }

  const spawnRate = Math.max(30, 120 - Math.floor(frameCount / 60));
  if (frameCount % spawnRate === 0 && buffs.freeze <= frameCount) {
    enemies.push(new Enemy());
  }

  const isInvincible = buffs.invincible > frameCount;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (enemy === undefined) continue;
    enemy.update();

    for (let j = bullets.length - 1; j >= 0; j--) {
      const bullet = bullets[j];
      if (bullet === undefined || !bullet.isPlayer || !bullet.active) continue;
      if (
        circlesOverlap(
          enemy.x,
          enemy.y,
          enemy.radius,
          bullet.x,
          bullet.y,
          bullet.radius,
        )
      ) {
        enemy.active = false;
        bullet.active = false;
        createExplosion(enemy.x, enemy.y, enemy.color, 15);
        setScore(score + 10);
        break;
      }
    }

    if (
      circlesOverlap(
        enemy.x,
        enemy.y,
        enemy.radius,
        tank.x,
        tank.y,
        tank.radius,
      )
    ) {
      if (isInvincible) {
        enemy.active = false;
        createExplosion(enemy.x, enemy.y, enemy.color, 15);
        setScore(score + 10);
      } else {
        gameOver();
        break;
      }
    }

    if (!enemy.active) enemies.splice(i, 1);
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    if (bullet === undefined || bullet.isPlayer || !bullet.active) continue;
    if (
      circlesOverlap(
        tank.x,
        tank.y,
        tank.radius - 2,
        bullet.x,
        bullet.y,
        bullet.radius,
      )
    ) {
      if (isInvincible) {
        bullet.active = false;
      } else {
        gameOver();
        break;
      }
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    if (particle === undefined) continue;
    particle.update();
    if (particle.alpha <= 0) particles.splice(i, 1);
  }
}

function renderTextBlocks(): void {
  for (let i = 0; i < textGrid.length; i++) {
    const textBlock = textGrid[i];
    if (textBlock === undefined) continue;
    const { element } = textBlock;
    const isVisible = !(textBlock.dead && textBlock.alpha <= 0);
    if (!isVisible) {
      if (textBlock.isRenderedVisible) {
        element.style.display = "none";
        textBlock.isRenderedVisible = false;
      }
      continue;
    }

    const nextX = roundRenderValue(textBlock.x);
    const nextY = roundRenderValue(textBlock.y);
    const nextAlpha = roundRenderValue(textBlock.alpha);

    if (!textBlock.isRenderedVisible) {
      element.style.display = "";
      textBlock.isRenderedVisible = true;
    }
    if (textBlock.lastRenderX !== nextX) {
      element.style.left = `${nextX}px`;
      textBlock.lastRenderX = nextX;
    }
    if (textBlock.lastRenderY !== nextY) {
      element.style.top = `${nextY}px`;
      textBlock.lastRenderY = nextY;
    }
    if (textBlock.lastRenderColor !== textBlock.color) {
      element.style.color = textBlock.color;
      textBlock.lastRenderColor = textBlock.color;
    }
    if (textBlock.lastRenderAlpha !== nextAlpha) {
      element.style.opacity = `${nextAlpha}`;
      textBlock.lastRenderAlpha = nextAlpha;
    }
  }
}

function renderDynamicEntities(): void {
  syncPool(bulletPool, bullets.length, buildBulletElement);
  for (let i = 0; i < bullets.length; i++) {
    const bullet = bullets[i];
    const poolItem = bulletPool[i];
    if (bullet === undefined || poolItem === undefined) continue;
    const element = poolItem.element;
    element.innerText = bullet.char;
    element.style.left = `${bullet.x}px`;
    element.style.top = `${bullet.y}px`;
    element.style.color = bullet.isPlayer ? "#22d3ee" : "#f87171";
    element.style.textShadow = bullet.isPlayer
      ? "0 0 12px rgba(34, 211, 238, 0.85)"
      : "0 0 12px rgba(248, 113, 113, 0.85)";
    element.style.opacity = bullet.active ? "1" : "0";
  }

  syncPool(enemyPool, enemies.length, buildEnemyElement);
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    const poolItem = enemyPool[i];
    if (enemy === undefined || poolItem === undefined) continue;
    const element = poolItem.element;
    element.style.left = `${enemy.x}px`;
    element.style.top = `${enemy.y}px`;
    element.style.transform = `translate(-50%, -50%) rotate(${enemy.angle}rad)`;
    element.style.opacity = enemy.active ? "1" : "0";
  }

  syncPool(powerUpPool, powerUps.length, buildPowerUpElement);
  for (let i = 0; i < powerUps.length; i++) {
    const powerUp = powerUps[i];
    const poolItem = powerUpPool[i];
    if (powerUp === undefined || poolItem === undefined) continue;
    const alpha = ((Math.sin(frameCount * 0.1) + 1) / 2) * 0.5 + 0.5;
    const element = poolItem.element;
    element.innerText = powerUp.def.char;
    element.style.left = `${powerUp.x}px`;
    element.style.top = `${powerUp.y}px`;
    element.style.opacity = `${alpha}`;
    element.style.background = `radial-gradient(circle, rgba(255,255,255,0.18), ${powerUp.def.color})`;
    element.style.boxShadow = `0 0 20px ${powerUp.def.color}`;
  }

  syncPool(particlePool, particles.length, buildParticleElement);
  for (let i = 0; i < particles.length; i++) {
    const particle = particles[i];
    const poolItem = particlePool[i];
    if (particle === undefined || poolItem === undefined) continue;
    const element = poolItem.element;
    element.style.left = `${particle.x}px`;
    element.style.top = `${particle.y}px`;
    element.style.opacity = `${Math.max(0, particle.alpha)}`;
    element.style.width = `${particle.size * 2}px`;
    element.style.height = `${particle.size * 2}px`;
    element.style.background = particle.color;
    element.style.boxShadow = `0 0 10px ${particle.color}`;
  }

  if (gameState === "playing" || gameState === "paused") {
    dom.tank.style.display = "";
    dom.tank.style.left = `${tank.x}px`;
    dom.tank.style.top = `${tank.y}px`;
    dom.tank.style.transform = `translate(-50%, -50%) rotate(${tank.angle}rad)`;
    dom.tankShield.style.opacity = buffs.invincible > frameCount ? "1" : "0";
  } else {
    dom.tank.style.display = "none";
  }
}

function render(): void {
  renderTextBlocks();
  renderDynamicEntities();
}

function renderLoop(): void {
  fpsMonitor.begin();
  render();
  fpsMonitor.end();
  window.requestAnimationFrame(renderLoop);
}

window.addEventListener("resize", resizeStage);

window.addEventListener("mousemove", (event) => {
  if (gameState === "playing" || gameState === "paused") {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  }
});

window.addEventListener("mousedown", (event) => {
  if (event.button === 0) mouse.isDown = true;
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 0) mouse.isDown = false;
});

window.addEventListener(
  "touchstart",
  (event) => {
    const touch = event.touches[0];
    if (touch === undefined) return;
    mouse.x = touch.clientX;
    mouse.y = touch.clientY;
    mouse.isDown = true;
  },
  { passive: false },
);

window.addEventListener(
  "touchmove",
  (event) => {
    const touch = event.touches[0];
    if (touch === undefined) return;
    mouse.x = touch.clientX;
    mouse.y = touch.clientY;
    event.preventDefault();
  },
  { passive: false },
);

window.addEventListener("touchend", () => {
  mouse.isDown = false;
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || event.repeat) return;
  if (gameState !== "playing" && gameState !== "paused") return;
  event.preventDefault();
  togglePause();
});

dom.startBtn.addEventListener("click", startGame);
dom.restartBtn.addEventListener("click", () => {
  hideElement(dom.gameOverUI);
  startGame();
});

async function bootstrap(): Promise<void> {
  if ("fonts" in document) {
    await document.fonts.ready;
  }

  resizeStage();
  render();
  renderLoop();
  if (updateTimer !== null) window.clearInterval(updateTimer);
  updateTimer = window.setInterval(update, 1000 / 60);
}

void bootstrap();
