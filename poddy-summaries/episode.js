const audio = document.getElementById("audio-player");

function formatTimestamp(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

if (audio) {
  const deck = audio.closest(".audio-deck");
  const play = document.getElementById("play-toggle");
  const skipBack = document.getElementById("skip-back");
  const skipForward = document.getElementById("skip-forward");
  const progress = document.getElementById("audio-progress");
  const currentTime = document.getElementById("audio-current");
  const totalTime = document.getElementById("audio-total");
  const rate = document.getElementById("playback-rate");
  const status = document.getElementById("audio-status");

  const updatePlayButton = () => {
    const playing = !audio.paused && !audio.ended;
    play.textContent = playing ? "❚❚" : "▶";
    play.setAttribute("aria-label", playing ? "Pause episode" : "Play episode");
    deck.querySelector(".audio-pulse")?.classList.toggle("is-playing", playing);
  };

  const updateTimeline = () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    currentTime.textContent = formatTimestamp(current);
    if (duration > 0) totalTime.textContent = formatTimestamp(duration);
    progress.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : "0";
  };

  const startAudio = () => audio.play().catch(() => {
    status.textContent = "Audio could not start. Try again.";
  });

  const seekTo = (seconds, shouldPlay = true) => {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    const seek = () => {
      audio.currentTime = seconds;
      updateTimeline();
      if (shouldPlay) startAudio();
      deck.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    if (audio.readyState === 0) {
      audio.addEventListener("loadedmetadata", seek, { once: true });
      audio.load();
    } else seek();
  };

  play.addEventListener("click", () => {
    status.textContent = "";
    if (audio.paused) startAudio();
    else audio.pause();
  });
  skipBack.addEventListener("click", () => seekTo(Math.max(0, audio.currentTime - 15), false));
  skipForward.addEventListener("click", () => seekTo(Math.min(audio.duration || Infinity, audio.currentTime + 15), false));
  progress.addEventListener("input", () => {
    if (Number.isFinite(audio.duration)) seekTo((Number(progress.value) / 1000) * audio.duration, false);
  });
  rate.addEventListener("change", () => { audio.playbackRate = Number(rate.value); });
  audio.addEventListener("play", updatePlayButton);
  audio.addEventListener("pause", updatePlayButton);
  audio.addEventListener("ended", updatePlayButton);
  audio.addEventListener("timeupdate", updateTimeline);
  audio.addEventListener("loadedmetadata", updateTimeline);
  audio.addEventListener("error", () => { status.textContent = "The source audio is temporarily unavailable."; });

  document.querySelectorAll("[data-seek]").forEach((control) => {
    control.addEventListener("click", () => seekTo(Number(control.dataset.seek)));
  });

  if ("mediaSession" in navigator) {
    const setMediaAction = (action, handler) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch (error) { /* Unsupported action. */ }
    };
    setMediaAction("play", startAudio);
    setMediaAction("pause", () => audio.pause());
    setMediaAction("seekbackward", () => seekTo(Math.max(0, audio.currentTime - 15), false));
    setMediaAction("seekforward", () => seekTo(Math.min(audio.duration || Infinity, audio.currentTime + 15), false));
  }

  updatePlayButton();
}
