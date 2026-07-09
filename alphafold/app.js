const API_BASE = "https://alphafold.ebi.ac.uk/api";
const COLOR_BANDS = {
  veryHigh: "#1f77b4",
  confident: "#76b7b2",
  low: "#f1ce63",
  veryLow: "#e07b39",
};

const dom = {};
let viewer = null;

const colorForPlddt = (value) => {
  if (value >= 90) return COLOR_BANDS.veryHigh;
  if (value >= 70) return COLOR_BANDS.confident;
  if (value >= 50) return COLOR_BANDS.low;
  return COLOR_BANDS.veryLow;
};

const normalizeSequence = (sequence) => sequence.replace(/\s+/g, "").toUpperCase();

const getModelSource = (model) => {
  if (model?.pdbUrl) return { url: model.pdbUrl, format: "pdb" };
  if (model?.cifUrl) return { url: model.cifUrl, format: "cif" };
  return null;
};

const buildConfidenceBars = (model) => [
  { label: "Very high", fraction: model?.fractionPlddtVeryHigh ?? 0, color: COLOR_BANDS.veryHigh },
  { label: "Confident", fraction: model?.fractionPlddtConfident ?? 0, color: COLOR_BANDS.confident },
  { label: "Low", fraction: model?.fractionPlddtLow ?? 0, color: COLOR_BANDS.low },
  { label: "Very low", fraction: model?.fractionPlddtVeryLow ?? 0, color: COLOR_BANDS.veryLow },
];

const formatPercent = (fraction) => `${Math.round((fraction || 0) * 100)}%`;

const setStatus = (message, isError = false) => {
  if (!dom.status) return;
  dom.status.textContent = message;
  dom.status.style.color = isError ? "#b91c1c" : "";
};

const cacheKey = (qualifier) => `alphafold-prediction:${qualifier}`;

const getCachedPrediction = (qualifier) => {
  if (typeof localStorage === "undefined") return null;
  let cached;
  try {
    cached = localStorage.getItem(cacheKey(qualifier));
  } catch (error) {
    return null;
  }
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch (error) {
    return null;
  }
};

const setCachedPrediction = (qualifier, data) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(cacheKey(qualifier), JSON.stringify(data));
  } catch (error) {
    // Storage may be disabled or full; the live request still succeeded.
  }
};

const clearViewer = () => {
  if (viewer) {
    viewer.clear();
    viewer.render();
  }
};

const initViewer = () => {
  if (!dom.viewer) return;
  if (!window.WebGLRenderingContext || !window.$3Dmol) {
    dom.viewer.classList.add("fallback");
    dom.viewer.textContent = "The 3D viewer is unavailable on this device.";
    setStatus("The 3D viewer is unavailable; model details are still available.", true);
    return;
  }
  viewer = window.$3Dmol.createViewer(dom.viewer, { backgroundColor: "#f7f2dd" });
};

const updateConfidenceBars = (model) => {
  if (!dom.bars) return;
  const bars = buildConfidenceBars(model);
  dom.bars.innerHTML = "";
  bars.forEach((bar) => {
    const row = document.createElement("div");
    row.className = "bar";
    const label = document.createElement("span");
    label.textContent = `${bar.label} (${formatPercent(bar.fraction)})`;
    const fill = document.createElement("div");
    fill.className = "fill";
    fill.style.setProperty("--value", `${(bar.fraction || 0) * 100}%`);
    fill.style.setProperty("--color", bar.color);
    row.appendChild(label);
    row.appendChild(fill);
    dom.bars.appendChild(row);
  });
};

const applyModelLinks = (modelSource) => {
  if (!dom.modelLink) return;
  dom.modelLink.textContent = modelSource?.url || "—";
  dom.modelLink.href = modelSource?.url || "#";
};

const loadModel = async (model) => {
  const modelSource = getModelSource(model);
  if (!modelSource) {
    throw new Error("No compatible model file available (PDB/mmCIF).");
  }

  applyModelLinks(modelSource);
  if (!viewer) return;
  const response = await fetch(modelSource.url);
  if (!response.ok) {
    throw new Error("Unable to download model file.");
  }

  const data = await response.text();
  clearViewer();

  viewer.addModel(data, modelSource.format);
  viewer.setStyle({}, {
    cartoon: {
      colorfunc: (atom) => colorForPlddt(atom.b || 0),
    },
  });
  viewer.zoomTo();
  viewer.render();
};

const getProteinName = (model, summary) => {
  return (
    model?.uniprotDescription ||
    summary?.proteinName ||
    summary?.entryName ||
    summary?.uniprotDescription ||
    "—"
  );
};

const getUniProtId = (model, qualifier) => {
  return model?.uniprotAccession || model?.uniprotId || qualifier || "—";
};

const getSequenceLength = (model, summary) => {
  return (
    model?.sequence?.length ||
    summary?.sequenceLength ||
    summary?.sequence?.length ||
    "—"
  );
};

const getSummaryQualifier = (model, qualifier) => {
  return (
    model?.uniprotAccession ||
    model?.entryId ||
    qualifier
  );
};

const updatePanels = (model, summary, qualifier) => {
  if (!model) return;
  if (dom.uniprotId) dom.uniprotId.textContent = getUniProtId(model, qualifier);
  if (dom.proteinName) dom.proteinName.textContent = getProteinName(model, summary);
  if (dom.avgPlddt) {
    dom.avgPlddt.textContent = Number.isFinite(model.globalMetricValue)
      ? model.globalMetricValue.toFixed(1)
      : "—";
  }
  if (dom.sequenceLength) dom.sequenceLength.textContent = getSequenceLength(model, summary);
  if (dom.paeImage) {
    dom.paeImage.src = model.paeImageUrl || "";
    dom.paeImage.style.display = model.paeImageUrl ? "block" : "none";
  }
  updateConfidenceBars(model);
};

const fetchSummary = async (qualifier) => {
  if (!qualifier) return null;
  try {
    const response = await fetch(`${API_BASE}/uniprot/summary/${encodeURIComponent(qualifier)}.json`);
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    return null;
  }
};

const fetchPrediction = async (qualifier) => {
  setStatus("Loading prediction...");
  const cached = getCachedPrediction(qualifier);
  if (cached) {
    updatePanels(cached, null, qualifier);
    await loadModel(cached);
    const summary = await fetchSummary(getSummaryQualifier(cached, qualifier));
    if (summary) {
      updatePanels(cached, summary, qualifier);
    }
    setStatus("Loaded cached model.");
    return;
  }

  const response = await fetch(`${API_BASE}/prediction/${encodeURIComponent(qualifier)}`);
  if (!response.ok) {
    throw new Error("Prediction not found.");
  }
  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("No prediction returned for that ID.");
  }
  const model = data[0];
  setCachedPrediction(qualifier, model);
  updatePanels(model, null, qualifier);
  await loadModel(model);
  const summary = await fetchSummary(getSummaryQualifier(model, qualifier));
  if (summary) {
    updatePanels(model, summary, qualifier);
  }
  setStatus("Loaded model successfully.");
};

const getSequenceMatchId = (data) => {
  const directMatch = data?.results?.[0] || data?.entries?.[0] || data?.[0];
  const directId =
    directMatch?.uniprotId ||
    directMatch?.uniprotAccession ||
    directMatch?.entryId ||
    directMatch?.id;
  if (directId) return directId;

  const monomer = data?.structures?.find(
    (structure) => structure?.summary?.oligomeric_state === "MONOMER",
  );
  const firstStructure = monomer || data?.structures?.[0];
  return firstStructure?.summary?.entities?.find(
    (entity) => entity?.identifier_category === "UNIPROT",
  )?.identifier || null;
};

const resolveSequence = async (sequence) => {
  setStatus("Resolving sequence...");
  const normalized = normalizeSequence(sequence);
  if (normalized.length < 20 || !/^[ACDEFGHIKLMNPQRSTVWY]+$/.test(normalized)) {
    throw new Error("Use at least 20 standard amino-acid letters.");
  }
  const url = `${API_BASE}/sequence/summary?id=${encodeURIComponent(
    normalized
  )}&type=sequence`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Sequence lookup failed.");
  }
  const data = await response.json();
  const id = getSequenceMatchId(data);
  if (!id) {
    throw new Error("No UniProt match found for sequence.");
  }
  return id;
};

const handleUniProtSearch = async (id) => {
  if (!id) {
    setStatus("Enter a UniProt ID.", true);
    return;
  }
  try {
    await fetchPrediction(id.trim().toUpperCase());
  } catch (error) {
    setStatus(error.message, true);
  }
};

const handleSequenceSearch = async (sequence) => {
  if (!sequence) {
    setStatus("Paste a sequence to search.", true);
    return;
  }
  try {
    const id = await resolveSequence(sequence);
    await fetchPrediction(id);
  } catch (error) {
    setStatus(error.message, true);
  }
};

const bindEvents = () => {
  if (!dom.uniprotSearch) return;
  dom.uniprotSearch.addEventListener("click", () => {
    handleUniProtSearch(dom.uniprotInput.value);
  });

  dom.uniprotInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handleUniProtSearch(dom.uniprotInput.value);
  });

  dom.sequenceSearch.addEventListener("click", () => {
    handleSequenceSearch(dom.sequenceInput.value);
  });

  document.querySelectorAll(".example").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      dom.uniprotInput.value = id;
      handleUniProtSearch(id);
    });
  });
};

const initDom = () => {
  dom.status = document.getElementById("status");
  dom.avgPlddt = document.getElementById("avg-plddt");
  dom.sequenceLength = document.getElementById("sequence-length");
  dom.modelLink = document.getElementById("model-link");
  dom.paeImage = document.getElementById("pae-image");
  dom.bars = document.getElementById("plddt-bars");
  dom.viewer = document.getElementById("viewer");
  dom.uniprotId = document.getElementById("uniprot-id");
  dom.proteinName = document.getElementById("protein-name");
  dom.uniprotInput = document.getElementById("uniprot-input");
  dom.sequenceInput = document.getElementById("sequence-input");
  dom.uniprotSearch = document.getElementById("uniprot-search");
  dom.sequenceSearch = document.getElementById("sequence-search");
};

const initApp = () => {
  initDom();
  initViewer();
  bindEvents();

  const defaultId = "P69905";
  if (dom.uniprotInput) {
    dom.uniprotInput.value = defaultId;
    setStatus("Loading default model...");
    handleUniProtSearch(defaultId);
  }
};

if (typeof document !== "undefined") {
  initApp();
}

export {
  buildConfidenceBars,
  colorForPlddt,
  formatPercent,
  getModelSource,
  getSequenceMatchId,
  getUniProtId,
  normalizeSequence,
};
