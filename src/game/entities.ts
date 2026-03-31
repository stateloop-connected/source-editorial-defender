import {
  ENEMY_BULLET_CHARS,
  PLAYER_BULLET_CHARS,
  POWER_UP_TYPES,
  TEXT_REPEL_RADIUS,
  TEXT_REPEL_RADIUS_SQ,
  TEXT_RESPAWN_DELAY,
  TEXT_RESPAWN_DURATION,
  TEXT_RESPAWN_STAGGER,
} from "./constants";
import { circlesOverlap, getTextBucketKey, hashNoise } from "./utils";

import type { Buffs, GameState, PowerUpDef, TankState } from "./types";

function pickRandomChar(chars: readonly string[]): string {
  return chars[Math.floor(Math.random() * chars.length)] ?? chars[0] ?? "";
}

export class TextBlock {
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

  destroy(frameCount: number): void {
    this.dead = true;
    this.alpha = 0;
    this.color = "#334155";
    this.respawnFrame =
      frameCount +
      TEXT_RESPAWN_DELAY +
      Math.floor(Math.random() * TEXT_RESPAWN_STAGGER);
  }

  private applyRecoveryForces(): void {
    this.vx += (this.originX - this.x) * 0.03;
    this.vy += (this.originY - this.y) * 0.03;
    this.vx *= 0.85;
    this.vy *= 0.85;

    this.x += this.vx;
    this.y += this.vy;
  }

  update(context: {
    frameCount: number;
    gameState: GameState;
    tank: TankState;
  }): void {
    if (this.dead) {
      this.applyRecoveryForces();

      if (context.frameCount >= this.respawnFrame) {
        const progress = Math.min(
          1,
          (context.frameCount - this.respawnFrame) / TEXT_RESPAWN_DURATION,
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
    const dx = context.tank.x - this.x;
    const dy = context.tank.y - this.y;
    const distSq = dx * dx + dy * dy;

    if (
      distSq > 0.001 &&
      distSq < TEXT_REPEL_RADIUS_SQ &&
      context.gameState === "playing"
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

export class Bullet {
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
    this.char = pickRandomChar(
      isPlayer ? PLAYER_BULLET_CHARS : ENEMY_BULLET_CHARS,
    );
  }

  update(context: {
    stageWidth: number;
    stageHeight: number;
    frameCount: number;
    textBuckets: Map<string, TextBlock[]>;
    onTextHit: (x: number, y: number, isPlayer: boolean) => void;
  }): void {
    this.x += this.vx;
    this.y += this.vy;

    if (
      this.x < 0 ||
      this.x > context.stageWidth ||
      this.y < 0 ||
      this.y > context.stageHeight
    ) {
      this.active = false;
      return;
    }

    const bucketKey = getTextBucketKey(this.x, this.y).split(",");
    const baseBucketX = Number(bucketKey[0]);
    const baseBucketY = Number(bucketKey[1]);
    for (let bucketY = baseBucketY - 1; bucketY <= baseBucketY + 1; bucketY++) {
      for (
        let bucketX = baseBucketX - 1;
        bucketX <= baseBucketX + 1;
        bucketX++
      ) {
        const bucket = context.textBuckets.get(`${bucketX},${bucketY}`);
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
            textBlock.destroy(context.frameCount);
            this.active = false;
            context.onTextHit(this.x, this.y, this.isPlayer);
            return;
          }
        }
      }
    }
  }
}

export class PowerUp {
  x: number;
  y: number;
  radius: number;
  def: PowerUpDef;
  spawnTime: number;

  constructor(stageWidth: number, stageHeight: number, frameCount: number) {
    this.x = Math.random() * Math.max(stageWidth - 100, 100) + 50;
    this.y = Math.random() * Math.max(stageHeight - 100, 100) + 50;
    this.radius = 16;
    const index = Math.floor(Math.random() * POWER_UP_TYPES.length);
    this.def = POWER_UP_TYPES[index] ?? POWER_UP_TYPES[0];
    this.spawnTime = frameCount;
  }
}

export class Enemy {
  x: number;
  y: number;
  radius: number;
  speed: number;
  active: boolean;
  lastShot: number;
  fireRate: number;
  color: string;
  angle: number;

  constructor(stageWidth: number, stageHeight: number, frameCount: number) {
    this.radius = 14;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) {
      this.x = Math.random() * stageWidth;
      this.y = -30;
    } else if (side === 1) {
      this.x = stageWidth + 30;
      this.y = Math.random() * stageHeight;
    } else if (side === 2) {
      this.x = Math.random() * stageWidth;
      this.y = stageHeight + 30;
    } else {
      this.x = -30;
      this.y = Math.random() * stageHeight;
    }

    this.speed = Math.random() * 1.5 + 1;
    this.active = true;
    this.lastShot = frameCount + Math.random() * 100;
    this.fireRate = 120 + Math.random() * 60;
    this.color = "#ef4444";
    this.angle = 0;
  }

  update(context: {
    buffs: Buffs;
    bullets: Bullet[];
    frameCount: number;
    tank: TankState;
  }): void {
    if (context.buffs.freeze > context.frameCount) return;

    const dx = context.tank.x - this.x;
    const dy = context.tank.y - this.y;
    const dist = Math.hypot(dx, dy);

    this.angle = Math.atan2(dy, dx);
    if (dist > 0.001) {
      this.x += (dx / dist) * this.speed;
      this.y += (dy / dist) * this.speed;
    }

    if (context.frameCount - this.lastShot >= this.fireRate) {
      const bulletSpeed = 5;
      context.bullets.push(
        new Bullet(
          this.x,
          this.y,
          Math.cos(this.angle) * bulletSpeed,
          Math.sin(this.angle) * bulletSpeed,
          false,
        ),
      );
      this.lastShot = context.frameCount;
    }
  }
}

export class Particle {
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

export class AmbientGlyph {
  originX: number;
  originY: number;
  x: number;
  y: number;
  alpha: number;
  driftSpeed: number;
  swayX: number;
  swayY: number;
  phase: number;
  rotation: number;
  char: string;
  size: number;

  constructor(x: number, y: number, char: string, seed: number) {
    this.originX = x;
    this.originY = y;
    this.x = x;
    this.y = y;
    this.alpha = 0.2 + hashNoise(seed, 11) * 0.22;
    this.driftSpeed = 0.008 + hashNoise(seed, 17) * 0.018;
    this.swayX = 10 + hashNoise(seed, 23) * 22;
    this.swayY = 14 + hashNoise(seed, 29) * 30;
    this.phase = hashNoise(seed, 31) * Math.PI * 2;
    this.rotation = (hashNoise(seed, 37) - 0.5) * 24;
    this.char = char;
    this.size = 12 + hashNoise(seed, 41) * 8;
  }

  update(frameCount: number): void {
    const primaryWave = frameCount * this.driftSpeed + this.phase;
    const secondaryWave =
      frameCount * this.driftSpeed * 0.63 + this.phase * 0.7;
    this.x =
      this.originX +
      Math.cos(primaryWave) * this.swayX +
      Math.sin(secondaryWave) * this.swayX * 0.35;
    this.y =
      this.originY +
      Math.sin(primaryWave) * this.swayY +
      Math.cos(secondaryWave) * this.swayY * 0.22;
    this.alpha =
      0.18 +
      (Math.sin(primaryWave * 0.8) + 1) * 0.5 * 0.22 +
      Math.max(0, Math.cos(secondaryWave)) * 0.08;
  }
}
