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
    titleEl.textContent = "Unable to load episodes";
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
  dateEl.textContent = ep.pubDate || "";
  audioEl.src = ep.audioUrl || "";
  renderSummary(ep);
  loadTranscript(ep);
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
    time.addEventListener("click", () => seekTo(time.textContent));

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
  const parts = ts.split(":");
  if (parts.length !== 2) return;
  const mins = parseInt(parts[0], 10);
  const secs = parseInt(parts[1], 10);
  if (Number.isNaN(mins) || Number.isNaN(secs)) return;
  const target = mins * 60 + secs;
  if (!Number.isFinite(target)) return;
  audioEl.currentTime = target;
  audioEl.play().catch(() => {});
}

async function loadTranscript(ep) {
  transcriptBox.textContent = "Loading transcript...";
  const path = `${DATA_BASE}/${ep.transcriptPath}`;
  try {
    const res = await fetch(`${path}?ts=${Date.now()}`);
    if (!res.ok) throw new Error("Transcript fetch failed");
    const text = await res.text();
    transcriptBox.textContent = text;
  } catch (err) {
    console.error(err);
    transcriptBox.textContent = "Transcript unavailable.";
  }
}

function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      document.querySelectorAll(".tab-content").forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== `tab-${target}`);
      });
    });
  });
}

selectEl.addEventListener("change", (e) => setEpisode(e.target.value));

initTabs();
loadEpisodes();
