const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.getElementById("site-nav-links");

function setNavigation(open) {
  if (!navToggle || !navLinks) return;
  navToggle.setAttribute("aria-expanded", String(open));
  navLinks.classList.toggle("is-open", open);
}

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    setNavigation(navToggle.getAttribute("aria-expanded") !== "true");
  });

  navLinks.addEventListener("click", (event) => {
    if (event.target.closest("a")) setNavigation(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setNavigation(false);
      navToggle.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) setNavigation(false);
  });
}
