import {
  GRID_W,
  GRID_H,
  TAPE_SIZE,
  MAX_ITERS,
  DEFAULT_MUTATION_RATE,
  createSoupState,
  runEpoch,
  computePopulationMetrics,
  computeDominantOpcodes,
} from "./bff-core.js?v=20260709b";

const SNAPSHOT_INTERVAL_MS = 320;

let state = null;
let running = false;
let epochsPerTick = 1;
let lastSnapshotAt = 0;

const config = {
  gridW: GRID_W,
  gridH: GRID_H,
  tapeSize: TAPE_SIZE,
  maxIters: MAX_ITERS,
  mutationRate: DEFAULT_MUTATION_RATE,
};

function postSnapshot(force = false) {
  if (!state) return;

  const now = performance.now();
  if (!force && now - lastSnapshotAt < SNAPSHOT_INTERVAL_MS) return;
  lastSnapshotAt = now;

  const dominantOpcodes = computeDominantOpcodes(state);
  const metrics = computePopulationMetrics(state);
  self.postMessage(
    {
      type: "snapshot",
      epoch: state.epoch,
      gridW: state.gridW,
      gridH: state.gridH,
      tapeSize: state.tapeSize,
      maxIters: state.maxIters,
      mutationRate: state.mutationRate,
      opcodePercent: metrics.opcodePercent,
      entropy: metrics.entropy,
      dominantOpcodes,
    },
    [dominantOpcodes.buffer],
  );
}

function resetState() {
  state = createSoupState(config);
  lastSnapshotAt = 0;
  postSnapshot(true);
}

function loop() {
  if (!running || !state) return;

  for (let i = 0; i < epochsPerTick; i++) {
    runEpoch(state);
  }

  postSnapshot(false);
  setTimeout(loop, 0);
}

function start() {
  if (running) return;
  running = true;
  loop();
}

self.onmessage = (event) => {
  const data = event.data ?? {};

  if (data.type === "init") {
    if (typeof data.epochsPerTick === "number") {
      epochsPerTick = data.epochsPerTick;
    }
    if (typeof data.maxIters === "number") {
      config.maxIters = data.maxIters;
    }
    if (typeof data.mutationRate === "number") {
      config.mutationRate = data.mutationRate;
    }
    resetState();
    start();
    return;
  }

  if (!state) return;

  if (data.type === "pause") {
    running = false;
    return;
  }

  if (data.type === "resume") {
    start();
    return;
  }

  if (data.type === "update") {
    if (typeof data.epochsPerTick === "number") {
      epochsPerTick = data.epochsPerTick;
    }
    if (typeof data.maxIters === "number") {
      config.maxIters = data.maxIters;
      state.maxIters = data.maxIters;
    }
    if (typeof data.mutationRate === "number") {
      config.mutationRate = data.mutationRate;
      state.mutationRate = data.mutationRate;
    }
    postSnapshot(true);
    return;
  }

  if (data.type === "reset") {
    resetState();
  }
};
