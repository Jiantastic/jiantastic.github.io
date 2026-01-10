# Living Matrix Prototype (matrix-evolution)

An educational, mobile-friendly simulation that blends **Matrix rain aesthetics**, **Conway's Game of Life** food field, **pheromone trails**, and lightweight **glitch agents** driven by tiny neural nets. Rendering is done with Pixi.js on a single canvas for performance.

## What you see
- **Green cells**: Food grown by a Life-like CA (B3/S23 with gentle regrowth).
- **Blue overlay**: Pheromone trails agents emit; they decay over time.
- **Red blocks**: Agents that move, sense, eat food, and burn energy.

## Controls (UI)
- **Sim speed**: Scales tick rate.
- **Food density**: Adjusts probability of regrowth to sustain the field.

## How it works (brief)
- Grid: `72 x 48` cells stored in typed arrays.
- Game of Life step each tick + low-probability regrowth seeded by the slider target.
- Agents: small neural net (12 inputs → hidden → 4 outputs) with energy decay, eat to replenish, optional pheromone emit.
- Rendering: Pixi `Graphics` draws food, pheromone alpha, and agents every frame with devicePixelRatio caps for mobile.

## Running locally
No build step needed. With any static server from repo root:
```bash
npm install -g serve  # if you don't have a static server
serve .
# then open http://localhost:3000/matrix-evolution/
```

### Tests
The core simulation logic lives in `sim-core.js` and is covered by Vitest. From repo root:
```bash
npm install
npm test
```

## Troubleshooting
- **PIXI undefined / integrity blocked**: Ensure `matrix-evolution/index.html` loads Pixi.js without a mismatched SRI hash. Current script tag uses jsDelivr and omits integrity to avoid hash drift.
- **Canvas sizing**: The scene auto-resizes to the container; if embedding elsewhere, keep the container visible and sized.
- **Performance tips**: Lower food density or agent count in `app.js` if targeting very low-end devices.

## Files
- `index.html` – page scaffold and controls.
- `style.css` – dark UI styling for the prototype.
- `app.js` – simulation logic, agent brain, rendering loop.

## Inspiration
- Matrix rain shaders, Conway's Game of Life, and evolutionary sims like biosim4 (evolving agents with sensors/actions).
