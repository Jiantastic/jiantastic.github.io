// Core simulation logic for Living Matrix (testable, DOM-free)

export const GRID_W = 72;
export const GRID_H = 48;
export const INITIAL_AGENT_COUNT = 60;
export const MAX_ENERGY = 120;
export const ENERGY_DECAY = 0.3;
export const EAT_GAIN = 35;
export const EMIT_COST = 4;
export const PHEROMONE_DECAY = 3;
export const OSC_PERIOD = 20; // ticks

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function randomFloat(rng, min, max) {
  return rng() * (max - min) + min;
}

function idx(state, x, y) {
  return y * state.width + x;
}

export function createState({
  width = GRID_W,
  height = GRID_H,
  simSpeed = 1,
  targetFoodDensity = 0.22,
} = {}) {
  return {
    width,
    height,
    simSpeed,
    targetFoodDensity,
    grid: new Uint8Array(width * height),
    nextGrid: new Uint8Array(width * height),
    pheromone: new Uint8Array(width * height),
    agents: [],
    tick: 0,
  };
}

export function makeBrain(hiddenSize, rng = Math.random) {
  const weights1 = new Float32Array(12 * hiddenSize);
  const weights2 = new Float32Array(hiddenSize * 4);
  const scale1 = Math.sqrt(1 / 12);
  const scale2 = Math.sqrt(1 / hiddenSize);
  for (let i = 0; i < weights1.length; i++) weights1[i] = randomFloat(rng, -scale1, scale1);
  for (let i = 0; i < weights2.length; i++) weights2[i] = randomFloat(rng, -scale2, scale2);
  return { hiddenSize, w1: weights1, w2: weights2 };
}

export function createAgent(state, rng = Math.random) {
  return {
    x: Math.floor(rng() * state.width) + 0.5,
    y: Math.floor(rng() * state.height) + 0.5,
    energy: randomFloat(rng, MAX_ENERGY * 0.6, MAX_ENERGY),
    brain: makeBrain(8, rng),
    age: 0,
    alive: true,
  };
}

export function initAgents(state, count = INITIAL_AGENT_COUNT, rng = Math.random) {
  state.agents.length = 0;
  for (let i = 0; i < count; i++) state.agents.push(createAgent(state, rng));
}

export function seedFood(state, density, rng = Math.random) {
  for (let i = 0; i < state.grid.length; i++) {
    state.grid[i] = rng() < density ? 1 : 0;
  }
}

export function stepLife(state, { randomFn = Math.random } = {}) {
  const { width, height, grid, nextGrid, targetFoodDensity } = state;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          count += grid[idx(state, nx, ny)] ? 1 : 0;
        }
      }
      const alive = grid[idx(state, x, y)] === 1;
      let next = 0;
      if (alive && (count === 2 || count === 3)) next = 1;
      else if (!alive && count === 3) next = 1;
      if (!next && randomFn() < targetFoodDensity * 0.0025) next = 1;
      nextGrid[idx(state, x, y)] = next;
    }
  }
  state.grid = nextGrid;
  state.nextGrid = grid;
}

export function decayPheromone(state) {
  const { pheromone } = state;
  for (let i = 0; i < pheromone.length; i++) {
    const v = pheromone[i];
    pheromone[i] = v > PHEROMONE_DECAY ? v - PHEROMONE_DECAY : 0;
  }
}

export function sense(state, agent, { noiseFn = Math.random } = {}) {
  const ax = Math.floor(agent.x);
  const ay = Math.floor(agent.y);
  const { width, height, grid, pheromone, agents, tick } = state;

  const north = ay > 0 ? grid[idx(state, ax, ay - 1)] : 0;
  const south = ay < height - 1 ? grid[idx(state, ax, ay + 1)] : 0;
  const west = ax > 0 ? grid[idx(state, ax - 1, ay)] : 0;
  const east = ax < width - 1 ? grid[idx(state, ax + 1, ay)] : 0;

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
    const maxD2 = 25;
    prox = clamp(1 - minDist2 / maxD2, 0, 1);
  }

  const p = pheromone[idx(state, ax, ay)] / 255;
  const px1 = ax < width - 1 ? pheromone[idx(state, ax + 1, ay)] : pheromone[idx(state, ax, ay)];
  const px0 = ax > 0 ? pheromone[idx(state, ax - 1, ay)] : pheromone[idx(state, ax, ay)];
  const py1 = ay < height - 1 ? pheromone[idx(state, ax, ay + 1)] : pheromone[idx(state, ax, ay)];
  const py0 = ay > 0 ? pheromone[idx(state, ax, ay - 1)] : pheromone[idx(state, ax, ay)];
  const gradX = clamp((px1 - px0) / 255, -1, 1);
  const gradY = clamp((py1 - py0) / 255, -1, 1);

  const wallDist = Math.min(ax / width, ay / height, (width - ax) / width, (height - ay) / height);
  const energyN = clamp(agent.energy / MAX_ENERGY, 0, 1);
  const osc = 0.5 + 0.5 * Math.sin((tick / OSC_PERIOD) * Math.PI * 2);
  const noise = noiseFn();

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

export function feedForward(agent, inputs) {
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

export function updateAgents(state, delta, {
  noiseFn = Math.random,
  rng = Math.random,
  decide,
} = {}) {
  for (const agent of state.agents) {
    if (!agent.alive) continue;
    agent.age += delta;
    const inputs = sense(state, agent, { noiseFn });
    const outputs = decide ? decide(agent, inputs) : feedForward(agent, inputs);

    const moveSpeed = 0.6 * delta;
    agent.x += outputs[0] * moveSpeed;
    agent.y += outputs[1] * moveSpeed;
    agent.x = clamp(agent.x, 0.25, state.width - 0.25);
    agent.y = clamp(agent.y, 0.25, state.height - 0.25);

    const cellX = Math.floor(agent.x);
    const cellY = Math.floor(agent.y);

    if (outputs[2] > 0.5 && state.grid[idx(state, cellX, cellY)] === 1) {
      state.grid[idx(state, cellX, cellY)] = 0;
      agent.energy = Math.min(MAX_ENERGY, agent.energy + EAT_GAIN);
    }

    if (outputs[3] > 0.5 && agent.energy > EMIT_COST + 1) {
      const pIdx = idx(state, cellX, cellY);
      state.pheromone[pIdx] = 255;
      agent.energy -= EMIT_COST;
    }

    agent.energy -= ENERGY_DECAY * delta * state.simSpeed;
    if (agent.energy <= 0) {
      Object.assign(agent, createAgent(state, rng));
    }
  }
}
