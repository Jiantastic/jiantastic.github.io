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
export const MAX_AGENTS = 140;
export const MIN_AGENTS = 20;
export const REPRODUCE_ENERGY = 90;
export const REPRODUCE_COOLDOWN = 12;
export const REPRODUCE_CHANCE = 0.35;
export const CHILD_ENERGY_SHARE = 0.45;
export const MUTATION_RATE = 0.08;
export const MUTATION_STRENGTH = 0.35;
export const COLOR_MUTATION = 0.08;
export const GENERATION_TICKS = 520;
export const SURVIVOR_FRACTION = 0.35;
export const ELITE_FRACTION = 0.08;
export const SELECTION_POWER = 1.3;

const FITNESS_WEIGHTS = {
  energy: 0.55,
  food: 0.3,
  travel: 0.15,
};

export const DEFAULT_EVO = {
  maxAgents: MAX_AGENTS,
  minAgents: MIN_AGENTS,
  reproduceEnergy: REPRODUCE_ENERGY,
  reproduceCooldown: REPRODUCE_COOLDOWN,
  reproduceChance: REPRODUCE_CHANCE,
  childEnergyShare: CHILD_ENERGY_SHARE,
  mutationRate: MUTATION_RATE,
  mutationStrength: MUTATION_STRENGTH,
  colorMutation: COLOR_MUTATION,
  generationLength: GENERATION_TICKS,
  survivorFraction: SURVIVOR_FRACTION,
  eliteFraction: ELITE_FRACTION,
  selectionPower: SELECTION_POWER,
  fitnessWeights: FITNESS_WEIGHTS,
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function randomFloat(rng, min, max) {
  return rng() * (max - min) + min;
}

function wrap01(value) {
  const out = value % 1;
  return out < 0 ? out + 1 : out;
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = h * 6;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (hh >= 0 && hh < 1) {
    r = c; g = x; b = 0;
  } else if (hh >= 1 && hh < 2) {
    r = x; g = c; b = 0;
  } else if (hh >= 2 && hh < 3) {
    r = 0; g = c; b = x;
  } else if (hh >= 3 && hh < 4) {
    r = 0; g = x; b = c;
  } else if (hh >= 4 && hh < 5) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function idx(state, x, y) {
  return y * state.width + x;
}

export function createState({
  width = GRID_W,
  height = GRID_H,
  simSpeed = 1,
  targetFoodDensity = 0.22,
  evo = {},
} = {}) {
  return {
    width,
    height,
    simSpeed,
    targetFoodDensity,
    evo: { ...DEFAULT_EVO, ...evo },
    grid: new Uint8Array(width * height),
    nextGrid: new Uint8Array(width * height),
    pheromone: new Uint8Array(width * height),
    agents: [],
    tick: 0,
    generation: 1,
    generationProgress: 0,
    lastSurvivors: 0,
    lastAvgFitness: 0,
    lastBestFitness: 0,
    births: 0,
    deaths: 0,
    nextAgentId: 1,
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

export function makeGenes(rng = Math.random) {
  return {
    hue: rng(),
    sat: randomFloat(rng, 0.55, 0.95),
    lum: randomFloat(rng, 0.4, 0.7),
  };
}

export function mutateGenes(genes, rng = Math.random, evo = DEFAULT_EVO) {
  const hue = wrap01(genes.hue + randomFloat(rng, -evo.colorMutation, evo.colorMutation));
  const sat = clamp(
    genes.sat + randomFloat(rng, -evo.colorMutation * 0.5, evo.colorMutation * 0.5),
    0.4,
    0.98,
  );
  const lum = clamp(
    genes.lum + randomFloat(rng, -evo.colorMutation * 0.5, evo.colorMutation * 0.5),
    0.35,
    0.8,
  );
  return { hue, sat, lum };
}

export function genesToColor(genes) {
  const [r, g, b] = hslToRgb(genes.hue, genes.sat, genes.lum);
  return (r << 16) | (g << 8) | b;
}

export function cloneBrain(brain) {
  return {
    hiddenSize: brain.hiddenSize,
    w1: new Float32Array(brain.w1),
    w2: new Float32Array(brain.w2),
  };
}

export function mutateBrain(brain, rng = Math.random, evo = DEFAULT_EVO) {
  const mutated = cloneBrain(brain);
  const { mutationRate, mutationStrength } = evo;
  for (let i = 0; i < mutated.w1.length; i++) {
    if (rng() < mutationRate) {
      mutated.w1[i] = clamp(
        mutated.w1[i] + randomFloat(rng, -mutationStrength, mutationStrength),
        -2,
        2,
      );
    }
  }
  for (let i = 0; i < mutated.w2.length; i++) {
    if (rng() < mutationRate) {
      mutated.w2[i] = clamp(
        mutated.w2[i] + randomFloat(rng, -mutationStrength, mutationStrength),
        -2,
        2,
      );
    }
  }
  return mutated;
}

export function createAgent(state, rng = Math.random, options = {}) {
  const {
    brain = makeBrain(8, rng),
    genes = makeGenes(rng),
    energy = randomFloat(rng, MAX_ENERGY * 0.6, MAX_ENERGY),
    x = Math.floor(rng() * state.width) + 0.5,
    y = Math.floor(rng() * state.height) + 0.5,
  } = options;

  return {
    id: state.nextAgentId++,
    x,
    y,
    energy,
    brain,
    genes,
    color: genesToColor(genes),
    age: 0,
    alive: true,
    reproCooldown: 0,
    distance: 0,
    foodEaten: 0,
    generationBorn: state.generation,
  };
}

export function initAgents(state, count = INITIAL_AGENT_COUNT, rng = Math.random) {
  state.nextAgentId = 1;
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
  const evo = state.evo || DEFAULT_EVO;
  const newborns = [];
  const survivors = [];
  let births = 0;
  let deaths = 0;

  for (const agent of state.agents) {
    if (!agent.alive) continue;
    agent.age += delta;
    if (agent.reproCooldown > 0) {
      agent.reproCooldown = Math.max(0, agent.reproCooldown - delta);
    }
    const prevX = agent.x;
    const prevY = agent.y;
    const inputs = sense(state, agent, { noiseFn });
    const outputs = decide ? decide(agent, inputs) : feedForward(agent, inputs);

    const moveSpeed = 0.6 * delta;
    agent.x += outputs[0] * moveSpeed;
    agent.y += outputs[1] * moveSpeed;
    agent.x = clamp(agent.x, 0.25, state.width - 0.25);
    agent.y = clamp(agent.y, 0.25, state.height - 0.25);
    agent.distance += Math.hypot(agent.x - prevX, agent.y - prevY);

    const cellX = Math.floor(agent.x);
    const cellY = Math.floor(agent.y);

    if (outputs[2] > 0.5 && state.grid[idx(state, cellX, cellY)] === 1) {
      state.grid[idx(state, cellX, cellY)] = 0;
      agent.energy = Math.min(MAX_ENERGY, agent.energy + EAT_GAIN);
      agent.foodEaten += 1;
    }

    if (outputs[3] > 0.5 && agent.energy > EMIT_COST + 1) {
      const pIdx = idx(state, cellX, cellY);
      state.pheromone[pIdx] = 255;
      agent.energy -= EMIT_COST;
    }

    const popCount = survivors.length + newborns.length + 1;
    if (
      agent.energy >= evo.reproduceEnergy &&
      agent.reproCooldown <= 0 &&
      popCount < evo.maxAgents
    ) {
      const crowding = popCount / evo.maxAgents;
      const chance = evo.reproduceChance * (1 - crowding);
      if (rng() < chance) {
        const childEnergy = agent.energy * evo.childEnergyShare;
        if (childEnergy > 1) {
          agent.energy -= childEnergy;
          agent.reproCooldown = evo.reproduceCooldown;
          const offsetX = randomFloat(rng, -0.6, 0.6);
          const offsetY = randomFloat(rng, -0.6, 0.6);
          const child = createAgent(state, rng, {
            brain: mutateBrain(agent.brain, rng, evo),
            genes: mutateGenes(agent.genes, rng, evo),
            energy: childEnergy,
            x: clamp(agent.x + offsetX, 0.25, state.width - 0.25),
            y: clamp(agent.y + offsetY, 0.25, state.height - 0.25),
          });
          child.reproCooldown = evo.reproduceCooldown;
          newborns.push(child);
          births += 1;
        }
      }
    }

    agent.energy -= ENERGY_DECAY * delta * state.simSpeed;
    if (agent.energy <= 0) {
      agent.alive = false;
      deaths += 1;
      continue;
    }
    survivors.push(agent);
  }

  state.agents = survivors.concat(newborns);
  if (state.agents.length < evo.minAgents) {
    const needed = evo.minAgents - state.agents.length;
    for (let i = 0; i < needed; i++) state.agents.push(createAgent(state, rng));
  }
  state.births += births;
  state.deaths += deaths;
}

function computeFitnessScores(agents, evo) {
  const weights = evo.fitnessWeights || FITNESS_WEIGHTS;
  let minEnergy = Infinity;
  let maxEnergy = 0;
  let maxFood = 0;
  let maxDistance = 0;
  for (const agent of agents) {
    minEnergy = Math.min(minEnergy, agent.energy);
    maxEnergy = Math.max(maxEnergy, agent.energy);
    maxFood = Math.max(maxFood, agent.foodEaten);
    maxDistance = Math.max(maxDistance, agent.distance);
  }
  const energyRange = maxEnergy - minEnergy;

  return agents.map((agent) => {
    const energyN = energyRange > 0 ? (agent.energy - minEnergy) / energyRange : 1;
    const foodN = maxFood > 0 ? agent.foodEaten / maxFood : 0;
    const travelN = maxDistance > 0 ? agent.distance / maxDistance : 0;
    const fitness = clamp(
      weights.energy * energyN + weights.food * foodN + weights.travel * travelN,
      0,
      1,
    );
    return { agent, fitness };
  });
}

function buildRouletteWheel(scored, selectionPower) {
  const weights = scored.map(({ fitness }) => Math.max(0.001, fitness) ** selectionPower);
  let total = 0;
  const cumulative = weights.map((w) => {
    total += w;
    return total;
  });
  return { cumulative, total };
}

function pickByFitness(scored, wheel, rng = Math.random) {
  const r = rng() * wheel.total;
  const idx = wheel.cumulative.findIndex((v) => v >= r);
  return scored[Math.max(0, idx)];
}

export function runSelection(state, rng = Math.random) {
  const evo = state.evo || DEFAULT_EVO;
  const alive = state.agents.filter((agent) => agent.alive);
  const targetPop = Math.max(evo.minAgents, evo.maxAgents);

  if (alive.length === 0) {
    state.deaths += state.agents.length;
    state.agents = [];
    for (let i = 0; i < targetPop; i++) state.agents.push(createAgent(state, rng));
    state.births += targetPop;
    state.lastSurvivors = 0;
    state.lastAvgFitness = 0;
    state.lastBestFitness = 0;
    return;
  }

  const scored = computeFitnessScores(alive, evo);
  scored.sort((a, b) => b.fitness - a.fitness);

  const survivorCount = Math.max(
    1,
    Math.floor(alive.length * clamp(evo.survivorFraction, 0.05, 1)),
  );
  const parents = scored.slice(0, survivorCount);
  const eliteCount = Math.min(
    parents.length,
    Math.floor(targetPop * clamp(evo.eliteFraction, 0, 0.5)),
  );

  const avgFitness = parents.reduce((sum, p) => sum + p.fitness, 0) / parents.length;
  state.lastSurvivors = parents.length;
  state.lastAvgFitness = avgFitness;
  state.lastBestFitness = parents[0]?.fitness ?? 0;

  const wheel = buildRouletteWheel(parents, evo.selectionPower || SELECTION_POWER);
  const nextGen = [];
  const makeChild = (parent) => createAgent(state, rng, {
    brain: mutateBrain(parent.brain, rng, evo),
    genes: mutateGenes(parent.genes, rng, evo),
    energy: randomFloat(rng, MAX_ENERGY * 0.5, MAX_ENERGY * 0.85),
    x: Math.floor(rng() * state.width) + 0.5,
    y: Math.floor(rng() * state.height) + 0.5,
  });

  for (let i = 0; i < eliteCount; i++) {
    nextGen.push(makeChild(parents[i].agent));
  }

  while (nextGen.length < targetPop) {
    const picked = pickByFitness(parents, wheel, rng).agent;
    nextGen.push(makeChild(picked));
  }

  state.deaths += state.agents.length;
  state.births += nextGen.length;
  state.agents = nextGen;
}

export function advanceGeneration(state, delta, { rng = Math.random } = {}) {
  const evo = state.evo || DEFAULT_EVO;
  if (!evo.generationLength || evo.generationLength <= 0) return false;
  state.generationProgress += delta;
  let advanced = false;
  while (state.generationProgress >= evo.generationLength) {
    state.generationProgress -= evo.generationLength;
    state.generation += 1;
    runSelection(state, rng);
    advanced = true;
  }
  return advanced;
}
