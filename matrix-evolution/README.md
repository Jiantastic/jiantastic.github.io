# Living Matrix Prototype (matrix-evolution)

An educational, mobile-friendly simulation that blends **Matrix rain aesthetics**, **Conway's Game of Life** food field, **pheromone trails**, and lightweight **glitch agents** driven by tiny neural nets. Rendering is done with Pixi.js on a single canvas for performance. This project is inspired by https://github.com/davidrmiller/biosim4.

## What you see
- **Green cells**: Food grown by a Life-like CA (B3/S23 with gentle regrowth).
- **Blue overlay**: Pheromone trails agents emit; they decay over time.
- **Multicolor blocks**: Agents that move, sense, eat food, and burn energy. Color reflects lineage traits.

## Controls (UI)
- **Sim speed**: Scales tick rate.
- **Food density**: Adjusts probability of regrowth to sustain the field.
- **Mutation rate**: How often neural weights and lineage colors mutate in offspring.
- **Mutation strength**: How large each mutation step is when it happens.
- **Reproduction chance**: Probability an energized agent produces a child (within a generation).
- **Reproduction energy**: Energy threshold required to attempt reproduction.
- **Population cap**: Target size of the population after each generational reset.

## Evolution loop (biosim4-inspired)
- **Generations**: The sim runs for a fixed number of ticks, then the population is culled and respawned.
- **Fitness scoring**: Survivors are scored by a blend of energy, food eaten, and distance traveled.
- **Selection**: A top slice of survivors becomes parents; they are picked by fitness-weighted roulette.
- **Respawn**: The next generation is rebuilt from parent genomes (brains + colors), with mutation applied.
- **Lineage colors**: Agent color is inherited and slightly mutated, making family clusters visible.
Default generation length is tuned in `sim-core.js` (see `GENERATION_TICKS`) if you want shorter or longer cycles.

## How to read the UI
- **Agents**: Total living population right now.
- **Generation**: Current generation index; it increments after each cull/respawn.
- **Gen progress**: How far the current generation has advanced toward the next reset.
- **Last survivors**: How many agents were kept as parents in the previous selection round.
- **Avg fitness**: Average fitness score of those parent candidates.
- **Births/Deaths**: Cumulative count of spawned and removed agents (includes generational resets).

## How it works (brief)
- Grid: `72 x 48` cells stored in typed arrays.
- Game of Life step each tick + low-probability regrowth seeded by the slider target.
- Agents: small neural net (12 inputs → hidden → 4 outputs) with energy decay, eat to replenish, optional pheromone emit, and reproduction with mutation + genetic colors.
- Generations: periodic selection and respawn phases, inspired by biosim4.

## Detailed breakdown
- **Environment update**: Each tick runs a Life-like rule (B3/S23) plus light regrowth to keep food available.
- **Sensing**: Agents sample local food, pheromone gradients, proximity to other agents, wall distance, energy level, and a simple oscillator + noise input.
- **Decision**: A tiny neural net maps 12 inputs to 4 outputs (dx, dy, eat, emit).
- **Actions**: Movement costs energy; eating converts food cells into energy; emitting leaves a decaying pheromone trail.
- **Within-generation reproduction**: Energetic agents can spawn children; offspring inherit brains/colors with mutation.
- **Selection phase**: Every generation, survivors are scored (energy + food + travel), then parents are chosen by fitness-weighted roulette.
- **Respawn**: The next generation is rebuilt from parents, letting lineages drift and adapt over time.

## How to think about it
- **Food is the environment**: High density favors exploration; low density increases selection pressure.
- **Colors are families**: Clusters of similar colors often share a successful behavioral niche.
- **Fitness is emergent**: No explicit goal is coded; survival and reproduction define success.
- **Selection is the reset**: Generational culls are where evolution shows up most clearly.
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
- Matrix rain shaders, Conway's Game of Life, and evolutionary sims like biosim4 (https://github.com/davidrmiller/biosim4).
