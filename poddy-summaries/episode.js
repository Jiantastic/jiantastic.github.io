const audio = document.getElementById("episode-audio");

if (audio) {
  document.querySelectorAll("[data-seek]").forEach((control) => {
    control.addEventListener("click", () => {
      const seconds = Number(control.dataset.seek);
      if (!Number.isFinite(seconds) || seconds < 0) return;
      const seek = () => {
        audio.currentTime = seconds;
        audio.play().catch(() => {});
        audio.scrollIntoView({ behavior: "smooth", block: "center" });
      };
      if (audio.readyState === 0) {
        audio.addEventListener("loadedmetadata", seek, { once: true });
        audio.load();
      } else {
        seek();
      }
    });
  });
}
