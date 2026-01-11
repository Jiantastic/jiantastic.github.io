import { describe, it, expect } from 'vitest';
import {
  createState,
  createAgent,
  advanceGeneration,
  runSelection,
  MAX_ENERGY,
} from '../sim-core.js';

const fixedRng = () => 0.5;

describe('selection', () => {
  it('culls to survivors and enters reset phase', () => {
    const state = createState({
      width: 5,
      height: 5,
      evo: {
        maxAgents: 4,
        minAgents: 0,
        survivorFraction: 0.5,
        eliteFraction: 0,
        mutationRate: 0,
        mutationStrength: 0,
        colorMutation: 0,
        generationRecovery: 5,
      },
    });
    state.agents = [
      createAgent(state, fixedRng),
      createAgent(state, fixedRng),
      createAgent(state, fixedRng),
      createAgent(state, fixedRng),
    ];
    state.agents[0].energy = MAX_ENERGY;
    state.agents[1].energy = MAX_ENERGY * 0.8;
    state.agents[2].energy = 10;
    state.agents[3].energy = 5;

    runSelection(state, fixedRng);
    expect(state.agents.length).toBe(2);
    expect(state.lastSurvivors).toBe(2);
    expect(state.generationPhase).toBe('reset');
  });

  it('advances generation and respawns when recovery is zero', () => {
    const state = createState({
      width: 5,
      height: 5,
      evo: {
        generationLength: 1,
        generationRecovery: 0,
        maxAgents: 2,
        minAgents: 0,
        survivorFraction: 1,
        mutationRate: 0,
        mutationStrength: 0,
        colorMutation: 0,
      },
    });
    state.agents = [createAgent(state, fixedRng), createAgent(state, fixedRng)];
    const advanced = advanceGeneration(state, 1, { rng: fixedRng });
    expect(advanced).toBe(true);
    expect(state.generation).toBe(2);
    expect(state.agents.length).toBe(2);
  });
});
