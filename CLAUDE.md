# CLAUDE.md — jiantastic.github.io

Jekyll static site hosted on GitHub Pages. Dark-themed personal site with interactive prototypes.

## Stack

- Jekyll (GitHub Pages) — no local build needed; push to `master` deploys
- Plain HTML/CSS/JS for prototypes (ES modules, no bundler)
- Vitest for unit tests (root `vitest.config.js`, env: jsdom)
- Run tests: `npm test` or `./node_modules/.bin/vitest run`

## Key directories

```
matrix-evolution/   BFF primordial soup simulation (main prototype)
artificial-life/    Python/Numba reference implementation (main.py)
_includes/          Jekyll partials (nav.html etc.)
_layouts/           Jekyll layouts
```

## matrix-evolution — BFF Primordial Soup

Based on _Computational Life_ (Agüera y Arcas et al., 2024).

### Files

| File                     | Role                                                     |
| ------------------------ | -------------------------------------------------------- |
| `bff-core.js`            | Pure simulation engine — no DOM, fully testable          |
| `sim-worker.js`          | Worker loop for paper-scale browser execution            |
| `app.js`                 | Canvas renderer + worker/control wiring                  |
| `index.html`             | Page markup (Jekyll front matter, controls, canvas)      |
| `style.css`              | Dark theme; `#sim-canvas { image-rendering: pixelated }` |
| `sim-core.js`            | Kept on disk — original neural-agent sim (untouched)     |
| `tests/bff-core.test.js` | 16 BFF tests                                             |
| `tests/*.test.js`        | 6 original neural-agent tests                            |

### Grid & constants (bff-core.js)

```
GRID_W = 240, GRID_H = 135   → 32,400 programs
TAPE_SIZE = 64               → ~2.0 MB total
MAX_ITERS = 8192             → BFF steps per interaction
DEFAULT_MUTATION_RATE = 0.00024
```

### BFF opcodes

```
< 60  > 62  { 123  } 125  - 45  + 43  . 46  , 44  [ 91  ] 93
<>  → head0   {}  → head1   +-  → scratch[head0]
.   → scratch[head1] = scratch[head0]
,   → scratch[head0] = scratch[head1]
[]  → loop brackets (check scratch[head0])
```

### Semantics

- Two programs (A, B) concatenated into `scratch[0..tapeSize*2]`
- `head0` and `head1` wrap around `tapeSize * 2`
- PC terminates when out of `[0, tapeSize*2)` OR after `maxIters` steps
- `seekMatch` is iterative (not recursive) — avoids stack overflow
- Mutation uses geometric skip (O(expected mutations), not O(total bytes))

### Indexing

- Programs: **column-major** — `cellIdx = cellX * GRID_H + cellY` (matches Python)
- ImageData: **row-major** — `pixBase = (cellY * GRID_W + cellX) * 4`
- Neighbors: Chebyshev radius 2 → up to 24 per cell, stored flat in `Int32Array[numPrograms * 24]`

### Rendering

- Canvas intrinsic = `GRID_W × GRID_H` (240×135 pixels)
- CSS `width:100%; height:100%` + `image-rendering: pixelated` scales it up crisply
- One pixel per cell; color = dominant opcode in that cell's tape
- Worker sends compressed dominant-opcode snapshots to the main thread
- `getDominantOpcode`/`computeDominantOpcodes` use a module-level `Uint16Array(256)` scratch

### Color palette (matches main.py)

```
< [239,71,111]   > [255,209,102]  { [6,214,160]    } [17,138,178]
- [255,127,80]   + [131,56,236]   . [58,134,255]    , [255,190,11]
[ [139,201,38]   ] [255,89,94]    noise → [20,20,20]
```

### Epoch loop (runEpoch)

1. Fisher-Yates shuffle of all cell indices
2. Each cell picks a random neighbor → `proposals[]`
3. Greedy pairing: both must be untaken → run BFF pair
4. Background mutation via geometric skip

### Performance notes

- `xorshift32` used in hot path (not `Math.random()`)
- `scratch` pre-allocated in `SoupState`, reused per pair
- `seekMatch` iterative — safe for deep nesting
- Browser page runs simulation inside `sim-worker.js` so paper defaults do not block the UI

### Python reference

`artificial-life/main.py` — Numba-accelerated version. Semantic baseline for the browser implementation.
Key difference: Python uses `prange` parallelism; JS is single-threaded.
