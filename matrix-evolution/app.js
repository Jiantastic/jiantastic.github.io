// BFF primordial soup — main-thread renderer + worker controls
import {
  GRID_W,
  GRID_H,
  TAPE_SIZE,
  MAX_ITERS,
  DEFAULT_MUTATION_RATE,
} from "./bff-core.js?v=20260709b";

// Color LUT: maps byte value → RGBA (matching main.py palette)
const PALETTE = {
  60: [239, 71, 111], // <
  62: [255, 209, 102], // >
  123: [6, 214, 160], // {
  125: [17, 138, 178], // }
  45: [255, 127, 80], // -
  43: [131, 56, 236], // +
  46: [58, 134, 255], // .
  44: [255, 190, 11], // ,
  91: [139, 201, 38], // [
  93: [255, 89, 94], // ]
};
const NOISE = [20, 20, 20];

const COLOR_LUT = new Uint8ClampedArray(256 * 4);
for (let i = 0; i < 256; i++) {
  const base = i * 4;
  const [r, g, b] = PALETTE[i] ?? NOISE;
  COLOR_LUT[base] = r;
  COLOR_LUT[base + 1] = g;
  COLOR_LUT[base + 2] = b;
  COLOR_LUT[base + 3] = 255;
}

const canvas = document.getElementById("sim-canvas");
const ctx = canvas.getContext("2d");
const statsEl = document.getElementById("stats");
const mutationInput = document.getElementById("mutationRange");
const maxItersInput = document.getElementById("maxItersRange");
const epochSpeedInput = document.getElementById("epochSpeedRange");
const resetBtn = document.getElementById("resetBtn");
const pauseBtn = document.getElementById("pauseBtn");
const mutationValue = document.getElementById("mutationValue");
const maxItersValue = document.getElementById("maxItersValue");
const epochSpeedValue = document.getElementById("epochSpeedValue");

canvas.width = GRID_W;
canvas.height = GRID_H;

const imgData = ctx.createImageData(GRID_W, GRID_H);
const pixels = imgData.data;

const worker = new Worker(new URL("./sim-worker.js?v=20260709b", import.meta.url), {
  type: "module",
});

let epochsPerSecond = 0;
let lastRateTime = performance.now();
let lastRateEpoch = 0;
let currentEpoch = 0;
let opcodePercent = 0;
let byteEntropy = 0;
let userPaused = false;
let pausedForVisibility = false;

function renderSoup(dominantOpcodes) {
  for (let cellY = 0; cellY < GRID_H; cellY++) {
    for (let cellX = 0; cellX < GRID_W; cellX++) {
      // Column-major cell index (matches Python/worker storage)
      const cellIdx = cellX * GRID_H + cellY;
      const lutBase = dominantOpcodes[cellIdx] * 4;
      // Row-major pixel index for ImageData
      const pixBase = (cellY * GRID_W + cellX) * 4;
      pixels[pixBase] = COLOR_LUT[lutBase];
      pixels[pixBase + 1] = COLOR_LUT[lutBase + 1];
      pixels[pixBase + 2] = COLOR_LUT[lutBase + 2];
      pixels[pixBase + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

function updateStats() {
  statsEl.innerHTML = `
    <div class="stat-line"><span>Epoch</span><span>${currentEpoch}</span></div>
    <div class="stat-line"><span>Opcode %</span><span>${opcodePercent.toFixed(1)}%</span></div>
    <div class="stat-line"><span>Entropy</span><span>${byteEntropy.toFixed(2)} bits</span></div>
    <div class="stat-line"><span>Epochs/s</span><span>${epochsPerSecond.toFixed(1)}</span></div>
    <div class="stat-line"><span>Tape bytes</span><span>${TAPE_SIZE}</span></div>
    <div class="stat-line"><span>Max steps</span><span>${parseInt(maxItersInput.value, 10)}</span></div>
  `;
}

function syncControls() {
  mutationValue.textContent = Number(mutationInput.value).toFixed(5);
  maxItersValue.textContent = maxItersInput.value;
  epochSpeedValue.textContent = epochSpeedInput.value;
  worker.postMessage({
    type: "update",
    mutationRate: parseFloat(mutationInput.value),
    maxIters: parseInt(maxItersInput.value, 10),
    epochsPerTick: parseInt(epochSpeedInput.value, 10),
  });
}

worker.addEventListener("message", (event) => {
  if (event.data?.type !== "snapshot") return;

  currentEpoch = event.data.epoch;
  opcodePercent = event.data.opcodePercent;
  byteEntropy = event.data.entropy;
  renderSoup(event.data.dominantOpcodes);

  const now = performance.now();
  if (now - lastRateTime >= 500) {
    epochsPerSecond = (currentEpoch - lastRateEpoch) / ((now - lastRateTime) / 1000);
    lastRateEpoch = currentEpoch;
    lastRateTime = now;
  }

  updateStats();
});

worker.addEventListener("error", (event) => {
  statsEl.textContent = `Worker error: ${event.message}`;
});

mutationInput.addEventListener("input", syncControls);
maxItersInput.addEventListener("input", syncControls);
epochSpeedInput.addEventListener("input", syncControls);

resetBtn.addEventListener("click", () => {
  lastRateEpoch = 0;
  epochsPerSecond = 0;
  worker.postMessage({ type: "reset" });
});

function setPaused(paused) {
  worker.postMessage({ type: paused ? "pause" : "resume" });
  if (!paused) {
    lastRateTime = performance.now();
    lastRateEpoch = currentEpoch;
  }
  pauseBtn.textContent = paused ? "Resume" : "Pause";
  pauseBtn.setAttribute("aria-pressed", String(paused));
}

pauseBtn.addEventListener("click", () => {
  userPaused = !userPaused;
  setPaused(userPaused);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && !userPaused) {
    pausedForVisibility = true;
    worker.postMessage({ type: "pause" });
  } else if (!document.hidden && pausedForVisibility) {
    pausedForVisibility = false;
    worker.postMessage({ type: "resume" });
  }
});

statsEl.textContent = "Starting worker...";
const initialMutationRate = parseFloat(mutationInput.value);
const initialMaxIters = parseInt(maxItersInput.value, 10);
worker.postMessage({
  type: "init",
  mutationRate: Number.isFinite(initialMutationRate)
    ? initialMutationRate
    : DEFAULT_MUTATION_RATE,
  maxIters: Number.isFinite(initialMaxIters) ? initialMaxIters : MAX_ITERS,
  epochsPerTick: parseInt(epochSpeedInput.value, 10),
});
syncControls();
