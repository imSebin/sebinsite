const REGIONS = [
  { id: "about", label: "About Me", x: -0.42, y: -0.46, color: "#4de8ff", kicker: "01" },
  { id: "ai", label: "AI", x: 0.42, y: -0.46, color: "#c4b5fd", kicker: "02" },
  { id: "projects", label: "Projects", x: -0.52, y: 0.18, color: "#f472b6", kicker: "03" },
  { id: "career", label: "Career", x: 0.52, y: 0.18, color: "#fbbf24", kicker: "04" },
  { id: "contact", label: "Contact", x: 0.0, y: 0.58, color: "#34d399", kicker: "05" },
];

function mulberry32(seed) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function hemisphereContains(x, y, cx) {
  const dx = x - cx;
  const dy = y - 0.02;
  const ang = Math.atan2(dy, dx);
  const wobble = 1 + 0.075 * Math.sin(ang * 7 + cx * 4) + 0.04 * Math.sin(ang * 15 + 1.2);
  const rx = 0.5 * (1 + 0.08 * Math.max(0, -dy));
  const ry = 0.76 * (1 - 0.1 * Math.max(0, dy));
  const nx = dx / (rx * wobble);
  const ny = dy / (ry * wobble);
  return nx * nx + ny * ny <= 1;
}

function inBrain(x, y) {
  const left = hemisphereContains(x, y, -0.36);
  const right = hemisphereContains(x, y, 0.36);
  const fissure = Math.abs(x) < 0.05 && y > -0.58 && y < 0.42;
  const callosum = Math.abs(x) < 0.16 && Math.abs(y - 0.04) < 0.09;
  const cerebellum = (() => {
    const dx = x / 0.28;
    const dy = (y - 0.72) / 0.16;
    return dx * dx + dy * dy <= 1;
  })();
  return ((left || right) && !fissure) || callosum || cerebellum;
}

function buildHemispherePath(cx, phase) {
  const path = new Path2D();
  const steps = 96;
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const w = 1 + 0.075 * Math.sin(a * 7 + phase) + 0.04 * Math.sin(a * 15 + 1.2);
    const rx = 0.5 * (1 + 0.08 * Math.max(0, -Math.sin(a)));
    const ry = 0.76 * (1 - 0.1 * Math.max(0, Math.sin(a)));
    const x = cx + Math.cos(a) * rx * w;
    const y = 0.02 + Math.sin(a) * ry * w;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

export class Brain {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.getLogoRect = options.getLogoRect;
    this.onNavigate = options.onNavigate;
    this.onHoverRegion = options.onHoverRegion;
    this.onFrame = options.onFrame;
    this.dpr = 1;
    this.tHome = 1;
    this.fromHome = 1;
    this.toHome = 1;
    this.animStart = 0;
    this.animDur = 980;
    this.animating = false;
    this.pointer = { x: 0, y: 0, inside: false };
    this.hoverRegion = null;
    this.lockedRegion = null;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.rand = mulberry32(20260827);
    this.nodes = [];
    this.edges = [];
    this.sparks = [];
    this.ripples = [];
    this.leftPath = buildHemispherePath(-0.36, -1.4);
    this.rightPath = buildHemispherePath(0.36, 1.1);
    this.cerebellum = new Path2D();
    this.cerebellum.ellipse(0, 0.72, 0.28, 0.16, 0, 0, Math.PI * 2);
    this.callosum = new Path2D();
    this.callosum.ellipse(0, 0.04, 0.16, 0.09, 0, 0, Math.PI * 2);
    this._buildNetwork();
    this._seedSparks(36);
    this.running = false;
    this.raf = 0;
    this.lastTs = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    this.lastTs = performance.now();
    const loop = (ts) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this._tick(ts, dt);
      this._draw(ts);
      this.onFrame?.(this._view());
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    window.addEventListener("resize", this.resize);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
  }

  resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
  };

  setHome(isHome, { immediate = false } = {}) {
    this.fromHome = this.tHome;
    this.toHome = isHome ? 1 : 0;
    if (immediate || this.reducedMotion) {
      this.tHome = this.toHome;
      this.animating = false;
      return;
    }
    this.animStart = performance.now();
    this.animating = true;
  }

  setPointer(clientX, clientY, inside) {
    this.pointer.x = clientX;
    this.pointer.y = clientY;
    this.pointer.inside = inside;
  }

  handleClick(clientX, clientY) {
    if (this.tHome < 0.55) return false;
    const local = this._screenToBrain(clientX, clientY);
    if (!local) return false;
    const region = this._pickRegion(local.x, local.y);
    if (!region) return false;
    this.lockedRegion = region.id;
    this._burst(region);
    this.onNavigate?.(region.id);
    return true;
  }

  getView() {
    return this._view();
  }

  _labelOffset(region) {
    return {
      x: region.x < -0.1 ? -0.22 : region.x > 0.1 ? 0.22 : 0,
      y: region.y < 0 ? -0.18 : 0.2,
    };
  }

  _pickRegion(bx, by) {
    let best = null;
    let bestD = 0.52;
    for (const region of REGIONS) {
      const off = this._labelOffset(region);
      const dHub = Math.hypot(bx - region.x, by - region.y);
      const dLab = Math.hypot(bx - (region.x + off.x), by - (region.y + off.y));
      const d = Math.min(dHub, dLab);
      if (d < bestD) {
        bestD = d;
        best = region;
      }
    }
    if (best) return best;
    if (this.hoverRegion) return REGIONS.find((r) => r.id === this.hoverRegion) || null;
    if (!inBrain(bx, by)) return null;
    let nearest = this.nodes[0];
    let distN = Infinity;
    for (const node of this.nodes) {
      const d = Math.hypot(node.x - bx, node.y - by);
      if (d < distN) {
        distN = d;
        nearest = node;
      }
    }
    return REGIONS.find((r) => r.id === nearest.region) || null;
  }

  _buildNetwork() {
    const rand = this.rand;
    const hubs = REGIONS.map((region) => {
      const node = {
        x: region.x,
        y: region.y,
        region: region.id,
        color: region.color,
        hub: true,
        phase: rand() * Math.PI * 2,
        radius: 0.028,
        pulse: 0.6 + rand() * 0.4,
      };
      return node;
    });

    const nodes = [...hubs];
    const minDist = 0.072;
    let attempts = 0;
    while (nodes.length < 168 && attempts < 9000) {
      attempts += 1;
      const x = (rand() * 2.2 - 1.1);
      const y = (rand() * 2.05 - 1.05);
      if (!inBrain(x, y)) continue;
      if (nodes.some((n) => Math.hypot(n.x - x, n.y - y) < minDist)) continue;
      let nearest = REGIONS[0];
      let best = Infinity;
      for (const region of REGIONS) {
        const d = Math.hypot(x - region.x, y - region.y);
        if (d < best) {
          best = d;
          nearest = region;
        }
      }
      nodes.push({
        x,
        y,
        region: nearest.id,
        color: nearest.color,
        hub: false,
        phase: rand() * Math.PI * 2,
        radius: 0.01 + rand() * 0.007,
        pulse: 0.45 + rand() * 0.55,
      });
    }

    const edges = [];
    const seen = new Set();
    const addEdge = (i, j, kind) => {
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      const key = `${a}-${b}`;
      if (seen.has(key) || a === b) return;
      seen.add(key);
      edges.push({ i: a, j: b, kind, dist: dist(nodes[a], nodes[b]) });
    };

    for (let i = 0; i < nodes.length; i += 1) {
      const scored = [];
      for (let j = 0; j < nodes.length; j += 1) {
        if (i === j) continue;
        const d = dist(nodes[i], nodes[j]);
        if (d > 0.28) continue;
        scored.push({ j, d });
      }
      scored.sort((a, b) => a.d - b.d);
      const k = nodes[i].hub ? 7 : 4;
      scored.slice(0, k).forEach((s) => addEdge(i, s.j, "local"));
    }

    for (let i = 0; i < hubs.length; i += 1) {
      for (let j = i + 1; j < hubs.length; j += 1) {
        addEdge(i, j, "hub");
      }
    }

    for (let n = 0; n < 18; n += 1) {
      addEdge((rand() * nodes.length) | 0, (rand() * nodes.length) | 0, "long");
    }

    this.nodes = nodes;
    this.edges = edges;
  }

  _seedSparks(count) {
    this.sparks = [];
    for (let i = 0; i < count; i += 1) {
      this._spawnSpark(true);
    }
  }

  _spawnSpark(randomT = false) {
    if (!this.edges.length) return;
    const edge = this.edges[(this.rand() * this.edges.length) | 0];
    const fromHub = this.nodes[edge.i].hub || this.nodes[edge.j].hub;
    this.sparks.push({
      i: edge.i,
      j: edge.j,
      t: randomT ? this.rand() : 0,
      speed: (fromHub ? 0.22 : 0.14) + this.rand() * 0.18,
      dir: this.rand() > 0.5 ? 1 : -1,
      hue: this.nodes[this.rand() > 0.5 ? edge.i : edge.j].color,
    });
  }

  _burst(region) {
    const hubIndex = this.nodes.findIndex((n) => n.hub && n.region === region.id);
    if (hubIndex < 0) return;
    this.ripples.push({ i: hubIndex, t: 0, color: region.color });
    for (let n = 0; n < 14; n += 1) {
      const neighbors = this.edges.filter((e) => e.i === hubIndex || e.j === hubIndex);
      const edge = neighbors[(this.rand() * neighbors.length) | 0];
      if (!edge) continue;
      this.sparks.push({
        i: edge.i,
        j: edge.j,
        t: 0,
        speed: 0.45 + this.rand() * 0.25,
        dir: 1,
        hue: region.color,
      });
    }
  }

  _homeTarget() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return {
      x: w * 0.5,
      y: h * 0.47,
      unit: Math.min(w, h) * (w < 720 ? 0.42 : 0.36),
    };
  }

  _logoTarget() {
    const rect = this.getLogoRect?.();
    if (!rect) {
      return { x: 40, y: 36, unit: 22 };
    }
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      unit: Math.max(22, rect.width * 0.48),
    };
  }

  _view() {
    const home = this._homeTarget();
    const logo = this._logoTarget();
    const e = easeInOutCubic(this.tHome);
    return {
      x: lerp(logo.x, home.x, e),
      y: lerp(logo.y, home.y, e),
      unit: lerp(logo.unit, home.unit, e),
      label: e,
    };
  }

  _screenToBrain(clientX, clientY) {
    const view = this._view();
    if (view.unit < 1) return null;
    return {
      x: (clientX - view.x) / view.unit,
      y: (clientY - view.y) / view.unit,
    };
  }

  _tick(ts, dt) {
    if (this.animating) {
      const p = Math.min(1, (ts - this.animStart) / this.animDur);
      this.tHome = lerp(this.fromHome, this.toHome, easeInOutCubic(p));
      if (p >= 1) {
        this.tHome = this.toHome;
        this.animating = false;
      }
    }

    const idle = this.reducedMotion ? 0 : dt;
    for (const spark of this.sparks) {
      spark.t += spark.speed * idle * spark.dir;
    }
    this.sparks = this.sparks.filter((s) => s.t >= 0 && s.t <= 1);
    const desired = this.tHome > 0.5 ? 42 : 10;
    while (this.sparks.length < desired) this._spawnSpark();

    for (const ripple of this.ripples) ripple.t += dt * 1.15;
    this.ripples = this.ripples.filter((r) => r.t < 1);

    if (!this.reducedMotion && this.rand() < dt * 0.35 && this.tHome > 0.4) {
      const hub = (this.rand() * 5) | 0;
      this.ripples.push({ i: hub, t: 0, color: this.nodes[hub].color });
    }

    let nextHover = null;
    if (this.pointer.inside && this.tHome > 0.35) {
      const local = this._screenToBrain(this.pointer.x, this.pointer.y);
      if (local) {
        const region = this._pickRegion(local.x, local.y);
        if (region) nextHover = region.id;
      }
    }
    if (nextHover !== this.hoverRegion) {
      this.hoverRegion = nextHover;
      this.onHoverRegion?.(nextHover);
      this.canvas.style.cursor = nextHover && this.tHome > 0.6 ? "pointer" : "default";
    }
  }

  _draw(ts) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const view = this._view();
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(view.x, view.y);
    ctx.scale(view.unit, view.unit);

    const t = ts * 0.001;
    const breath = this.reducedMotion ? 1 : 1 + Math.sin(t * 0.7) * 0.012 * this.tHome;
    ctx.scale(breath, breath);

    const pointer = this.pointer.inside ? this._screenToBrain(this.pointer.x, this.pointer.y) : null;
    const logoDim = 0.92 + 0.08 * view.label;

    ctx.save();
    ctx.globalAlpha = 0.55 * logoDim;
    const glow = ctx.createRadialGradient(0, 0, 0.2, 0, 0, 1.15);
    glow.addColorStop(0, "rgba(77, 232, 255, 0.16)");
    glow.addColorStop(0.45, "rgba(124, 92, 252, 0.08)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = view.label < 0.45 ? "rgba(12, 28, 42, 0.7)" : "rgba(8, 12, 20, 0.72)";
    ctx.strokeStyle = view.label < 0.45 ? "rgba(77, 232, 255, 0.7)" : "rgba(140, 210, 255, 0.18)";
    ctx.lineWidth = 0.012;
    ctx.fill(this.leftPath);
    ctx.fill(this.rightPath);
    ctx.fill(this.callosum);
    ctx.fill(this.cerebellum);
    ctx.stroke(this.leftPath);
    ctx.stroke(this.rightPath);
    ctx.stroke(this.cerebellum);
    ctx.beginPath();
    ctx.moveTo(0, -0.7);
    ctx.bezierCurveTo(0.015, -0.15, -0.015, 0.22, 0, 0.5);
    ctx.strokeStyle = "rgba(7, 8, 13, 0.92)";
    ctx.lineWidth = 0.045;
    ctx.stroke();
    ctx.restore();

    const hover = this.hoverRegion || this.lockedRegion;

    for (const edge of this.edges) {
      const a = this.nodes[edge.i];
      const b = this.nodes[edge.j];
      let light = 0.07;
      if (edge.kind === "hub") light = 0.12;
      if (hover && (a.region === hover || b.region === hover)) light += 0.22;
      if (pointer) {
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const d = Math.hypot(mid.x - pointer.x, mid.y - pointer.y);
        light += Math.max(0, 1 - d / 0.32) * 0.35;
      }
      const color = a.region === b.region ? a.color : "#7dd3fc";
      ctx.strokeStyle = rgba(color, Math.min(0.85, light) * logoDim);
      ctx.lineWidth = edge.kind === "hub" ? 0.007 : edge.kind === "long" ? 0.0035 : 0.0045;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (const ripple of this.ripples) {
      const origin = this.nodes[ripple.i];
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 0.05 + ripple.t * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(ripple.color, (1 - ripple.t) * 0.35 * logoDim);
      ctx.lineWidth = 0.01;
      ctx.stroke();
    }

    for (const spark of this.sparks) {
      const a = this.nodes[spark.i];
      const b = this.nodes[spark.j];
      const x = lerp(a.x, b.x, spark.t);
      const y = lerp(a.y, b.y, spark.t);
      ctx.fillStyle = rgba(spark.hue, 0.9 * logoDim);
      ctx.beginPath();
      ctx.arc(x, y, 0.009, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const node of this.nodes) {
      const pulse = this.reducedMotion ? 1 : 0.7 + 0.3 * Math.sin(t * (1.4 + node.pulse) + node.phase);
      let glowAmt = 0.18 * pulse;
      let extra = 0;
      if (hover && node.region === hover) {
        glowAmt += 0.55;
        extra += 0.012;
      }
      if (pointer) {
        const d = Math.hypot(node.x - pointer.x, node.y - pointer.y);
        const prox = Math.max(0, 1 - d / 0.28);
        glowAmt += prox * 0.7;
        extra += prox * 0.01;
      }
      const logoBoost = 1 + (1 - view.label) * 2.4;
      const r = (node.radius * (node.hub ? 1.15 : 1) * pulse + extra) * logoBoost;
      if (glowAmt > 0.2) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 3.4, 0, Math.PI * 2);
        ctx.fillStyle = rgba(node.color, Math.min(0.45, glowAmt * 0.28) * logoDim);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = node.hub
        ? rgba("#ffffff", (0.82 + glowAmt * 0.2) * logoDim)
        : rgba(node.color, (0.55 + glowAmt) * logoDim);
      ctx.fill();
    }

    if (view.label > 0.12) {
      ctx.globalAlpha = Math.max(0, view.label * 1.05 - 0.08);
      ctx.font = "0.078px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const region of REGIONS) {
        const active = hover === region.id;
        const ox = region.x < -0.1 ? -0.22 : region.x > 0.1 ? 0.22 : 0;
        const oy = region.y < 0 ? -0.18 : 0.2;
        const lx = region.x + ox;
        const ly = region.y + oy;
        ctx.strokeStyle = rgba(region.color, active ? 0.55 : 0.22);
        ctx.lineWidth = 0.006;
        ctx.beginPath();
        ctx.moveTo(region.x, region.y);
        ctx.lineTo(lx, ly - 0.02);
        ctx.stroke();
        ctx.fillStyle = rgba(region.color, active ? 1 : 0.72);
        ctx.font = `${active ? 0.092 : 0.072}px 'IBM Plex Mono', ui-monospace, monospace`;
        ctx.fillText(region.label.toUpperCase(), lx, ly);
      }
      ctx.globalAlpha = 1;
    }
  }
}

export { REGIONS };
