export type GameState = "start" | "playing" | "paused" | "gameover";

export type BuffKey = "freeze" | "rapid" | "invincible" | "barrage";

export type Buffs = Record<BuffKey, number>;

export type MouseState = {
  x: number;
  y: number;
  isDown: boolean;
};

export type TankState = {
  x: number;
  y: number;
  radius: number;
  angle: number;
  color: string;
  speed: number;
  lastShot: number;
  fireRate: number;
};

export type PowerUpDef = {
  type: BuffKey;
  char: string;
  color: string;
  duration: number;
};

export type SafeRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LayoutRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LayoutCluster = {
  rects: LayoutRect[];
  score: number;
};

export type StageDomRefs = {
  stage: HTMLDivElement;
  ambientLayer: HTMLDivElement;
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

export type DomPoolItem<T extends HTMLElement> = {
  element: T;
};
