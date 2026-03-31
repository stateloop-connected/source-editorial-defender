import type {
  AmbientGlyph,
  Bullet,
  Enemy,
  Particle,
  PowerUp,
  TextBlock,
} from "./entities";
import type { Buffs, GameState, MouseState, TankState } from "./types";

export type GameStore = {
  cw: number;
  ch: number;
  gameState: GameState;
  score: number;
  frameCount: number;
  buffs: Buffs;
  mouse: MouseState;
  tank: TankState;
  textGrid: TextBlock[];
  ambientGlyphs: AmbientGlyph[];
  bullets: Bullet[];
  enemies: Enemy[];
  particles: Particle[];
  powerUps: PowerUp[];
  updateTimer: number | null;
  gameOverRevealTimer: number | null;
  gameOverFadeTimer: number | null;
  lastBuffDisplayText: string;
};

export const state: GameStore = {
  cw: 0,
  ch: 0,
  gameState: "start",
  score: 0,
  frameCount: 0,
  buffs: { freeze: 0, rapid: 0, invincible: 0, barrage: 0 },
  mouse: { x: -1000, y: -1000, isDown: false },
  tank: {
    x: 0,
    y: 0,
    radius: 16,
    angle: 0,
    color: "#06b6d4",
    speed: 0.15,
    lastShot: 0,
    fireRate: 15,
  },
  textGrid: [],
  ambientGlyphs: [],
  bullets: [],
  enemies: [],
  particles: [],
  powerUps: [],
  updateTimer: null,
  gameOverRevealTimer: null,
  gameOverFadeTimer: null,
  lastBuffDisplayText: "",
};
