// BFF primordial soup — pure simulation logic, no DOM
export const GRID_W = 240;
export const GRID_H = 135;
export const TAPE_SIZE = 64;
export const MAX_ITERS = 2 ** 13;
export const DEFAULT_MUTATION_RATE = 0.00024;

// Opcode ASCII codes
const LT = 60,
  GT = 62,
  LB = 123,
  RB = 125;
const MINUS = 45,
  PLUS = 43,
  DOT = 46,
  COMMA = 44;
const LBRACK = 91,
  RBRACK = 93;

export const OPCODE_SET = new Uint8Array(256);
for (const c of [LT, GT, LB, RB, MINUS, PLUS, DOT, COMMA, LBRACK, RBRACK]) {
  OPCODE_SET[c] = 1;
}

function xorshift32(state) {
  let x = state[0];
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (state[0] = x >>> 0);
}

// Iterative bracket search — never recurses
export function seekMatch(tape, pc, step, openTok, closeTok, total) {
  let depth = 1;
  pc += step;
  while (pc >= 0 && pc < total && depth > 0) {
    const op = tape[pc];
    if (op === openTok) depth++;
    else if (op === closeTok) depth--;
    pc += step;
  }
  return depth === 0 ? pc - step : -1;
}

// In-place BFF interpreter on scratch (tapeSize*2 bytes). No allocations.
export function runTape(scratch, tapeSize, maxIters) {
  const total = tapeSize * 2;
  let pc = 0,
    head0 = 0,
    head1 = 0;
  for (let i = 0; i < maxIters; i++) {
    if (pc < 0 || pc >= total) break;
    const op = scratch[pc];
    if (op === LT) {
      head0 = (head0 - 1 + total) % total;
    } else if (op === GT) {
      head0 = (head0 + 1) % total;
    } else if (op === LB) {
      head1 = (head1 - 1 + total) % total;
    } else if (op === RB) {
      head1 = (head1 + 1) % total;
    } else if (op === MINUS) {
      scratch[head0] = (scratch[head0] - 1 + 256) & 255;
    } else if (op === PLUS) {
      scratch[head0] = (scratch[head0] + 1) & 255;
    } else if (op === DOT) {
      scratch[head1] = scratch[head0];
    } else if (op === COMMA) {
      scratch[head0] = scratch[head1];
    } else if (op === LBRACK && scratch[head0] === 0) {
      pc = seekMatch(scratch, pc, 1, LBRACK, RBRACK, total);
      if (pc < 0) break;
    } else if (op === RBRACK && scratch[head0] !== 0) {
      pc = seekMatch(scratch, pc, -1, RBRACK, LBRACK, total);
      if (pc < 0) break;
    }
    pc++;
  }
}

// Build Chebyshev-radius-2 neighbor list (column-major: idx = x*gridH + y)
export function buildNeighborhood(gridW, gridH) {
  const numPrograms = gridW * gridH;
  const neighbors = new Int32Array(numPrograms * 24).fill(-1);
  const neighborCounts = new Uint8Array(numPrograms);

  for (let x = 0; x < gridW; x++) {
    const xLo = Math.max(0, x - 2);
    const xHi = Math.min(gridW, x + 3);
    for (let y = 0; y < gridH; y++) {
      const yLo = Math.max(0, y - 2);
      const yHi = Math.min(gridH, y + 3);
      const idx = x * gridH + y;
      let count = 0;
      for (let nx = xLo; nx < xHi; nx++) {
        const base = nx * gridH;
        for (let ny = yLo; ny < yHi; ny++) {
          if (nx === x && ny === y) continue;
          neighbors[idx * 24 + count++] = base + ny;
        }
      }
      neighborCounts[idx] = count;
    }
  }
  return { neighbors, neighborCounts };
}

export function createSoupState(opts = {}) {
  const gridW = opts.gridW ?? GRID_W;
  const gridH = opts.gridH ?? GRID_H;
  const tapeSize = opts.tapeSize ?? TAPE_SIZE;
  const maxIters = opts.maxIters ?? MAX_ITERS;
  const mutationRate = opts.mutationRate ?? DEFAULT_MUTATION_RATE;
  const numPrograms = gridW * gridH;

  const programs = new Uint8Array(numPrograms * tapeSize);
  for (let i = 0; i < programs.length; i++)
    programs[i] = Math.floor(Math.random() * 256);

  const scratch = new Uint8Array(tapeSize * 2);
  const { neighbors, neighborCounts } = buildNeighborhood(gridW, gridH);
  const taken = new Uint8Array(numPrograms);
  const proposals = new Int32Array(numPrograms);
  const order = new Int32Array(numPrograms);
  for (let i = 0; i < numPrograms; i++) order[i] = i;
  const rngState = new Uint32Array([
    (Math.floor(Math.random() * 0xffffffff) | 1) >>> 0,
  ]);

  return {
    gridW,
    gridH,
    tapeSize,
    maxIters,
    mutationRate,
    numPrograms,
    programs,
    scratch,
    neighbors,
    neighborCounts,
    taken,
    proposals,
    order,
    rngState,
    epoch: 0,
  };
}

// Fisher-Yates shuffle → propose neighbors → select non-overlapping pairs →
// run BFF on each pair → background mutation
export function runEpoch(state) {
  const {
    numPrograms,
    programs,
    scratch,
    neighbors,
    neighborCounts,
    taken,
    proposals,
    order,
    rngState,
    tapeSize,
    maxIters,
    mutationRate,
  } = state;

  // Fisher-Yates shuffle
  for (let i = numPrograms - 1; i > 0; i--) {
    const j = xorshift32(rngState) % (i + 1);
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }

  // Each program picks a random neighbor to interact with
  for (let p = 0; p < numPrograms; p++) {
    const nc = neighborCounts[p];
    proposals[p] =
      nc === 0 ? -1 : neighbors[p * 24 + (xorshift32(rngState) % nc)];
  }

  // Greedy pair selection (both partners must be untaken)
  taken.fill(0);
  for (let i = 0; i < numPrograms; i++) {
    const p = order[i];
    const n = proposals[p];
    if (n < 0 || taken[p] || taken[n]) continue;
    taken[p] = 1;
    taken[n] = 1;

    const offA = p * tapeSize;
    const offB = n * tapeSize;
    scratch.set(programs.subarray(offA, offA + tapeSize), 0);
    scratch.set(programs.subarray(offB, offB + tapeSize), tapeSize);
    runTape(scratch, tapeSize, maxIters);
    programs.set(scratch.subarray(0, tapeSize), offA);
    programs.set(scratch.subarray(tapeSize, tapeSize * 2), offB);
  }

  // Background mutation — geometric skip (O(expected mutations) not O(total bytes))
  if (mutationRate > 0) {
    const logOneMinus = Math.log(1 - mutationRate);
    const total = numPrograms * tapeSize;
    let idx = -1;
    while (true) {
      const v = (xorshift32(rngState) >>> 0) / 0x100000000; // always > 0 (state never 0)
      idx += Math.ceil(Math.log(v) / logOneMinus);
      if (idx >= total) break;
      programs[idx] = xorshift32(rngState) & 255;
    }
  }

  state.epoch++;
}

const _byteCounts = new Uint32Array(256);

export function computePopulationMetrics(state) {
  const { programs } = state;
  _byteCounts.fill(0);
  let opcodeCount = 0;
  for (let i = 0; i < programs.length; i++) {
    const byte = programs[i];
    _byteCounts[byte]++;
    if (OPCODE_SET[byte]) opcodeCount++;
  }
  let entropy = 0;
  for (let byte = 0; byte < 256; byte++) {
    if (_byteCounts[byte] === 0) continue;
    const probability = _byteCounts[byte] / programs.length;
    entropy -= probability * Math.log2(probability);
  }
  return {
    opcodePercent: (opcodeCount / programs.length) * 100,
    entropy,
  };
}

export function computeOpcodePercent(state) {
  return computePopulationMetrics(state).opcodePercent;
}

// FNV-1a fingerprint per tape → count unique programs
export function computeUniqueFingerprints(state) {
  const { programs, numPrograms, tapeSize } = state;
  const seen = new Set();
  for (let p = 0; p < numPrograms; p++) {
    let h = 0x811c9dc5;
    const off = p * tapeSize;
    for (let i = 0; i < tapeSize; i++) {
      h = Math.imul(h ^ programs[off + i], 0x01000193) >>> 0;
    }
    seen.add(h);
  }
  return seen.size;
}

// Reused scratch for count array — avoids allocation in hot rendering path
const _opCounts = new Uint16Array(256);
const OPCODES = [LT, GT, LB, RB, MINUS, PLUS, DOT, COMMA, LBRACK, RBRACK];

function dominantOpcodeAt(programs, tapeSize, offset) {
  _opCounts.fill(0);
  for (let i = 0; i < tapeSize; i++) _opCounts[programs[offset + i]]++;
  let bestByte = 0,
    bestCount = 0;
  for (const code of OPCODES) {
    if (_opCounts[code] > bestCount) {
      bestCount = _opCounts[code];
      bestByte = code;
    }
  }
  return bestByte;
}

export function getDominantOpcode(state, cellIdx) {
  const { programs, tapeSize } = state;
  return dominantOpcodeAt(programs, tapeSize, cellIdx * tapeSize);
}

export function computeDominantOpcodes(state) {
  const { programs, numPrograms, tapeSize } = state;
  const dominantOpcodes = new Uint8Array(numPrograms);
  for (let cellIdx = 0; cellIdx < numPrograms; cellIdx++) {
    dominantOpcodes[cellIdx] = dominantOpcodeAt(
      programs,
      tapeSize,
      cellIdx * tapeSize,
    );
  }
  return dominantOpcodes;
}
