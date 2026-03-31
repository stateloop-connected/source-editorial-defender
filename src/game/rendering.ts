import { roundRenderValue } from "./utils";

import type { GameStore } from "./state";
import type { DomPoolItem, StageDomRefs } from "./types";

const AMBIENT_FONT_FAMILY = '"Trebuchet MS", Verdana, sans-serif';
const AMBIENT_FONT_WEIGHT = 600;

function buildBulletElement(dom: StageDomRefs): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = "bullet";
  dom.bulletLayer.appendChild(element);
  return element;
}

function buildEnemyElement(dom: StageDomRefs): HTMLDivElement {
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

function buildParticleElement(dom: StageDomRefs): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "particle";
  dom.particleLayer.appendChild(element);
  return element;
}

function buildPowerUpElement(dom: StageDomRefs): HTMLDivElement {
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

export function createRenderer(dom: StageDomRefs): {
  render: (state: GameStore) => void;
} {
  const ambientCanvas = dom.ambientLayer;
  const ambientContextMaybe = ambientCanvas.getContext("2d");
  if (ambientContextMaybe === null) {
    throw new Error("Expected #ambientLayer to support CanvasRenderingContext2D.");
  }
  const ambientContext = ambientContextMaybe;
  let ambientCanvasCssWidth = 0;
  let ambientCanvasCssHeight = 0;
  let ambientCanvasScale = 1;
  const bulletPool: Array<DomPoolItem<HTMLSpanElement>> = [];
  const enemyPool: Array<DomPoolItem<HTMLDivElement>> = [];
  const particlePool: Array<DomPoolItem<HTMLDivElement>> = [];
  const powerUpPool: Array<DomPoolItem<HTMLDivElement>> = [];

  function syncAmbientCanvasSize(stageWidth: number, stageHeight: number): void {
    const nextCssWidth = Math.max(1, Math.round(stageWidth));
    const nextCssHeight = Math.max(1, Math.round(stageHeight));
    const nextScale = Math.max(1, window.devicePixelRatio || 1);
    const nextRenderWidth = Math.round(nextCssWidth * nextScale);
    const nextRenderHeight = Math.round(nextCssHeight * nextScale);
    const isSizeChanged =
      nextCssWidth !== ambientCanvasCssWidth ||
      nextCssHeight !== ambientCanvasCssHeight ||
      nextRenderWidth !== ambientCanvas.width ||
      nextRenderHeight !== ambientCanvas.height ||
      nextScale !== ambientCanvasScale;

    if (!isSizeChanged) return;

    ambientCanvasCssWidth = nextCssWidth;
    ambientCanvasCssHeight = nextCssHeight;
    ambientCanvasScale = nextScale;
    ambientCanvas.style.width = `${nextCssWidth}px`;
    ambientCanvas.style.height = `${nextCssHeight}px`;
    ambientCanvas.width = nextRenderWidth;
    ambientCanvas.height = nextRenderHeight;
  }

  function renderAmbientGlyphs(state: GameStore): void {
    syncAmbientCanvasSize(state.cw, state.ch);
    ambientContext.setTransform(1, 0, 0, 1, 0, 0);
    ambientContext.clearRect(0, 0, ambientCanvas.width, ambientCanvas.height);
    ambientContext.setTransform(ambientCanvasScale, 0, 0, ambientCanvasScale, 0, 0);
    ambientContext.textAlign = "center";
    ambientContext.textBaseline = "middle";
    ambientContext.fillStyle = "rgb(148, 163, 184)";
    ambientContext.shadowColor = "rgba(148, 163, 184, 0.12)";
    ambientContext.shadowBlur = 12;

    for (let i = 0; i < state.ambientGlyphs.length; i++) {
      const glyph = state.ambientGlyphs[i];
      if (glyph === undefined) continue;
      ambientContext.save();
      ambientContext.translate(roundRenderValue(glyph.x), roundRenderValue(glyph.y));
      ambientContext.rotate((glyph.rotation * Math.PI) / 180);
      ambientContext.globalAlpha = Math.max(0, Math.min(1, glyph.alpha));
      ambientContext.font = `${AMBIENT_FONT_WEIGHT} ${roundRenderValue(glyph.size)}px ${AMBIENT_FONT_FAMILY}`;
      ambientContext.fillText(glyph.char, 0, 0);
      ambientContext.restore();
    }
  }

  function renderTextBlocks(state: GameStore): void {
    for (let i = 0; i < state.textGrid.length; i++) {
      const textBlock = state.textGrid[i];
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

  function renderDynamicEntities(state: GameStore): void {
    renderAmbientGlyphs(state);

    syncPool(bulletPool, state.bullets.length, () => buildBulletElement(dom));
    for (let i = 0; i < state.bullets.length; i++) {
      const bullet = state.bullets[i];
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

    syncPool(enemyPool, state.enemies.length, () => buildEnemyElement(dom));
    for (let i = 0; i < state.enemies.length; i++) {
      const enemy = state.enemies[i];
      const poolItem = enemyPool[i];
      if (enemy === undefined || poolItem === undefined) continue;
      const element = poolItem.element;
      element.style.left = `${enemy.x}px`;
      element.style.top = `${enemy.y}px`;
      element.style.transform = `translate(-50%, -50%) rotate(${enemy.angle}rad)`;
      element.style.opacity = enemy.active ? "1" : "0";
    }

    syncPool(powerUpPool, state.powerUps.length, () =>
      buildPowerUpElement(dom),
    );
    for (let i = 0; i < state.powerUps.length; i++) {
      const powerUp = state.powerUps[i];
      const poolItem = powerUpPool[i];
      if (powerUp === undefined || poolItem === undefined) continue;
      const alpha = ((Math.sin(state.frameCount * 0.1) + 1) / 2) * 0.5 + 0.5;
      const element = poolItem.element;
      element.innerText = powerUp.def.char;
      element.style.left = `${powerUp.x}px`;
      element.style.top = `${powerUp.y}px`;
      element.style.opacity = `${alpha}`;
      element.style.background = `radial-gradient(circle, rgba(255,255,255,0.18), ${powerUp.def.color})`;
      element.style.boxShadow = `0 0 20px ${powerUp.def.color}`;
    }

    syncPool(particlePool, state.particles.length, () =>
      buildParticleElement(dom),
    );
    for (let i = 0; i < state.particles.length; i++) {
      const particle = state.particles[i];
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

    if (state.gameState === "playing" || state.gameState === "paused") {
      dom.tank.style.display = "";
      dom.tank.style.left = `${state.tank.x}px`;
      dom.tank.style.top = `${state.tank.y}px`;
      dom.tank.style.transform = `translate(-50%, -50%) rotate(${state.tank.angle}rad)`;
      dom.tankShield.style.opacity =
        state.buffs.invincible > state.frameCount ? "1" : "0";
    } else {
      dom.tank.style.display = "none";
    }
  }

  return {
    render(state: GameStore): void {
      renderTextBlocks(state);
      renderDynamicEntities(state);
    },
  };
}
