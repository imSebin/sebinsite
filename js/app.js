import { Brain, REGIONS } from "./brain.js";

const PAGES = new Set(["about", "ai", "projects", "career", "contact"]);

const body = document.body;
const navbar = document.getElementById("navbar");
const hotzone = document.getElementById("nav-hotzone");
const logoHit = document.getElementById("logo-hit");
const toast = document.getElementById("region-toast");
const canvas = document.getElementById("brain");
const stage = document.getElementById("stage");
const regionHits = [...document.querySelectorAll("#region-hits button")];
const navLinks = [...document.querySelectorAll(".nav-links a")];

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function routeFromHash() {
  const raw = (location.hash || "#/").replace(/^#\/?/, "").split("/")[0];
  if (!raw) return "home";
  return PAGES.has(raw) ? raw : "home";
}

const brain = new Brain(canvas, {
  getLogoRect: () => logoHit.getBoundingClientRect(),
  onNavigate: (id) => {
    location.hash = `#/${id}`;
  },
  onHoverRegion: (id) => {
    if (!id || routeFromHash() !== "home") {
      toast.classList.remove("is-on");
      toast.textContent = "";
      return;
    }
    const region = REGIONS.find((r) => r.id === id);
    toast.textContent = region?.label || "";
    toast.style.color = region?.color || "#fff";
    toast.classList.add("is-on");
  },
  onFrame: (view) => {
    if (!reduced) {
      stage.style.opacity = routeFromHash() === "home"
        ? "0"
        : String(Math.min(1, (1 - view.label) * 1.45));
    }
    if (routeFromHash() !== "home" || view.label < 0.2) {
      regionHits.forEach((btn) => {
        btn.style.opacity = "0";
        btn.style.pointerEvents = "none";
      });
      return;
    }
    regionHits.forEach((btn) => {
      const region = REGIONS.find((r) => r.id === btn.dataset.page);
      if (!region) return;
      const x = view.x + region.x * view.unit;
      const y = view.y + region.y * view.unit;
      const size = Math.max(88, view.unit * 0.42);
      btn.style.width = `${size}px`;
      btn.style.height = `${size}px`;
      btn.style.left = `${x}px`;
      btn.style.top = `${y}px`;
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
    });
  },
});

function applyRoute(route, { immediate = false } = {}) {
  const isHome = route === "home";
  body.classList.toggle("is-home", isHome);
  if (isHome) navbar.classList.remove("is-revealed");
  brain.setHome(isHome, { immediate });
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("is-active", page.id === `page-${route}`);
  });
  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.page === route);
  });
  if (!isHome) {
    toast.classList.remove("is-on");
    window.scrollTo({ top: 0, behavior: reduced || immediate ? "auto" : "smooth" });
  }
  document.title = isHome
    ? "Sebin Im — Interesting Endeavours"
    : `${REGIONS.find((r) => r.id === route)?.label || "Sebin"} — Sebin Im`;
}

let lastY = 0;
function syncNavReveal(clientY) {
  lastY = clientY;
  if (routeFromHash() !== "home") return;
  const nearTop = clientY < 120;
  navbar.classList.toggle("is-revealed", nearTop);
}

window.addEventListener("hashchange", () => {
  applyRoute(routeFromHash());
});

function onPointer(event) {
  brain.setPointer(event.clientX, event.clientY, true);
  syncNavReveal(event.clientY);
}

window.addEventListener("pointermove", onPointer);
window.addEventListener("mousemove", onPointer);

window.addEventListener("pointerleave", () => {
  brain.setPointer(0, 0, false);
});

hotzone.addEventListener("pointerenter", () => {
  if (routeFromHash() === "home") navbar.classList.add("is-revealed");
});
hotzone.addEventListener("mouseenter", () => {
  if (routeFromHash() === "home") navbar.classList.add("is-revealed");
});

canvas.addEventListener("pointerdown", (event) => {
  if (routeFromHash() !== "home") return;
  brain.handleClick(event.clientX, event.clientY);
});

regionHits.forEach((btn) => {
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    if (routeFromHash() !== "home") return;
    const id = btn.dataset.page;
    const region = REGIONS.find((r) => r.id === id);
    if (!region) return;
    brain.lockedRegion = id;
    brain._burst(region);
    location.hash = `#/${id}`;
  });
  btn.addEventListener("pointerenter", () => {
    brain.hoverRegion = btn.dataset.page;
    brain.onHoverRegion?.(btn.dataset.page);
  });
});

navbar.addEventListener("pointerenter", () => {
  if (routeFromHash() === "home") navbar.classList.add("is-revealed");
});

navbar.addEventListener("pointerleave", (event) => {
  if (routeFromHash() !== "home") return;
  if (event.clientY > 88) navbar.classList.remove("is-revealed");
});

logoHit.addEventListener("click", (event) => {
  if (routeFromHash() === "home") return;
  event.preventDefault();
  location.hash = "#/";
});

const initial = routeFromHash();
applyRoute(initial, { immediate: true });
brain.start();

if (initial === "home") {
  requestAnimationFrame(() => syncNavReveal(lastY));
}
