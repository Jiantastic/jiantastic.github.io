import { describe, it, expect } from 'vitest';
import {
  createState,
  initAgents,
  updateAgents,
  EMIT_COST,
  ENERGY_DECAY,
  MAX_ENERGY,
} from '../sim-core.js';

const fixedNoise = () => 0.5;
const fixedRng = () => 0.5;
const zeroRng = () => 0;
const evoNoRepro = { minAgents: 0, reproduceChance: 0 };

function makeDecider(outputsArray) {
  const out = new Float32Array(outputsArray);
  return () => out;
}

describe('agents', () => {
  it('clamps movement inside bounds', () => {
    const state = createState({ width: 5, height: 5, evo: evoNoRepro });
    initAgents(state, 1, fixedRng);
    const agent = state.agents[0];
    agent.x = 0.1;
    agent.y = 0.1;

    updateAgents(state, 1, { decide: makeDecider([-10, -10, 0, 0]), noiseFn: fixedNoise, rng: fixedRng });
    expect(agent.x).toBeGreaterThanOrEqual(0.25);
    expect(agent.y).toBeGreaterThanOrEqual(0.25);
  });

  it('eats food and gains energy up to cap', () => {
    const state = createState({ width: 5, height: 5, evo: evoNoRepro });
    initAgents(state, 1, fixedRng);
    const agent = state.agents[0];
    agent.energy = MAX_ENERGY - 10;
    const cellX = Math.floor(agent.x);
    const cellY = Math.floor(agent.y);
    state.grid[cellY * state.width + cellX] = 1;

    updateAgents(state, 1, { decide: makeDecider([0, 0, 1, 0]), noiseFn: fixedNoise, rng: fixedRng });
    expect(state.grid[cellY * state.width + cellX]).toBe(0);
    expect(agent.energy).toBeCloseTo(MAX_ENERGY - ENERGY_DECAY, 5);
  });

  it('emits pheromone when output exceeds threshold and charges energy', () => {
    const state = createState({ width: 5, height: 5, evo: evoNoRepro });
    initAgents(state, 1, fixedRng);
    const agent = state.agents[0];
    const cellX = Math.floor(agent.x);
    const cellY = Math.floor(agent.y);
    const startEnergy = agent.energy;

    updateAgents(state, 1, { decide: makeDecider([0, 0, 0, 1]), noiseFn: fixedNoise, rng: fixedRng });
    expect(state.pheromone[cellY * state.width + cellX]).toBe(255);
    expect(agent.energy).toBeCloseTo(startEnergy - EMIT_COST - ENERGY_DECAY, 5);
  });

  it('removes agents when energy depletes', () => {
    const state = createState({ width: 5, height: 5, evo: evoNoRepro });
    initAgents(state, 1, fixedRng);
    const agent = state.agents[0];
    agent.energy = 0.05;

    updateAgents(state, 1, { decide: makeDecider([0, 0, 0, 0]), noiseFn: fixedNoise, rng: fixedRng });
    expect(state.agents.length).toBe(0);
    expect(state.deaths).toBe(1);
  });

  it('spawns offspring when energy is high', () => {
    const state = createState({
      width: 5,
      height: 5,
      evo: {
        minAgents: 0,
        reproduceChance: 1,
        reproduceEnergy: 10,
        reproduceCooldown: 0,
        childEnergyShare: 0.5,
        mutationRate: 1,
      },
    });
    initAgents(state, 1, zeroRng);
    state.agents[0].energy = MAX_ENERGY;

    updateAgents(state, 1, { decide: makeDecider([0, 0, 0, 0]), noiseFn: fixedNoise, rng: zeroRng });
    expect(state.agents.length).toBe(2);
    expect(state.births).toBe(1);
  });
});
