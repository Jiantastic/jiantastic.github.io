import { describe, it, expect } from 'vitest';
import { createState, stepLife } from '../sim-core.js';

function setCell(state, x, y, val = 1) {
  state.grid[y * state.width + x] = val;
}

const noRegrow = { randomFn: () => 1 };

describe('life rules', () => {
  it('survives with 2 neighbors and spawns with 3', () => {
    const state = createState({ width: 3, height: 3 });
    setCell(state, 1, 1, 1);
    setCell(state, 1, 0, 1);
    setCell(state, 0, 1, 1);
    stepLife(state, noRegrow);
    expect(state.grid[1 * 3 + 1]).toBe(1);

    // birth: dead cell with 3 neighbors becomes alive
    const state2 = createState({ width: 3, height: 3 });
    setCell(state2, 0, 0, 1);
    setCell(state2, 1, 0, 1);
    setCell(state2, 0, 1, 1);
    stepLife(state2, noRegrow);
    expect(state2.grid[1]).toBe(1);
  });

  it('regrowth depends on targetFoodDensity', () => {
    const state = createState({ width: 2, height: 2, targetFoodDensity: 0 });
    stepLife(state, { randomFn: () => 0 });
    expect(state.grid.every((v) => v === 0)).toBe(true);

    const state2 = createState({ width: 2, height: 2, targetFoodDensity: 0.5 });
    stepLife(state2, { randomFn: () => 0 });
    expect(state2.grid.every((v) => v === 1)).toBe(true);
  });
});
