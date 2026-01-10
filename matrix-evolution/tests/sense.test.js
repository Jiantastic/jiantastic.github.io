import { describe, it, expect } from 'vitest';
import { createState, sense, MAX_ENERGY, OSC_PERIOD } from '../sim-core.js';

function idx(state, x, y) {
  return y * state.width + x;
}

describe('sensors', () => {
  it('reports normalized food, proximity, gradients, wall distance, energy, osc, noise', () => {
    const state = createState({ width: 5, height: 5 });
    const agent = { x: 2.5, y: 2.5, energy: MAX_ENERGY / 2, alive: true };
    const other = { x: 3.5, y: 2.5, energy: MAX_ENERGY / 2, alive: true };
    state.agents.push(agent, other);

    state.grid[idx(state, 2, 1)] = 1; // north
    state.grid[idx(state, 3, 2)] = 1; // east

    state.pheromone[idx(state, 2, 2)] = 100;
    state.pheromone[idx(state, 3, 2)] = 200;
    state.pheromone[idx(state, 1, 2)] = 50;

    state.tick = OSC_PERIOD / 4;

    const inputs = sense(state, agent, { noiseFn: () => 0.42 });

    expect(inputs[0]).toBe(1); // north food
    expect(inputs[2]).toBe(1); // east food
    expect(inputs[4]).toBeCloseTo(0.96, 2); // proximity
    expect(inputs[6]).toBeCloseTo((200 - 50) / 255, 4); // gradX
    expect(inputs[7]).toBe(0); // gradY
    expect(inputs[8]).toBeCloseTo(0.4, 5); // wall distance
    expect(inputs[9]).toBeCloseTo(0.5, 5); // energy normalized
    expect(inputs[10]).toBeCloseTo(1, 5); // osc peak at quarter period
    expect(inputs[11]).toBe(0.42); // noise passthrough
  });
});
