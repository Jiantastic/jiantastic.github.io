import { describe, it, expect } from "vitest";
import {
  runTape,
  seekMatch,
  runEpoch,
  computeOpcodePercent,
  computePopulationMetrics,
  computeDominantOpcodes,
  getDominantOpcode,
  buildNeighborhood,
  createSoupState,
} from "../bff-core.js";

// Helper: make a scratch buffer from byte arrays (A and B tapes)
function makeScratch(...bytes) {
  return new Uint8Array(bytes);
}

describe("runTape", () => {
  it("all-zero tape terminates early without modifying scratch", () => {
    const scratch = new Uint8Array(8); // tapeSize=4
    runTape(scratch, 4, 1000);
    expect(scratch.every((b) => b === 0)).toBe(true);
  });

  it("+ (43) increments scratch[head0]", () => {
    // scratch = [43, 0] — '+' at pc=0, head0=0 → scratch[0] becomes 44
    const scratch = makeScratch(43, 0);
    runTape(scratch, 1, 100);
    expect(scratch[0]).toBe(44);
  });

  it(". (46) copies scratch[head0] to scratch[head1]", () => {
    // }, }, . → moves head1 to 2, then copies scratch[head0=0] to scratch[head1=2]
    // scratch = [125, 125, 46, 0] tapeSize=2; scratch[0]=125 (}) will be copied to [2]
    const scratch = makeScratch(125, 125, 46, 0);
    runTape(scratch, 2, 100);
    expect(scratch[2]).toBe(125);
  });

  it(", (44) copies scratch[head1] back to scratch[head0]", () => {
    // { wraps head1 from 0 to 3; comma then copies byte 7 into head0 at index 0.
    const scratch = makeScratch(123, 44, 0, 7);
    runTape(scratch, 2, 100);
    expect(scratch[0]).toBe(7);
  });

  it("data heads wrap across the complete concatenated tape", () => {
    // < wraps head0 to the final byte, where + increments 5 to 6.
    const scratch = makeScratch(60, 43, 0, 5);
    runTape(scratch, 2, 100);
    expect(scratch[3]).toBe(6);
  });

  it("[ (91) skips to matching ] when scratch[head0] === 0", () => {
    // scratch = [0, 91, 43, 93] tapeSize=2
    // PC=0: op=0 (noop), PC=1: [ with scratch[head0=0]=0 → skip to ]
    // seek finds ] at pc=3 → pc becomes 4 → exit; + at pc=2 never executes
    const scratch = makeScratch(0, 91, 43, 93);
    runTape(scratch, 2, 100);
    expect(scratch[2]).toBe(43); // '+' byte unmodified (not executed)
  });

  it("[-] counts down scratch[0] to zero", () => {
    // Program in B half: [-, ], 0, 0; data in A half: [3, 0, 0, 0]
    // tapeSize=4 → total=8; PC starts at 0 (A half = data, B half = program)
    const scratch = makeScratch(3, 0, 0, 0, 91, 45, 93, 0);
    runTape(scratch, 4, 200);
    expect(scratch[0]).toBe(0);
  });

  it("nested brackets: [[+[+]+]] skips entirely when scratch[head0]=0", () => {
    // scratch[0]=0 → outer [ skips all; inner + never executes
    // layout: [0, [, +, [, +, ], +, ]] tapeSize=4 total=8
    const scratch = makeScratch(0, 91, 43, 91, 43, 93, 43, 93);
    runTape(scratch, 4, 200);
    expect(scratch[2]).toBe(43);
    expect(scratch[4]).toBe(43);
    expect(scratch[6]).toBe(43);
  });

  it("unclosed [ with no matching ] terminates cleanly (pc=-1 → break)", () => {
    // scratch = [0, 91, 43, 0] tapeSize=2 — no closing ]
    // PC=1: [ with scratch[0]=0 → seekMatch forward finds no ] → pc=-1 → break
    const scratch = makeScratch(0, 91, 43, 0);
    runTape(scratch, 2, 100);
    expect(scratch[2]).toBe(43); // + never executed — graceful exit
  });
});

describe("runEpoch", () => {
  it("programs array length stays constant after one epoch", () => {
    const state = createSoupState({
      gridW: 4,
      gridH: 4,
      tapeSize: 4,
      maxIters: 64,
    });
    const before = state.programs.length;
    runEpoch(state);
    expect(state.programs.length).toBe(before);
  });

  it("supports paper-scale tape settings without changing array shape", () => {
    const state = createSoupState({
      gridW: 6,
      gridH: 6,
      tapeSize: 64,
      maxIters: 2 ** 13,
      mutationRate: 0,
    });
    const before = state.programs.length;
    runEpoch(state);
    expect(state.programs.length).toBe(before);
    expect(state.epoch).toBe(1);
  });
});

describe("createSoupState", () => {
  it("defaults match the paper-scale browser configuration", () => {
    const state = createSoupState();
    expect(state.gridW).toBe(240);
    expect(state.gridH).toBe(135);
    expect(state.tapeSize).toBe(64);
    expect(state.maxIters).toBe(2 ** 13);
    expect(state.mutationRate).toBe(0.00024);
    expect(state.programs.length).toBe(240 * 135 * 64);
  });
});

describe("computeOpcodePercent", () => {
  it("returns 0 for all-zero tape", () => {
    const state = createSoupState({ gridW: 2, gridH: 2, tapeSize: 4 });
    state.programs.fill(0);
    expect(computeOpcodePercent(state)).toBe(0);
  });

  it("returns 100 for tape filled with opcodes", () => {
    const state = createSoupState({ gridW: 2, gridH: 2, tapeSize: 4 });
    state.programs.fill(43); // '+' = 43, a valid opcode
    expect(computeOpcodePercent(state)).toBe(100);
  });
});

describe("computePopulationMetrics", () => {
  it("reports zero entropy for a uniform byte population", () => {
    const state = createSoupState({ gridW: 2, gridH: 1, tapeSize: 4 });
    state.programs.fill(43);
    expect(computePopulationMetrics(state)).toEqual({ opcodePercent: 100, entropy: 0 });
  });

  it("reports one bit of entropy for an even two-byte population", () => {
    const state = createSoupState({ gridW: 2, gridH: 1, tapeSize: 4 });
    state.programs.set([0, 0, 0, 0, 43, 43, 43, 43]);
    const metrics = computePopulationMetrics(state);
    expect(metrics.opcodePercent).toBe(50);
    expect(metrics.entropy).toBeCloseTo(1, 8);
  });
});

describe("getDominantOpcode", () => {
  it("returns the most-frequent opcode byte in a cell", () => {
    const state = createSoupState({ gridW: 2, gridH: 2, tapeSize: 8 });
    state.programs.fill(0);
    // Cell 0 (idx=0): 6× '+' (43), 2× '<' (60) → '+' dominates
    for (let i = 0; i < 6; i++) state.programs[i] = 43;
    state.programs[6] = 60;
    state.programs[7] = 60;
    expect(getDominantOpcode(state, 0)).toBe(43);
  });
});

describe("computeDominantOpcodes", () => {
  it("returns one dominant opcode per cell", () => {
    const state = createSoupState({ gridW: 2, gridH: 1, tapeSize: 4 });
    state.programs.set([43, 43, 60, 43, 60, 60, 91, 0]);
    expect(Array.from(computeDominantOpcodes(state))).toEqual([43, 60]);
  });
});

describe("buildNeighborhood", () => {
  it("corner cell has fewer than 24 neighbors", () => {
    const { neighborCounts } = buildNeighborhood(10, 10);
    // Cell (0,0) → idx = 0*10+0 = 0; 3×3 block minus self = 8 neighbors
    expect(neighborCounts[0]).toBeLessThan(24);
  });

  it("interior cell with full radius-2 window has exactly 24 neighbors", () => {
    const { neighborCounts } = buildNeighborhood(10, 10);
    // Cell (5,5) → idx = 5*10+5 = 55; 5×5 block minus self = 24 neighbors
    expect(neighborCounts[55]).toBe(24);
  });
});
