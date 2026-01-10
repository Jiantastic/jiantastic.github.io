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
  const cached = localStorage.getItem(cacheKey(qualifier));
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch (error) {
    return null;
  }
};

const setCachedPrediction = (qualifier, data) => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(cacheKey(qualifier), JSON.stringify(data));
};

const clearViewer = () => {
  if (viewer) {
    viewer.clear();
    viewer.render();
  }
};

const initViewer = () => {
  if (!dom.viewer) return;
  if (!window.WebGLRenderingContext) {
    dom.viewer.classList.add("fallback");
    dom.viewer.textContent = "WebGL not available. Viewer disabled.";
    setStatus("WebGL not available. Viewer disabled.", true);
    return;
  }
  viewer = $3Dmol.createViewer(dom.viewer, { backgroundColor: "white" });
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
  const response = await fetch(modelSource.url);
  if (!response.ok) {
    throw new Error("Unable to download model file.");
  }

  const data = await response.text();
  clearViewer();

  if (!viewer) return;
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
  return model?.uniprotId || model?.entryId || qualifier || "—";
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
    dom.avgPlddt.textContent = model.globalMetricValue
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
  const response = await fetch(`${API_BASE}/uniprot/summary/${qualifier}.json`);
  if (!response.ok) return null;
  return response.json();
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

  const response = await fetch(`${API_BASE}/prediction/${qualifier}`);
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

const resolveSequence = async (sequence) => {
  setStatus("Resolving sequence...");
  const url = `${API_BASE}/sequence/summary?id=${encodeURIComponent(
    normalizeSequence(sequence)
  )}&type=sequence`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Sequence lookup failed.");
  }
  const data = await response.json();
  const match = data?.results?.[0] || data?.entries?.[0] || data?.[0];
  if (!match) {
    throw new Error("No UniProt match found for sequence.");
  }
  return match.uniprotId || match.uniprotAccession || match.entryId || match.id;
};

const handleUniProtSearch = async (id) => {
  if (!id) {
    setStatus("Enter a UniProt ID.", true);
    return;
  }
  try {
    await fetchPrediction(id.trim());
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildConfidenceBars,
    colorForPlddt,
    getModelSource,
    normalizeSequence,
  };
}
