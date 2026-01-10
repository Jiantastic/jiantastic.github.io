import { describe, it, expect } from 'vitest';
import { feedForward } from '../sim-core.js';

describe('feedForward', () => {
  it('produces tanh outputs from weights and inputs', () => {
    const agent = {
      brain: {
        hiddenSize: 1,
        w1: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        w2: new Float32Array([1, 1, 1, 1]),
      },
    };
    const inputs = new Float32Array(12);
    inputs[0] = 1;
    const outputs = feedForward(agent, inputs);
    const hidden = Math.tanh(1);
    const expected = Math.tanh(hidden);
    expect(outputs[0]).toBeCloseTo(expected, 5);
    expect(outputs[1]).toBeCloseTo(expected, 5);
    expect(outputs[2]).toBeCloseTo(expected, 5);
    expect(outputs[3]).toBeCloseTo(expected, 5);
  });
});
