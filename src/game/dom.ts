import Stats from "stats.js";

import type { StageDomRefs } from "./types";

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

export function buildStageDom(): StageDomRefs {
  const stage = getRequiredElement("gameStage", HTMLDivElement);
  const ambientLayer = getRequiredElement("ambientLayer", HTMLCanvasElement);
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
    ambientLayer,
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

export function buildFpsMonitor(): Stats {
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

export function hideElement(element: HTMLElement): void {
  element.classList.add("is-hidden", "is-transparent");
}

export function showElement(element: HTMLElement): void {
  element.classList.remove("is-hidden", "is-transparent");
}

export function fadeInElement(element: HTMLElement): void {
  element.classList.remove("is-transparent");
}

export function fadeOutElement(element: HTMLElement): void {
  element.classList.add("is-transparent");
}
