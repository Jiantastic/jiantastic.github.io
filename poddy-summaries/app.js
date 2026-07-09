const DATA_BASE = "./data/acquired";
const TRANSCRIPT_PAGE_SIZE = 120;

const state = {
  episodes: [],
  current: null,
  transcriptSegments: [],
  transcriptLoadedSlug: "",
  transcriptLimit: TRANSCRIPT_PAGE_SIZE,
  activeTab: "overview",
};

const dom = {};

function parseTimestamp(timestamp) {
  const parts = String(timestamp).trim().split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (parts.at(-1) >= 60 || (parts.length === 3 && parts[1] >= 60)) return null;
  return parts.length === 2
    ? parts[0] * 60 + parts[1]
    : parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function formatTimestamp(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "Duration unavailable";
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} hr ${minutes} min` : `${minutes} min`;
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

function initDom() {
  for (const [key, id] of Object.entries({
    select: "episode-select",
    title: "episode-title",
    date: "episode-date",
    duration: "episode-duration",
    overview: "summary-overview",
    takeaways: "takeaway-list",
    chapters: "chapter-list",
    audio: "audio-player",
    audioTitle: "audio-title",
    audioStatus: "audio-status",
    play: "play-toggle",
    skipBack: "skip-back",
    skipForward: "skip-forward",
    progress: "audio-progress",
    currentTime: "audio-current",
    totalTime: "audio-total",
    rate: "playback-rate",
    transcriptBox: "transcript-box",
    transcriptSearch: "transcript-search",
    transcriptStatus: "transcript-status",
    transcriptMore: "transcript-more",
  })) dom[key] = document.getElementById(id);
}

async function loadEpisodes() {
  try {
    const response = await fetch(`${DATA_BASE}/episodes.json`, { cache: "no-cache" });
    if (!response.ok) throw new Error("Episode guide unavailable.");
    const data = await response.json();
    state.episodes = Array.isArray(data) ? data : [];
    renderSelect();
    if (state.episodes.length) setEpisode(state.episodes[0].slug);
    else dom.title.textContent = "No episodes yet";
  } catch (error) {
    dom.title.textContent = "Unable to load episodes";
    dom.audioStatus.textContent = error.message;
  }
}

function renderSelect() {
  dom.select.replaceChildren();
  if (!state.episodes.length) {
    const option = document.createElement("option");
    option.textContent = "No episodes available";
    dom.select.appendChild(option);
    dom.select.disabled = true;
    return;
  }
  state.episodes.forEach((episode) => {
    const option = document.createElement("option");
    option.value = episode.slug;
    option.textContent = episode.title;
    dom.select.appendChild(option);
  });
  dom.select.disabled = false;
}

function setEpisode(slug) {
  const episode = state.episodes.find((item) => item.slug === slug);
  if (!episode) return;
  state.current = episode;
  state.transcriptSegments = [];
  state.transcriptLoadedSlug = "";
  state.transcriptLimit = TRANSCRIPT_PAGE_SIZE;
  dom.select.value = episode.slug;
  dom.title.textContent = episode.title;
  dom.date.textContent = formatEpisodeDate(episode.pubDate);
  dom.duration.textContent = formatDuration(episode.duration);
  dom.audioTitle.textContent = episode.title;
  dom.audio.pause();
  dom.audio.src = episode.audioUrl || "";
  dom.audio.load();
  dom.audioStatus.textContent = "";
  dom.currentTime.textContent = "0:00";
  dom.totalTime.textContent = formatTimestamp(episode.duration);
  dom.progress.value = "0";
  updatePlayButton();
  renderOverview(episode);
  renderChapters(episode);
  dom.transcriptBox.replaceChildren();
  dom.transcriptSearch.value = "";
  dom.transcriptStatus.textContent = "Open this tab to load the transcript.";
  dom.transcriptMore.hidden = true;
  if (state.activeTab === "transcript") loadTranscript(episode);

  if ("mediaSession" in navigator && "MediaMetadata" in window) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: episode.title,
      artist: "Acquired",
      album: "Poddy Summaries",
    });
  }
}

function renderOverview(episode) {
  dom.overview.textContent = episode.overview || "A chaptered guide is not available for this episode yet.";
  dom.takeaways.replaceChildren();
  const takeaways = Array.isArray(episode.takeaways) ? episode.takeaways : [];
  takeaways.forEach((takeaway) => {
    const item = document.createElement("li");
    item.textContent = takeaway;
    dom.takeaways.appendChild(item);
  });
}

function renderChapters(episode) {
  dom.chapters.replaceChildren();
  const chapters = Array.isArray(episode.chapters) && episode.chapters.length
    ? episode.chapters
    : episode.bullets || [];
  chapters.forEach((chapter, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const time = document.createElement("span");
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    const summary = document.createElement("span");
    const quote = document.createElement("q");
    button.type = "button";
    button.className = "chapter-card";
    button.setAttribute("aria-label", `Play chapter ${index + 1}, ${chapter.title || chapter.fact}, from ${chapter.timestamp}`);
    button.addEventListener("click", () => playFrom(chapter.timestamp));
    time.className = "chapter-time";
    time.textContent = chapter.timestamp || "0:00";
    copy.className = "chapter-copy";
    title.textContent = chapter.title || chapter.fact || `Chapter ${index + 1}`;
    summary.textContent = chapter.summary || "";
    quote.textContent = chapter.quote || "";
    copy.append(title, summary);
    if (chapter.quote) copy.appendChild(quote);
    button.append(time, copy);
    item.appendChild(button);
    dom.chapters.appendChild(item);
  });
}

function updatePlayButton() {
  const playing = !dom.audio.paused && !dom.audio.ended;
  dom.play.textContent = playing ? "❚❚" : "▶";
  dom.play.setAttribute("aria-label", playing ? "Pause episode" : "Play episode");
  document.querySelector(".audio-pulse")?.classList.toggle("is-playing", playing);
}

function updateTimeline() {
  const duration = Number.isFinite(dom.audio.duration) ? dom.audio.duration : Number(state.current?.duration) || 0;
  const current = Number.isFinite(dom.audio.currentTime) ? dom.audio.currentTime : 0;
  dom.currentTime.textContent = formatTimestamp(current);
  dom.totalTime.textContent = formatTimestamp(duration);
  if (Number.isFinite(dom.audio.duration) && dom.audio.duration > 0) {
    dom.duration.textContent = formatDuration(dom.audio.duration);
  }
  dom.progress.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : "0";
}

function playFrom(timestamp) {
  const seconds = typeof timestamp === "number" ? timestamp : parseTimestamp(timestamp);
  if (seconds === null || !Number.isFinite(seconds)) return;
  const start = () => {
    dom.audio.currentTime = seconds;
    dom.audio.play().catch(() => {
      dom.audioStatus.textContent = "Press play to start audio on this device.";
    });
    updateTimeline();
  };
  if (dom.audio.readyState === 0) {
    dom.audio.addEventListener("loadedmetadata", start, { once: true });
    dom.audio.load();
  } else start();
}

function activateTab(target) {
  state.activeTab = target;
  const tabs = [...document.querySelectorAll(".poddy-page .tab")];
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
  if (target === "transcript" && state.current && state.transcriptLoadedSlug !== state.current.slug) {
    loadTranscript(state.current);
  }
}

async function loadTranscript(episode) {
  state.transcriptLoadedSlug = episode.slug;
  dom.transcriptStatus.textContent = "Loading timestamped transcript…";
  try {
    const path = episode.transcriptJsonPath || episode.transcriptPath?.replace(/\.txt$/, ".json");
    const response = await fetch(`${DATA_BASE}/${path}`, { cache: "force-cache" });
    if (!response.ok) throw new Error("Transcript fetch failed.");
    const data = await response.json();
    if (state.current?.slug !== episode.slug) return;
    state.transcriptSegments = Array.isArray(data.segments) ? data.segments : [];
    state.transcriptLimit = TRANSCRIPT_PAGE_SIZE;
    renderTranscript();
  } catch (error) {
    state.transcriptLoadedSlug = "";
    state.transcriptSegments = [];
    dom.transcriptStatus.textContent = "Transcript unavailable.";
  }
}

function renderTranscript() {
  const query = dom.transcriptSearch.value.trim().toLocaleLowerCase();
  const matches = query
    ? state.transcriptSegments.filter((segment) => segment.text?.toLocaleLowerCase().includes(query))
    : state.transcriptSegments;
  const visible = matches.slice(0, state.transcriptLimit);
  const fragment = document.createDocumentFragment();
  visible.forEach((segment) => {
    const row = document.createElement("article");
    const time = document.createElement("button");
    const text = document.createElement("p");
    row.className = "transcript-segment";
    time.type = "button";
    time.textContent = formatTimestamp(segment.start);
    time.setAttribute("aria-label", `Play from ${formatTimestamp(segment.start)}`);
    time.addEventListener("click", () => playFrom(Number(segment.start)));
    text.textContent = segment.text?.trim() || "";
    row.append(time, text);
    fragment.appendChild(row);
  });
  dom.transcriptBox.replaceChildren(fragment);
  dom.transcriptStatus.textContent = matches.length
    ? `Showing ${visible.length.toLocaleString()} of ${matches.length.toLocaleString()} transcript segments.`
    : `No transcript results for “${dom.transcriptSearch.value.trim()}”.`;
  dom.transcriptMore.hidden = visible.length >= matches.length;
}

function bindEvents() {
  dom.select.addEventListener("change", (event) => setEpisode(event.target.value));
  dom.play.addEventListener("click", () => {
    if (dom.audio.paused) dom.audio.play().catch(() => { dom.audioStatus.textContent = "Audio could not start. Try again."; });
    else dom.audio.pause();
  });
  dom.skipBack.addEventListener("click", () => { dom.audio.currentTime = Math.max(0, dom.audio.currentTime - 15); });
  dom.skipForward.addEventListener("click", () => { dom.audio.currentTime = Math.min(dom.audio.duration || Infinity, dom.audio.currentTime + 15); });
  dom.progress.addEventListener("input", () => {
    if (Number.isFinite(dom.audio.duration)) dom.audio.currentTime = (Number(dom.progress.value) / 1000) * dom.audio.duration;
  });
  dom.rate.addEventListener("change", () => { dom.audio.playbackRate = Number(dom.rate.value); });
  dom.audio.addEventListener("play", updatePlayButton);
  dom.audio.addEventListener("pause", updatePlayButton);
  dom.audio.addEventListener("ended", updatePlayButton);
  dom.audio.addEventListener("timeupdate", updateTimeline);
  dom.audio.addEventListener("loadedmetadata", updateTimeline);
  dom.audio.addEventListener("error", () => { dom.audioStatus.textContent = "The source audio is temporarily unavailable."; });

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
  dom.transcriptSearch.addEventListener("input", () => {
    state.transcriptLimit = TRANSCRIPT_PAGE_SIZE;
    renderTranscript();
  });
  dom.transcriptMore.addEventListener("click", () => {
    state.transcriptLimit += TRANSCRIPT_PAGE_SIZE;
    renderTranscript();
  });

  if ("mediaSession" in navigator) {
    const setMediaAction = (action, handler) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch (error) { /* Unsupported action on this browser. */ }
    };
    setMediaAction("play", () => dom.audio.play());
    setMediaAction("pause", () => dom.audio.pause());
    setMediaAction("seekbackward", () => { dom.audio.currentTime = Math.max(0, dom.audio.currentTime - 15); });
    setMediaAction("seekforward", () => { dom.audio.currentTime = Math.min(dom.audio.duration || Infinity, dom.audio.currentTime + 15); });
  }
}

function initApp() {
  initDom();
  if (Object.values(dom).some((element) => !element)) return;
  bindEvents();
  activateTab("overview");
  loadEpisodes();
}

if (typeof document !== "undefined") initApp();

export { formatDuration, formatEpisodeDate, formatTimestamp, parseTimestamp };
