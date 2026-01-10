/* Living Matrix prototype: JS + Pixi, mobile-friendly */
import {
  GRID_W,
  GRID_H,
  INITIAL_AGENT_COUNT,
  createState,
  initAgents,
  seedFood,
  stepLife,
  decayPheromone,
  updateAgents,
} from './sim-core.js';

const containerEl = document.getElementById('canvas-container');
const statsEl = document.getElementById('stats');
const speedInput = document.getElementById('speedRange');
const foodInput = document.getElementById('foodRange');

let simSpeed = parseFloat(speedInput.value);
let targetFoodDensity = parseFloat(foodInput.value);

const state = createState({ simSpeed, targetFoodDensity });

// PIXI setup
const app = new PIXI.Application({
  background: '#000000',
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
containerEl.appendChild(app.view);

const world = new PIXI.Container();
const g = new PIXI.Graphics();
world.addChild(g);
app.stage.addChild(world);

function idx(x, y) {
  return y * GRID_W + x;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function init() {
  seedFood(state, targetFoodDensity);
  initAgents(state, INITIAL_AGENT_COUNT);
  resize();
  app.ticker.maxFPS = 60;
  app.ticker.add(loop);
}

function stepLifeWrapped() {
  stepLife(state);
}

function decayPheromoneWrapped() {
  decayPheromone(state);
}

function updateAgentsWrapped(delta) {
  updateAgents(state, delta, { noiseFn: Math.random, rng: Math.random });
}

function render() {
  g.clear();
  const cellSize = computeCellSize();
  g.scale.set(cellSize, cellSize);
  g.position.set(world._offsetX || 0, world._offsetY || 0);

  g.beginFill(0x22ff88, 0.9);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (state.grid[idx(x, y)] === 1) g.drawRect(x, y, 1, 1);
    }
  }
  g.endFill();

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const p = state.pheromone[idx(x, y)];
      if (p > 0) {
        g.beginFill(0x3aa8ff, p / 400);
        g.drawRect(x, y, 1, 1);
        g.endFill();
      }
    }
  }

  g.beginFill(0xff4d6d, 0.95);
  for (const agent of state.agents) {
    g.drawRect(agent.x - 0.35, agent.y - 0.35, 0.7, 0.7);
  }
  g.endFill();
}

function computeCellSize() {
  const w = containerEl.clientWidth;
  const h = containerEl.clientHeight;
  const size = Math.min(w / GRID_W, h / GRID_H);
  const offsetX = (w - size * GRID_W) / 2;
  const offsetY = (h - size * GRID_H) / 2;
  world._offsetX = offsetX;
  world._offsetY = offsetY;
  return size;
}

function resize() {
  const w = containerEl.clientWidth || 640;
  const h = containerEl.clientHeight || 480;
  app.renderer.resize(w, h);
  computeCellSize();
}

function updateStats() {
  const alive = state.agents.length;
  let avgEnergy = 0;
  for (const a of state.agents) avgEnergy += a.energy;
  avgEnergy = (avgEnergy / alive).toFixed(1);
  statsEl.innerHTML = `
    <div class="stat-line"><span>Agents</span><span>${alive}</span></div>
    <div class="stat-line"><span>Avg energy</span><span>${avgEnergy}</span></div>
    <div class="stat-line"><span>Food density</span><span>${targetFoodDensity.toFixed(2)}</span></div>
    <div class="stat-line"><span>FPS</span><span>${fps.toFixed(0)}</span></div>
  `;
}

let lastFpsUpdate = performance.now();
let fps = 0;

function loop(delta) {
  state.tick += delta * state.simSpeed;
  stepLifeWrapped();
  decayPheromoneWrapped();
  updateAgentsWrapped(delta * state.simSpeed);
  render();

  const now = performance.now();
  if (now - lastFpsUpdate > 500) {
    fps = app.ticker.FPS;
    updateStats();
    lastFpsUpdate = now;
  }
}

window.addEventListener('resize', resize);

speedInput.addEventListener('input', (e) => {
  simSpeed = parseFloat(e.target.value);
  state.simSpeed = simSpeed;
});

foodInput.addEventListener('input', (e) => {
  targetFoodDensity = parseFloat(e.target.value);
  state.targetFoodDensity = targetFoodDensity;
});

init();
