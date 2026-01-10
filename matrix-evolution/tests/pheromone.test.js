import { describe, it, expect } from 'vitest';
import { createState, decayPheromone, PHEROMONE_DECAY } from '../sim-core.js';

describe('pheromone decay', () => {
  it('reduces value and clamps at zero', () => {
    const state = createState({ width: 2, height: 2 });
    state.pheromone.set([1, PHEROMONE_DECAY, PHEROMONE_DECAY + 1, 10]);
    decayPheromone(state);
    expect(Array.from(state.pheromone)).toEqual([0, 0, 1, 10 - PHEROMONE_DECAY]);
  });
});
