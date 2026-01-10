# AlphaFold Educational Viewer - Build Plan

## Goal
Create a public, web-only learning tool that lets anyone:
- Look up AlphaFold DB predictions (read-only).
- View 3D structures in the browser.
- Understand confidence and uncertainty (pLDDT and PAE).
- Learn core ideas from the AlphaFold papers with simple explanations.

## Constraints
- Read-only AlphaFold DB API only. No folding of new sequences.
- No local software installs for users.
- Static hosting (GitHub Pages) preferred.
- Attribution required for AlphaFold DB data (CC-BY-4.0).

## API Research (from https://alphafold.ebi.ac.uk/api-docs and /api/openapi.json)
Base:
- https://alphafold.ebi.ac.uk/api

Documented endpoints:
- GET /prediction/{qualifier}
  - qualifier: UniProt accession (optional query: sequence_checksum)
  - key fields: pdbUrl, cifUrl, bcifUrl, paeImageUrl, paeDocUrl, msaUrl,
    globalMetricValue, fractionPlddtVeryLow/Low/Confident/VeryHigh
- GET /uniprot/summary/{qualifier}.json
  - qualifier: UniProt accession, entry name, or MD5 checksum
- GET /sequence/summary?id=...&type=sequence
  - id: sequence (or other supported id types)
- GET /annotations/{qualifier}.json?type=...
  - qualifier: UniProt accession, type: AnnotationType

## Plan

## Plan Critique (What’s Missing for Laypeople)
- No explicit learning outcomes or glossary to ensure a non-expert can follow.
- No visualization decision criteria (Mol* vs 3Dmol.js) tied to teaching goals.
- PAE handling is only static; lacks an interactive explanation/overlay.
- Annotation overlay is mentioned but not mapped to a UI behavior.
- No guided “first model” walkthrough to teach how to read the viewer.
- No accessibility or fallback UX (no-WebGL, small screens, slow networks).
- API examples are not shown as copy-pasteable URLs for novices.

### Phase 1 - Audience and Learning Outcomes (Web-first)
- Define learner profile: high-school biology to curious adults.
- Write 5–7 learning outcomes (10-minute understanding checklist).
- Add a short glossary: protein, amino acid, folding, structure, confidence.
- Clarify scope: teach protein folding basics + AlphaFold prediction context.
- Decide misconceptions to address ("prediction is not simulation").

### Phase 2 - Web-only Architecture and Visualization Stack
- Single-page app, no backend; all calls from browser to AlphaFold API.
- Choose viewer via decision matrix:
  - Must: mmCIF/bCIF support, confidence coloring, fast WebGL.
  - Nice-to-have: interactive PAE and annotation overlays.
- Initial implementation: 3Dmol.js with AlphaFold PDB files for confidence coloring.
- Model format strategy: prefer mmCIF (or bCIF), fallback to PDB.
- Define layout:
  - Left: search + examples
  - Center: 3D viewer
  - Right: confidence + PAE panels
- Add accessibility and fallback:
  - No WebGL -> static image + text explanation.
  - Small screen -> simplified “lite” view with fewer panels.

### Phase 3 - API Flow + Web Examples (No installs)
- Define lookup flows:
  - UniProt ID -> /prediction/{qualifier} -> model URLs -> viewer.
  - Sequence -> /sequence/summary -> UniProt -> /prediction.
- Provide copy-pasteable API URL examples and show expected JSON fields.
- Cache API responses in memory and localStorage for fast repeat views.
- Add error states with plain-language recovery steps.

### Phase 4 - MVP Build (Educational-first)
- Search page with:
  - UniProt ID and sequence input.
  - Example IDs + “Start here” button.
- Implement API client:
  - /prediction/{qualifier} for model URLs and confidence stats.
  - /sequence/summary for sequence input resolution.
- 3D view:
  - Load mmCIF/bCIF (fallback to PDB) into viewer.
  - Default color by confidence; provide pLDDT legend with tooltips.
- PAE view:
  - Display paeImageUrl + optional interactive PAE if paeDocUrl exists.

### Phase 5 - Learning Walkthrough + Content
- Guided “first model” walkthrough:
  - Step 1: what you’re seeing (structure, domains).
  - Step 2: color = confidence (pLDDT).
  - Step 3: PAE = uncertainty between regions.
  - Step 4: limitations and disorder regions.
- Add 2–3 curated example proteins with short narratives.
- Provide short, plain-language explainers:
  - Protein folding basics.
  - What AlphaFold predicts and what it does not.
  - How to read pLDDT and PAE.
- Add “About the data” section with attribution and license details.

### Phase 6 - QA and Launch
- Test on desktop and mobile (touch rotation, zoom, layout).
- Validate performance on large proteins (lazy loading, progress states).
- Deploy on GitHub Pages.
- Add feedback link for new examples and improvements.

## Open Questions
- Preferred 3D viewer: 3Dmol.js vs Mol*?
- Should we support only UniProt IDs, or also gene names via a separate search?
- Do you want a single-page app or multi-page educational flow?

## Local Preview
- Open `index.html` in a browser (no build step required).

## Tests
- Run `node app.test.js`.
