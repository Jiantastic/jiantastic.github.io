/* Living Matrix prototype: JS + Pixi, mobile-friendly */

const GRID_W = 72;
const GRID_H = 48;
const INITIAL_AGENT_COUNT = 60;
const MAX_ENERGY = 120;
const ENERGY_DECAY = 0.3;
const EAT_GAIN = 35;
const EMIT_COST = 4;
const PHEROMONE_DECAY = 3;
const OSC_PERIOD = 20; // ticks

const containerEl = document.getElementById('canvas-container');
const statsEl = document.getElementById('stats');
const speedInput = document.getElementById('speedRange');
const foodInput = document.getElementById('foodRange');

let simSpeed = parseFloat(speedInput.value);
let targetFoodDensity = parseFloat(foodInput.value);

// Typed arrays for CA and pheromones
let grid = new Uint8Array(GRID_W * GRID_H);
let nextGrid = new Uint8Array(GRID_W * GRID_H);
let pheromone = new Uint8Array(GRID_W * GRID_H);

const agents = [];
let tick = 0;
let lastFpsUpdate = performance.now();
let fps = 0;

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

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function seedFood(density) {
  for (let i = 0; i < grid.length; i++) {
    grid[i] = Math.random() < density ? 1 : 0;
  }
}

function createAgent() {
  return {
    x: Math.floor(Math.random() * GRID_W) + 0.5,
    y: Math.floor(Math.random() * GRID_H) + 0.5,
    energy: randomFloat(MAX_ENERGY * 0.6, MAX_ENERGY),
    brain: makeBrain(8),
    age: 0,
    alive: true,
  };
}

function makeBrain(hiddenSize) {
  const weights1 = new Float32Array(12 * hiddenSize);
  const weights2 = new Float32Array(hiddenSize * 4);
  const scale1 = Math.sqrt(1 / 12);
  const scale2 = Math.sqrt(1 / hiddenSize);
  for (let i = 0; i < weights1.length; i++) weights1[i] = randomFloat(-scale1, scale1);
  for (let i = 0; i < weights2.length; i++) weights2[i] = randomFloat(-scale2, scale2);
  return { hiddenSize, w1: weights1, w2: weights2 };
}

function initAgents() {
  agents.length = 0;
  for (let i = 0; i < INITIAL_AGENT_COUNT; i++) agents.push(createAgent());
}

function sense(agent) {
  const ax = Math.floor(agent.x);
  const ay = Math.floor(agent.y);
  const north = ay > 0 ? grid[idx(ax, ay - 1)] : 0;
  const south = ay < GRID_H - 1 ? grid[idx(ax, ay + 1)] : 0;
  const west = ax > 0 ? grid[idx(ax - 1, ay)] : 0;
  const east = ax < GRID_W - 1 ? grid[idx(ax + 1, ay)] : 0;

  // Agent proximity (naive search is fine for small populations)
  let prox = 0;
  let minDist2 = Infinity;
  for (const other of agents) {
    if (other === agent || !other.alive) continue;
    const dx = other.x - agent.x;
    const dy = other.y - agent.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < minDist2) minDist2 = d2;
  }
  if (minDist2 !== Infinity) {
    const maxD2 = 25; // within 5 cells
    prox = clamp(1 - minDist2 / maxD2, 0, 1);
  }

  const p = pheromone[idx(ax, ay)] / 255;
  const px1 = ax < GRID_W - 1 ? pheromone[idx(ax + 1, ay)] : pheromone[idx(ax, ay)];
  const px0 = ax > 0 ? pheromone[idx(ax - 1, ay)] : pheromone[idx(ax, ay)];
  const py1 = ay < GRID_H - 1 ? pheromone[idx(ax, ay + 1)] : pheromone[idx(ax, ay)];
  const py0 = ay > 0 ? pheromone[idx(ax, ay - 1)] : pheromone[idx(ax, ay)];
  const gradX = clamp((px1 - px0) / 255, -1, 1);
  const gradY = clamp((py1 - py0) / 255, -1, 1);

  const wallDist = Math.min(ax / GRID_W, ay / GRID_H, (GRID_W - ax) / GRID_W, (GRID_H - ay) / GRID_H);
  const energyN = clamp(agent.energy / MAX_ENERGY, 0, 1);
  const osc = 0.5 + 0.5 * Math.sin((tick / OSC_PERIOD) * Math.PI * 2);
  const noise = Math.random();

  return [
    north, south, east, west,
    prox,
    p,
    gradX, gradY,
    wallDist,
    energyN,
    osc,
    noise,
  ];
}

function feedForward(agent, inputs) {
  const { hiddenSize, w1, w2 } = agent.brain;
  const hidden = new Float32Array(hiddenSize);
  let idxW = 0;
  for (let h = 0; h < hiddenSize; h++) {
    let sum = 0;
    for (let i = 0; i < inputs.length; i++) {
      sum += inputs[i] * w1[idxW++];
    }
    hidden[h] = Math.tanh(sum);
  }

  const outputs = new Float32Array(4);
  idxW = 0;
  for (let o = 0; o < 4; o++) {
    let sum = 0;
    for (let h = 0; h < hiddenSize; h++) {
      sum += hidden[h] * w2[idxW++];
    }
    outputs[o] = Math.tanh(sum);
  }
  return outputs;
}

function updateAgents(delta) {
  for (const agent of agents) {
    if (!agent.alive) continue;
    agent.age += delta;
    const inputs = sense(agent);
    const outputs = feedForward(agent, inputs);

    const moveSpeed = 0.6 * delta;
    agent.x += outputs[0] * moveSpeed;
    agent.y += outputs[1] * moveSpeed;
    agent.x = clamp(agent.x, 0.25, GRID_W - 0.25);
    agent.y = clamp(agent.y, 0.25, GRID_H - 0.25);

    const cellX = Math.floor(agent.x);
    const cellY = Math.floor(agent.y);

    // Eat
    if (outputs[2] > 0.5 && grid[idx(cellX, cellY)] === 1) {
      grid[idx(cellX, cellY)] = 0;
      agent.energy = Math.min(MAX_ENERGY, agent.energy + EAT_GAIN);
    }

    // Emit pheromone
    if (outputs[3] > 0.5 && agent.energy > EMIT_COST + 1) {
      const pIdx = idx(cellX, cellY);
      pheromone[pIdx] = 255;
      agent.energy -= EMIT_COST;
    }

    agent.energy -= ENERGY_DECAY * delta * simSpeed;
    if (agent.energy <= 0) {
      Object.assign(agent, createAgent());
    }
  }
}

function stepLife() {
  // Conway B3/S23
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
          count += grid[idx(nx, ny)] ? 1 : 0;
        }
      }
      const alive = grid[idx(x, y)] === 1;
      let next = 0;
      if (alive && (count === 2 || count === 3)) next = 1;
      else if (!alive && count === 3) next = 1;
      // sparse regrowth to sustain food density
      if (!next && Math.random() < targetFoodDensity * 0.0025) next = 1;
      nextGrid[idx(x, y)] = next;
    }
  }
  [grid, nextGrid] = [nextGrid, grid];
}

function decayPheromone() {
  for (let i = 0; i < pheromone.length; i++) {
    const v = pheromone[i];
    pheromone[i] = v > PHEROMONE_DECAY ? v - PHEROMONE_DECAY : 0;
  }
}

function render() {
  g.clear();
  const cellSize = computeCellSize();
  g.scale.set(cellSize, cellSize);
  g.position.set(world._offsetX || 0, world._offsetY || 0);

  // Food cells
  g.beginFill(0x22ff88, 0.9);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[idx(x, y)] === 1) g.drawRect(x, y, 1, 1);
    }
  }
  g.endFill();

  // Pheromone
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const p = pheromone[idx(x, y)];
      if (p > 0) {
        g.beginFill(0x3aa8ff, p / 400);
        g.drawRect(x, y, 1, 1);
        g.endFill();
      }
    }
  }

  // Agents
  g.beginFill(0xff4d6d, 0.95);
  for (const agent of agents) {
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
  const alive = agents.length;
  let avgEnergy = 0;
  for (const a of agents) avgEnergy += a.energy;
  avgEnergy = (avgEnergy / alive).toFixed(1);
  statsEl.innerHTML = `
    <div class="stat-line"><span>Agents</span><span>${alive}</span></div>
    <div class="stat-line"><span>Avg energy</span><span>${avgEnergy}</span></div>
    <div class="stat-line"><span>Food density</span><span>${targetFoodDensity.toFixed(2)}</span></div>
    <div class="stat-line"><span>FPS</span><span>${fps.toFixed(0)}</span></div>
  `;
}

function loop(delta) {
  tick += delta * simSpeed;
  stepLife();
  decayPheromone();
  updateAgents(delta * simSpeed);
  render();

  const now = performance.now();
  if (now - lastFpsUpdate > 500) {
    fps = app.ticker.FPS;
    updateStats();
    lastFpsUpdate = now;
  }
}

function init() {
  seedFood(targetFoodDensity);
  initAgents();
  resize();
  app.ticker.maxFPS = 60;
  app.ticker.add(loop);
}

window.addEventListener('resize', resize);

speedInput.addEventListener('input', (e) => {
  simSpeed = parseFloat(e.target.value);
});

foodInput.addEventListener('input', (e) => {
  targetFoodDensity = parseFloat(e.target.value);
});

init();
