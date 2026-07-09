const DATA_BASE = "./data/acquired";

const state = {
  episodes: [],
  current: null,
};

const selectEl = document.getElementById("episode-select");
const titleEl = document.getElementById("episode-title");
const dateEl = document.getElementById("episode-date");
const bulletsEl = document.getElementById("bullet-list");
const summaryEmptyEl = document.getElementById("summary-empty");
const audioEl = document.getElementById("audio-player");
const transcriptBox = document.getElementById("transcript-box");
let transcriptRequest = 0;

function parseTimestamp(timestamp) {
  const parts = String(timestamp).trim().split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return null;
  }
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function formatEpisodeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(date);
}

async function loadEpisodes() {
  try {
    const res = await fetch(`${DATA_BASE}/episodes.json?ts=${Date.now()}`);
    if (!res.ok) throw new Error("Failed to fetch episodes");
    const data = await res.json();
    state.episodes = Array.isArray(data) ? data : [];
    if (state.episodes.length > 0) {
      setEpisode(state.episodes[0].slug);
    }
    renderSelect();
  } catch (err) {
    console.error(err);
    if (titleEl) titleEl.textContent = "Unable to load episodes";
  }
}

function renderSelect() {
  selectEl.innerHTML = "";
  if (state.episodes.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "No episodes yet";
    selectEl.appendChild(opt);
    selectEl.disabled = true;
    return;
  }
  selectEl.disabled = false;
  state.episodes.forEach((ep) => {
    const opt = document.createElement("option");
    opt.value = ep.slug;
    opt.textContent = ep.title;
    selectEl.appendChild(opt);
  });
  selectEl.value = state.current?.slug || state.episodes[0].slug;
}

function setEpisode(slug) {
  const ep = state.episodes.find((e) => e.slug === slug);
  if (!ep) return;
  state.current = ep;
  titleEl.textContent = ep.title;
  dateEl.textContent = formatEpisodeDate(ep.pubDate);
  audioEl.src = ep.audioUrl || "";
  renderSummary(ep);
  transcriptRequest += 1;
  transcriptBox.dataset.episode = "";
  transcriptBox.textContent = "Open the Transcript tab to load the full text.";
  if (document.querySelector('.tab[aria-selected="true"]')?.dataset.tab === "transcript") {
    loadTranscript(ep);
  }
}

function renderSummary(ep) {
  bulletsEl.innerHTML = "";
  const bullets = Array.isArray(ep.bullets) ? ep.bullets : [];
  if (bullets.length === 0) {
    summaryEmptyEl.classList.remove("hidden");
    return;
  }
  summaryEmptyEl.classList.add("hidden");
  bullets.forEach((b) => {
    const li = document.createElement("li");
    li.className = "bullet-card";

    const top = document.createElement("div");
    top.className = "bullet-top";

    const title = document.createElement("div");
    title.className = "bullet-title";
    title.textContent = b.fact || "";

    const time = document.createElement("button");
    time.className = "timestamp";
    time.type = "button";
    time.textContent = b.timestamp || "--:--";
    time.setAttribute("aria-label", `Play from ${time.textContent}`);
    time.addEventListener("click", () => {
      activateTab("audio");
      seekTo(time.textContent);
    });

    top.appendChild(title);
    top.appendChild(time);

    const quote = document.createElement("p");
    quote.className = "quote";
    const speaker = b.speaker ? `${b.speaker}: ` : "";
    quote.textContent = `${speaker}"${b.quote || ""}"`;

    li.appendChild(top);
    li.appendChild(quote);
    bulletsEl.appendChild(li);
  });
}

function seekTo(ts) {
  const target = parseTimestamp(ts);
  if (target === null) return;
  audioEl.currentTime = target;
  audioEl.play().catch(() => {});
}

async function loadTranscript(ep) {
  const requestId = ++transcriptRequest;
  transcriptBox.textContent = "Loading transcript...";
  const path = `${DATA_BASE}/${ep.transcriptPath}`;
  try {
    const res = await fetch(`${path}?ts=${Date.now()}`);
    if (!res.ok) throw new Error("Transcript fetch failed");
    const text = await res.text();
    if (requestId === transcriptRequest) {
      transcriptBox.textContent = text;
      transcriptBox.dataset.episode = ep.slug;
    }
  } catch (err) {
    console.error(err);
    if (requestId === transcriptRequest) transcriptBox.textContent = "Transcript unavailable.";
  }
}

function activateTab(target) {
  const tabs = document.querySelectorAll(".poddy-page .tab");
  tabs.forEach((tab) => {
    const active = tab.dataset.tab === target;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll(".poddy-page .tab-content").forEach((panel) => {
    const active = panel.id === `tab-${target}`;
    panel.classList.toggle("hidden", !active);
    panel.hidden = !active;
  });
  if (
    target === "transcript" &&
    state.current &&
    transcriptBox?.dataset.episode !== state.current.slug
  ) {
    loadTranscript(state.current);
  }
}

function initTabs() {
  const tabs = [...document.querySelectorAll(".poddy-page .tab")];
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab.dataset.tab));
    tab.addEventListener("keydown", (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(tabs.indexOf(tab) + direction + tabs.length) % tabs.length];
      activateTab(next.dataset.tab);
      next.focus();
    });
  });
  activateTab("summary");
}

function initApp() {
  if (!selectEl || !titleEl || !dateEl || !bulletsEl || !summaryEmptyEl || !audioEl || !transcriptBox) return;
  selectEl.addEventListener("change", (event) => setEpisode(event.target.value));
  initTabs();
  loadEpisodes();
}

initApp();

export { formatEpisodeDate, parseTimestamp };
