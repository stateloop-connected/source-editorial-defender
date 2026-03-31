import {
  buildFpsMonitor,
  buildStageDom,
  fadeInElement,
  fadeOutElement,
  hideElement,
  showElement,
} from "./dom";
import { Bullet, Enemy, Particle, PowerUp } from "./entities";
import { buildStageLayout, rebuildTextBuckets } from "./layout";
import { createRenderer } from "./rendering";
import { state } from "./state";
import { circlesOverlap } from "./utils";

const dom = buildStageDom();
const fpsMonitor = buildFpsMonitor();
const renderer = createRenderer(dom);
const textBuckets = new Map<string, import("./entities").TextBlock[]>();

function clearGameOverTimers(): void {
  if (state.gameOverRevealTimer !== null) {
    window.clearTimeout(state.gameOverRevealTimer);
    state.gameOverRevealTimer = null;
  }
  if (state.gameOverFadeTimer !== null) {
    window.clearTimeout(state.gameOverFadeTimer);
    state.gameOverFadeTimer = null;
  }
}

function resizeStage(): void {
  state.cw = window.innerWidth;
  state.ch = window.innerHeight;
  dom.stage.style.width = `${state.cw}px`;
  dom.stage.style.height = `${state.ch}px`;

  const layout = buildStageLayout(state.cw, state.ch, dom.textLayer);
  state.textGrid = layout.textBlocks;
  state.ambientGlyphs = layout.ambientGlyphs;
  rebuildTextBuckets(state.textGrid, textBuckets);

  if (state.gameState !== "start") {
    state.tank.x = Math.max(
      state.tank.radius,
      Math.min(state.cw - state.tank.radius, state.tank.x),
    );
    state.tank.y = Math.max(
      state.tank.radius,
      Math.min(state.ch - state.tank.radius, state.tank.y),
    );
  }
}

function createExplosion(
  x: number,
  y: number,
  color: string,
  count = 15,
): void {
  for (let i = 0; i < count; i++) {
    state.particles.push(new Particle(x, y, color));
  }
}

function firePlayerBullets(): void {
  const bulletSpeed = 12;
  const isBarrageActive = state.buffs.barrage > state.frameCount;

  if (isBarrageActive) {
    const bulletCount = 12;
    for (let i = 0; i < bulletCount; i++) {
      const angle = (Math.PI * 2 * i) / bulletCount;
      state.bullets.push(
        new Bullet(
          state.tank.x,
          state.tank.y,
          Math.cos(angle) * bulletSpeed,
          Math.sin(angle) * bulletSpeed,
          true,
        ),
      );
    }
    state.tank.x -= Math.cos(state.tank.angle) * 2;
    state.tank.y -= Math.sin(state.tank.angle) * 2;
    return;
  }

  state.bullets.push(
    new Bullet(
      state.tank.x,
      state.tank.y,
      Math.cos(state.tank.angle) * bulletSpeed,
      Math.sin(state.tank.angle) * bulletSpeed,
      true,
    ),
  );
  state.tank.x -= Math.cos(state.tank.angle) * 3;
  state.tank.y -= Math.sin(state.tank.angle) * 3;
}

function setScore(nextScore: number): void {
  state.score = nextScore;
  dom.scoreDisplay.innerText = String(state.score);
}

function pauseGame(): void {
  if (state.gameState !== "playing") return;
  state.gameState = "paused";
  state.mouse.isDown = false;
  showElement(dom.pauseUI);
}

function resumeGame(): void {
  if (state.gameState !== "paused") return;
  hideElement(dom.pauseUI);
  state.gameState = "playing";
}

function togglePause(): void {
  if (state.gameState === "playing") {
    pauseGame();
  } else if (state.gameState === "paused") {
    resumeGame();
  }
}

function updateBuffDisplay(): void {
  const activeBuffs: string[] = [];
  if (state.buffs.freeze > state.frameCount) {
    activeBuffs.push(
      `❄️冻结 ${((state.buffs.freeze - state.frameCount) / 60).toFixed(1)}s`,
    );
  }
  if (state.buffs.rapid > state.frameCount) {
    activeBuffs.push(
      `🔥连发 ${((state.buffs.rapid - state.frameCount) / 60).toFixed(1)}s`,
    );
  }
  if (state.buffs.invincible > state.frameCount) {
    activeBuffs.push(
      `🛡️无敌 ${((state.buffs.invincible - state.frameCount) / 60).toFixed(1)}s`,
    );
  }
  if (state.buffs.barrage > state.frameCount) {
    activeBuffs.push(
      `🌪️环射 ${((state.buffs.barrage - state.frameCount) / 60).toFixed(1)}s`,
    );
  }
  const nextText = activeBuffs.join(" | ");
  if (nextText !== state.lastBuffDisplayText) {
    dom.buffDisplay.innerText = nextText;
    state.lastBuffDisplayText = nextText;
  }
}

function startGame(): void {
  clearGameOverTimers();
  resizeStage();

  state.tank.x = state.cw / 2;
  state.tank.y = state.ch / 2;
  state.tank.angle = 0;
  state.mouse.x = state.cw / 2;
  state.mouse.y = state.ch / 2;
  state.tank.lastShot = 0;

  state.bullets = [];
  state.enemies = [];
  state.particles = [];
  state.powerUps = [];
  setScore(0);
  state.frameCount = 0;

  state.buffs.freeze = 0;
  state.buffs.rapid = 0;
  state.buffs.invincible = 0;
  state.buffs.barrage = 0;

  state.lastBuffDisplayText = "";
  dom.buffDisplay.innerText = "";
  hideElement(dom.uiContainer);
  hideElement(dom.pauseUI);
  hideElement(dom.gameOverUI);
  fadeInElement(dom.hud);

  state.gameState = "playing";
}

function gameOver(): void {
  if (state.gameState === "gameover") return;

  state.gameState = "gameover";
  createExplosion(state.tank.x, state.tank.y, state.tank.color, 100);

  fadeOutElement(dom.hud);

  state.gameOverRevealTimer = window.setTimeout(() => {
    showElement(dom.gameOverUI);
    state.gameOverFadeTimer = window.setTimeout(() => {
      fadeInElement(dom.gameOverUI);
    }, 50);
    dom.finalScoreDisplay.innerText = String(state.score);
  }, 1000);
}

function updateParticles(): void {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const particle = state.particles[i];
    if (particle === undefined) continue;
    particle.update();
    if (particle.alpha <= 0) state.particles.splice(i, 1);
  }
}

function update(): void {
  if (state.gameState !== "playing") {
    if (state.gameState === "paused") return;
    updateParticles();
    return;
  }

  state.frameCount++;

  const dx = state.mouse.x - state.tank.x;
  const dy = state.mouse.y - state.tank.y;
  if (dx * dx + dy * dy > 25) {
    state.tank.angle = Math.atan2(dy, dx);
  }

  state.tank.x += dx * state.tank.speed;
  state.tank.y += dy * state.tank.speed;
  state.tank.x = Math.max(
    state.tank.radius,
    Math.min(state.cw - state.tank.radius, state.tank.x),
  );
  state.tank.y = Math.max(
    state.tank.radius,
    Math.min(state.ch - state.tank.radius, state.tank.y),
  );

  const currentFireRate =
    state.buffs.rapid > state.frameCount ? 3 : state.tank.fireRate;
  if (
    state.mouse.isDown &&
    state.frameCount - state.tank.lastShot >= currentFireRate
  ) {
    firePlayerBullets();
    state.tank.lastShot = state.frameCount;
  }

  if (state.frameCount % 600 === 0 && Math.random() < 0.8) {
    state.powerUps.push(new PowerUp(state.cw, state.ch, state.frameCount));
  }

  for (let i = state.powerUps.length - 1; i >= 0; i--) {
    const powerUp = state.powerUps[i];
    if (powerUp === undefined) continue;
    if (state.frameCount - powerUp.spawnTime > 900) {
      state.powerUps.splice(i, 1);
      continue;
    }
    if (
      circlesOverlap(
        state.tank.x,
        state.tank.y,
        state.tank.radius,
        powerUp.x,
        powerUp.y,
        powerUp.radius,
      )
    ) {
      state.buffs[powerUp.def.type] = state.frameCount + powerUp.def.duration;
      createExplosion(powerUp.x, powerUp.y, powerUp.def.color, 20);
      state.powerUps.splice(i, 1);
    }
  }

  updateBuffDisplay();

  for (let i = 0; i < state.ambientGlyphs.length; i++) {
    state.ambientGlyphs[i]?.update(state.frameCount);
  }

  for (let i = 0; i < state.textGrid.length; i++) {
    state.textGrid[i]?.update({
      frameCount: state.frameCount,
      gameState: state.gameState,
      tank: state.tank,
    });
  }
  rebuildTextBuckets(state.textGrid, textBuckets);

  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const bullet = state.bullets[i];
    if (bullet === undefined) continue;
    bullet.update({
      stageWidth: state.cw,
      stageHeight: state.ch,
      frameCount: state.frameCount,
      textBuckets,
      onTextHit: (x, y, isPlayer) => {
        createExplosion(x, y, isPlayer ? "#06b6d4" : "#ef4444", 5);
      },
    });
    if (!bullet.active) state.bullets.splice(i, 1);
  }

  const spawnRate = Math.max(30, 120 - Math.floor(state.frameCount / 60));
  if (
    state.frameCount % spawnRate === 0 &&
    state.buffs.freeze <= state.frameCount
  ) {
    state.enemies.push(new Enemy(state.cw, state.ch, state.frameCount));
  }

  const isInvincible = state.buffs.invincible > state.frameCount;
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];
    if (enemy === undefined) continue;
    enemy.update({
      buffs: state.buffs,
      bullets: state.bullets,
      frameCount: state.frameCount,
      tank: state.tank,
    });

    for (let j = state.bullets.length - 1; j >= 0; j--) {
      const bullet = state.bullets[j];
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
        setScore(state.score + 10);
        break;
      }
    }

    if (
      circlesOverlap(
        enemy.x,
        enemy.y,
        enemy.radius,
        state.tank.x,
        state.tank.y,
        state.tank.radius,
      )
    ) {
      if (isInvincible) {
        enemy.active = false;
        createExplosion(enemy.x, enemy.y, enemy.color, 15);
        setScore(state.score + 10);
      } else {
        gameOver();
        break;
      }
    }

    if (!enemy.active) state.enemies.splice(i, 1);
  }

  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const bullet = state.bullets[i];
    if (bullet === undefined || bullet.isPlayer || !bullet.active) continue;
    if (
      circlesOverlap(
        state.tank.x,
        state.tank.y,
        state.tank.radius - 2,
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

  updateParticles();
}

function renderLoop(): void {
  fpsMonitor.begin();
  renderer.render(state);
  fpsMonitor.end();
  window.requestAnimationFrame(renderLoop);
}

function bindEvents(): void {
  window.addEventListener("resize", resizeStage);

  window.addEventListener("mousemove", (event) => {
    if (state.gameState === "playing" || state.gameState === "paused") {
      state.mouse.x = event.clientX;
      state.mouse.y = event.clientY;
    }
  });

  window.addEventListener("mousedown", (event) => {
    if (event.button === 0) state.mouse.isDown = true;
  });

  window.addEventListener("mouseup", (event) => {
    if (event.button === 0) state.mouse.isDown = false;
  });

  window.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches[0];
      if (touch === undefined) return;
      state.mouse.x = touch.clientX;
      state.mouse.y = touch.clientY;
      state.mouse.isDown = true;
    },
    { passive: false },
  );

  window.addEventListener(
    "touchmove",
    (event) => {
      const touch = event.touches[0];
      if (touch === undefined) return;
      state.mouse.x = touch.clientX;
      state.mouse.y = touch.clientY;
      event.preventDefault();
    },
    { passive: false },
  );

  window.addEventListener("touchend", () => {
    state.mouse.isDown = false;
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.repeat) return;
    if (state.gameState !== "playing" && state.gameState !== "paused") return;
    event.preventDefault();
    togglePause();
  });

  dom.startBtn.addEventListener("click", startGame);
  dom.restartBtn.addEventListener("click", () => {
    hideElement(dom.gameOverUI);
    startGame();
  });
}

let isBootstrapped = false;

export async function bootstrapGame(): Promise<void> {
  if (!isBootstrapped) {
    bindEvents();
    isBootstrapped = true;
  }

  if ("fonts" in document) {
    await document.fonts.ready;
  }

  resizeStage();
  renderer.render(state);
  renderLoop();
  if (state.updateTimer !== null) window.clearInterval(state.updateTimer);
  state.updateTimer = window.setInterval(update, 1000 / 60);
}
