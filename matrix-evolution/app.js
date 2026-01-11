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
  advanceGeneration,
} from './sim-core.js';

const containerEl = document.getElementById('canvas-container');
const statsEl = document.getElementById('stats');
const speedInput = document.getElementById('speedRange');
const foodInput = document.getElementById('foodRange');
const mutationRateInput = document.getElementById('mutationRateRange');
const mutationStrengthInput = document.getElementById('mutationStrengthRange');
const reproduceChanceInput = document.getElementById('reproduceChanceRange');
const reproduceEnergyInput = document.getElementById('reproduceEnergyRange');
const popCapInput = document.getElementById('populationCapRange');

let simSpeed = parseFloat(speedInput.value);
let targetFoodDensity = parseFloat(foodInput.value);

function computeMinAgents(cap) {
  return Math.max(10, Math.floor(cap * 0.25));
}

const evoConfig = {
  mutationRate: parseFloat(mutationRateInput.value),
  mutationStrength: parseFloat(mutationStrengthInput.value),
  reproduceChance: parseFloat(reproduceChanceInput.value),
  reproduceEnergy: parseFloat(reproduceEnergyInput.value),
  maxAgents: parseInt(popCapInput.value, 10),
};
evoConfig.minAgents = computeMinAgents(evoConfig.maxAgents);

const state = createState({ simSpeed, targetFoodDensity, evo: evoConfig });

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
  initAgents(state, state.evo.maxAgents);
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

  for (const agent of state.agents) {
    g.beginFill(agent.color ?? 0xff4d6d, 0.95);
    g.drawRect(agent.x - 0.35, agent.y - 0.35, 0.7, 0.7);
    g.endFill();
  }
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
  avgEnergy = alive > 0 ? (avgEnergy / alive).toFixed(1) : '0.0';
  let genProgress = 0;
  if (state.generationPhase === 'reset') {
    const recovery = state.evo.generationRecovery || 0;
    genProgress = recovery > 0
      ? Math.min(100, (1 - state.generationCooldown / recovery) * 100)
      : 100;
  } else {
    genProgress = state.evo.generationLength > 0
      ? Math.min(100, (state.generationProgress / state.evo.generationLength) * 100)
      : 0;
  }
  const phaseLabel = state.generationPhase === 'reset' ? 'Reset' : 'Run';
  const resetLabel = state.generationPhase === 'reset' ? 'Respawn in' : 'Next reset';
  const resetIn = state.generationPhase === 'reset'
    ? Math.max(0, state.generationCooldown).toFixed(0)
    : Math.max(0, state.evo.generationLength - state.generationProgress).toFixed(0);
  statsEl.innerHTML = `
    <div class="stat-line"><span>Agents</span><span>${alive}</span></div>
    <div class="stat-line"><span>Generation</span><span>${state.generation}</span></div>
    <div class="stat-line"><span>Gen progress</span><span>${genProgress.toFixed(0)}%</span></div>
    <div class="stat-line"><span>Phase</span><span>${phaseLabel}</span></div>
    <div class="stat-line"><span>${resetLabel}</span><span>${resetIn}</span></div>
    <div class="stat-line"><span>Last survivors</span><span>${state.lastSurvivors}</span></div>
    <div class="stat-line"><span>Births</span><span>${state.births}</span></div>
    <div class="stat-line"><span>Deaths</span><span>${state.deaths}</span></div>
    <div class="stat-line"><span>Avg energy</span><span>${avgEnergy}</span></div>
    <div class="stat-line"><span>Avg fitness</span><span>${state.lastAvgFitness.toFixed(2)}</span></div>
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
  advanceGeneration(state, delta * state.simSpeed, { rng: Math.random });
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

mutationRateInput.addEventListener('input', (e) => {
  state.evo.mutationRate = parseFloat(e.target.value);
});

mutationStrengthInput.addEventListener('input', (e) => {
  state.evo.mutationStrength = parseFloat(e.target.value);
});

reproduceChanceInput.addEventListener('input', (e) => {
  state.evo.reproduceChance = parseFloat(e.target.value);
});

reproduceEnergyInput.addEventListener('input', (e) => {
  state.evo.reproduceEnergy = parseFloat(e.target.value);
});

popCapInput.addEventListener('input', (e) => {
  const cap = parseInt(e.target.value, 10);
  state.evo.maxAgents = cap;
  state.evo.minAgents = Math.min(computeMinAgents(cap), cap);
});

init();
