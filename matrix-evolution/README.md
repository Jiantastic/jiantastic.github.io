# Matrix Evolution (`matrix-evolution`)

Browser implementation of the 2D BFF spatial soup from _Computational Life: How Well-formed, Self-replicating Programs Emerge from Simple Interaction_.

The browser version follows the paper's 2D BFF interaction model and the official [CuBFF reference implementation](https://github.com/paradigms-of-intelligence/cubff), while using a compressed visualization that remains usable on a single web page.

## What it implements

- A `240 x 135` grid of programs.
- `64` bytes per program tape.
- Chebyshev-radius-2 spatial pairing.
- Greedy "both untaken" matching within each epoch.
- Concatenate two tapes, execute BFF on the combined tape, then split back.
- Background mutation after pair interactions at `0.024%` (`0.00024`).
- Up to `2^13` (`8192`) instruction steps per interaction.

## Browser-specific adaptation

The browser page is paper-faithful in semantics and defaults, but not in visualization:

- The simulation runs in [`sim-worker.js`](./sim-worker.js) so the UI stays responsive.
- The canvas draws one pixel per tape, colored by that tape's dominant opcode.
- It does not render all 64 bytes of every tape as an `8x8` tile the way the Python GIF renderer can.

## Controls

- `Mutation rate`: background mutation probability per byte after each epoch.
- `Max iterations`: instruction budget per concatenated interaction.
- `Epochs / tick`: how many epochs the worker advances before yielding again.
- `Pause`: stops background work without resetting the current soup.
- `Randomize`: rebuilds the soup with fresh random programs while preserving controls.

## Files

- [`bff-core.js`](./bff-core.js): pure simulation logic shared by tests, the page, and the worker.
- [`sim-worker.js`](./sim-worker.js): background execution loop and snapshot generation.
- [`app.js`](./app.js): main-thread canvas renderer and control wiring.
- [`index.html`](./index.html): page markup and explanatory copy.
- [`tests/bff-core.test.js`](./tests/bff-core.test.js): unit coverage for core semantics and defaults.

## Running locally

Serve the repo with any static server from the project root:

```bash
python -m http.server 3000
# then open http://localhost:3000/matrix-evolution/
```

Use a server rather than `file://`, because module workers require an HTTP origin.

## Tests

From the repo root:

```bash
npm install
npm test -- --run matrix-evolution/tests/bff-core.test.js
```

## Notes on fidelity

- Source of truth for semantics: the paper and the official [CuBFF implementation](https://github.com/paradigms-of-intelligence/cubff).
- Source of truth for browser architecture: this directory.
- If browser constraints force future deviation, document it here and in [`CLAUDE.md`](../CLAUDE.md) instead of leaving the relationship implicit.
