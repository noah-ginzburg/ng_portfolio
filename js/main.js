// Small extras for the portfolio. The page works without this file; it adds the theme
// switch, the background swarm, the attractor demo, nav highlighting and a few animations.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('year').textContent = new Date().getFullYear();
  themeToggle();
  headerOnScroll();
  highlightNav();
  revealOnScroll();
  countUp();
  magneticButtons();
  chatForm();
  miniRings();
  backgroundSwarm(document.getElementById('swarm'));
  attractorSphere(document.getElementById('sphere'));
});

// ---------------------------------------------------------------------------
// Page chrome
// ---------------------------------------------------------------------------

// Sun/moon button: flips data-theme on <html> and remembers the choice in this browser.
function themeToggle() {
  const root = document.documentElement;
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) { /* private mode: just don't remember */ }
  });
}

// Header gets a bottom border once you scroll past the top.
function headerOnScroll() {
  const header = document.querySelector('.site-header');
  const update = () => header.classList.toggle('scrolled', window.scrollY > 8);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

// Colours the nav link of whichever section is in the middle of the screen.
function highlightNav() {
  const links = [...document.querySelectorAll('.nav a')];
  const sections = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach(s => io.observe(s));
}

// Elements with class="reveal" fade up the first time they scroll into view.
function revealOnScroll() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
}

// Numbers with data-count tick up from zero when they first appear.
function countUp() {
  if (reduceMotion) return;
  const els = [...document.querySelectorAll('[data-count]')];
  const format = (el, v) => {
    el.textContent = v.toFixed(Number(el.dataset.decimals || 0)) + (el.dataset.suffix || '');
  };
  els.forEach(el => format(el, 0));
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      const el = entry.target, target = Number(el.dataset.count), start = performance.now();
      const tick = now => {
        const t = Math.min(1, (now - start) / 1400);
        format(el, target * easeOut(t));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.6 });
  els.forEach(el => io.observe(el));
}

// Buttons with class="magnetic" lean slightly towards the cursor.
function magneticButtons() {
  if (reduceMotion || !window.matchMedia('(hover: hover)').matches) return;
  document.querySelectorAll('.magnetic').forEach(el => {
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${x * 0.2}px, ${y * 0.3}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
}

// The contact form can't post anywhere on GitHub Pages, so it opens the visitor's
// email app with a ready-made message instead.
function chatForm() {
  const form = document.getElementById('chat-form');
  form?.addEventListener('submit', e => {
    e.preventDefault();
    const data = new FormData(form);
    const name = data.get('name').trim(), email = data.get('email').trim(), company = data.get('company').trim();
    const subject = company ? `10-minute chat with ${company}` : '10-minute chat';
    const body = `Hi Noah,\n\nI'd like to set up a 10-minute chat.\n\nName: ${name}\nEmail: ${email}${company ? `\nCompany: ${company}` : ''}\n`;
    window.location.href = `mailto:noahginz.34@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
}

// "How it works" diagrams: draws a ring of 16 neurons around the drone, with a bump
// of activity pointing at each target listed in data-bumps ("x,y x,y").
function miniRings() {
  document.querySelectorAll('.mini .ring').forEach(ring => {
    const m = ring.transform.baseVal.consolidate().matrix; // the ring's centre (from translate)
    const dirs = ring.dataset.bumps.split(' ').map(p => {
      const [x, y] = p.split(',').map(Number);
      return Math.atan2(y - m.f, x - m.e);
    });
    const strength = Number(ring.dataset.strength || 1);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const act = strength * Math.max(...dirs.map(d => Math.exp((Math.cos(a - d) - 1) / 0.08)));
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', (24 * Math.cos(a)).toFixed(2));
      c.setAttribute('cy', (24 * Math.sin(a)).toFixed(2));
      c.setAttribute('r', (1.6 + 2.4 * act).toFixed(2));
      c.style.opacity = (0.35 + 0.65 * act).toFixed(2);
      if (act > 0.2) c.classList.add('on');
      ring.appendChild(c);
    }
  });
}

// ---------------------------------------------------------------------------
// Background: two flocks drifting behind the page, using the classic "boids" rules
// (keep your distance, match your neighbours' heading, drift towards the group).
// Big soft orbs move slowly; small agents move faster. Both are drawn towards
// the cursor and get nudged when you scroll.
// ---------------------------------------------------------------------------
function backgroundSwarm(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const root = document.documentElement;
  const SCALE = 0.6; // draw at reduced resolution; everything is soft glow anyway

  const PALETTES = {
    dark: { orbs: ['#1d4ed8', '#4338ca', '#0e7490', '#ff5b4f', '#6d28d9', '#2563eb'], orbAlpha: 0.36, agent: '#93c5fd', agentAlpha: 0.55 },
    light: { orbs: ['#93c5fd', '#c4b5fd', '#a5f3fc', '#fca5a5', '#bfdbfe', '#a5b4fc'], orbAlpha: 0.5, agent: '#2563eb', agentAlpha: 0.35 },
  };

  // Orbs bounce softly off the screen edges; agents fly off one side and come back on the other.
  const ORB = { min: 6, max: 22, view: 520, sep: 320, sepW: 14, alignW: 0.25, cohW: 3, wander: 6, pointer: 8, pad: -100, wallK: 0.4 };
  const AGENT = { min: 30, max: 75, view: 110, sep: 34, sepW: 60, alignW: 0.9, cohW: 4, wander: 40, pointer: 45, wrap: true };

  let W = 0, H = 0, theme = '', palette, orbSprites, agentSprite;
  let orbs = [], agents = [];
  const pointer = { x: 0, y: 0, t: -1e9 };

  function makeSprite(hex, size = 128) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, hex);
    grad.addColorStop(0.45, hex + '66');
    grad.addColorStop(1, hex + '00');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  function applyTheme() {
    theme = root.dataset.theme === 'light' ? 'light' : 'dark';
    palette = PALETTES[theme];
    orbSprites = palette.orbs.map(c => makeSprite(c));
    agentSprite = makeSprite(palette.agent, 32);
  }

  function spawn(n, cfg, extra) {
    return Array.from({ length: n }, () => {
      const a = Math.random() * Math.PI * 2;
      const v = cfg.min + Math.random() * (cfg.max - cfg.min);
      return { x: Math.random() * W, y: Math.random() * H, vx: Math.cos(a) * v, vy: Math.sin(a) * v, phase: Math.random() * 6.28, ...extra() };
    });
  }

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * SCALE);
    canvas.height = Math.round(H * SCALE);
    const small = W < 700;
    if (!orbs.length) {
      orbs = spawn(small ? 5 : 8, ORB, () => ({ r: (small ? 110 : 150) + Math.random() * (small ? 90 : 140), c: Math.floor(Math.random() * 6) }));
      agents = spawn(small ? 22 : 38, AGENT, () => ({}));
    }
    draw();
  }

  function flock(list, cfg, dt, now) {
    for (const b of list) {
      let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
      for (const o of list) {
        if (o === b) continue;
        const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy) || 1;
        if (d < cfg.sep) { sx += (dx / d) * (1 - d / cfg.sep); sy += (dy / d) * (1 - d / cfg.sep); }
        if (d < cfg.view) { ax += o.vx; ay += o.vy; cx += o.x; cy += o.y; n++; }
      }
      let fx = sx * cfg.sepW, fy = sy * cfg.sepW;
      if (n) {
        fx += (ax / n - b.vx) * cfg.alignW + ((cx / n - b.x) / cfg.view) * cfg.cohW;
        fy += (ay / n - b.vy) * cfg.alignW + ((cy / n - b.y) / cfg.view) * cfg.cohW;
      }
      // Wander: a slowly turning random push, so the flock never settles.
      b.phase += (Math.random() - 0.5) * dt * 3;
      fx += Math.cos(b.phase) * cfg.wander;
      fy += Math.sin(b.phase) * cfg.wander;
      // Soft walls at the screen edges (orbs only).
      if (!cfg.wrap) {
        const p = cfg.pad, k = cfg.wallK;
        if (b.x < p) fx += (p - b.x) * k; else if (b.x > W - p) fx -= (b.x - (W - p)) * k;
        if (b.y < p) fy += (p - b.y) * k; else if (b.y > H - p) fy -= (b.y - (H - p)) * k;
      }
      // The cursor acts like a target the swarm is drawn to (fades out 4 s after the mouse stops).
      const age = now - pointer.t;
      if (age < 4000) {
        const dx = pointer.x - b.x, dy = pointer.y - b.y, d = Math.hypot(dx, dy) || 1;
        const k = cfg.pointer * (1 - age / 4000) * Math.min(1, d / 200);
        fx += (dx / d) * k; fy += (dy / d) * k;
      }
      b.vx += fx * dt; b.vy += fy * dt;
      const speed = Math.hypot(b.vx, b.vy) || 1;
      const clamped = Math.min(cfg.max, Math.max(cfg.min, speed));
      b.vx *= clamped / speed; b.vy *= clamped / speed;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (cfg.wrap) {
        const m = 20;
        if (b.x < -m) b.x += W + 2 * m; else if (b.x > W + m) b.x -= W + 2 * m;
        if (b.y < -m) b.y += H + 2 * m; else if (b.y > H + m) b.y -= H + 2 * m;
      }
    }
  }

  function draw() {
    if (root.dataset.theme !== theme) applyTheme();
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = theme === 'dark' ? 'lighter' : 'source-over';
    ctx.globalAlpha = palette.orbAlpha;
    for (const o of orbs) ctx.drawImage(orbSprites[o.c], o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);

    ctx.globalCompositeOperation = 'source-over';
    for (const a of agents) {
      const s = Math.hypot(a.vx, a.vy) || 1;
      ctx.globalAlpha = palette.agentAlpha * 0.5;
      ctx.drawImage(agentSprite, a.x - 9, a.y - 9, 18, 18);
      ctx.globalAlpha = palette.agentAlpha;
      ctx.strokeStyle = palette.agent;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x - (a.vx / s) * 10, a.y - (a.vy / s) * 10);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  let last = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (!document.hidden) {
      flock(orbs, ORB, dt, now);
      flock(agents, AGENT, dt, now);
      draw();
    }
    requestAnimationFrame(loop);
  }

  applyTheme();
  resize();
  window.addEventListener('resize', resize);
  // Redraw straight away when the theme button is pressed.
  new MutationObserver(draw).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  if (reduceMotion) return; // one still frame only

  window.addEventListener('pointermove', e => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.t = performance.now();
  }, { passive: true });
  // Scrolling gives both flocks a push, so the background reacts as you move through the page.
  let lastScroll = window.scrollY;
  window.addEventListener('scroll', () => {
    const dy = window.scrollY - lastScroll;
    lastScroll = window.scrollY;
    for (const o of orbs) o.vy -= dy * 0.25;
    for (const a of agents) a.vy -= dy * 0.6;
  }, { passive: true });
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// Live demo: a toy version of the spherical attractor network.
// Points on a sphere are "neurons", each standing for one 3D direction.
// Three targets compete (winner-take-all); noise breaks the tie,
// one bump of activity wins, and the heading arrow commits to it.
// ---------------------------------------------------------------------------
function attractorSphere(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('sim-status');
  const bars = [...document.querySelectorAll('#sim-bars .bar')];
  const sliders = [0, 1, 2].map(k => document.getElementById(`q${k}`));
  const quality = () => sliders.map(s => (s ? Number(s.value) : 1));

  const N = 1500;           // neurons on the sphere
  const BUMP_WIDTH = 0.055; // smaller = tighter activity bumps
  const GROWTH = 3.0;       // how fast the competition plays out
  const INHIBITION = 2.5;   // > 1 means only one target can survive
  const NOISE = 0.09;
  const TILT = 0.42;        // camera looks slightly down on the sphere
  const SPIN = 0.06;        // rotation speed, radians per second
  const LABELS = ['A', 'B', 'C'];

  // Evenly spread points on a sphere (Fibonacci lattice).
  const points = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    points.push([Math.cos(golden * i) * r, y, Math.sin(golden * i) * r]);
  }

  // Globe lines: 6 meridians and 5 parallels, sampled as points.
  const wires = [];
  for (let m = 0; m < 6; m++) {
    const phi = (m * Math.PI) / 6;
    wires.push(circle(t => [Math.cos(t) * Math.cos(phi), Math.sin(t), Math.cos(t) * Math.sin(phi)]));
  }
  for (const lat of [-60, -30, 0, 30, 60]) {
    const a = (lat * Math.PI) / 180;
    wires.push(circle(t => [Math.cos(a) * Math.cos(t), Math.sin(a), Math.cos(a) * Math.sin(t)]));
  }

  // Blue colour ramp from low to high activity, plus a soft glow sprite for each step.
  const RAMP = [[0, [30, 64, 175]], [0.35, [37, 99, 235]], [0.62, [56, 189, 248]], [0.85, [125, 232, 255]], [1, [236, 252, 255]]];
  const STEPS = 48;
  const colours = Array.from({ length: STEPS }, (_, i) => rampColour(RAMP, i / (STEPS - 1)));
  const glows = colours.map(makeGlow);

  let targets, weights, phase, phaseTime, winner, arrow;
  let angle = 0.5;

  function reset() {
    targets = pickTargets(3, angle, TILT);
    weights = [0, 0, 0];
    phase = 'appear';
    phaseTime = 0;
    winner = -1;
    arrow = 0;
  }

  // Competitive dynamics: each target's strength grows towards its quality and is
  // suppressed by the others. Equal qualities mean only noise decides the winner.
  const W0 = 1 / (1 + 2 * INHIBITION); // the balanced (unstable) starting point
  function step(dt) {
    phaseTime += dt;
    const q = quality();
    if (phase === 'appear') {
      const k = Math.min(1, phaseTime / 0.9);
      weights = weights.map(() => W0 * k * k * (3 - 2 * k));
      if (k >= 1) { phase = 'compete'; phaseTime = 0; }
    } else if (phase === 'compete') {
      const total = weights.reduce((a, b) => a + b, 0);
      weights = weights.map((w, k) => {
        const dw = GROWTH * w * (q[k] - w - INHIBITION * (total - w));
        return Math.max(0.0005, w + dw * dt + NOISE * Math.sqrt(dt) * gaussian() * w);
      });
      const order = weights.map((w, i) => i).sort((a, b) => weights[b] - weights[a]);
      if (weights[order[0]] > 0.9 * q[order[0]] && weights[order[1]] < 0.04) {
        phase = 'commit'; phaseTime = 0; winner = order[0];
      }
    } else if (phase === 'commit') {
      arrow = Math.min(1, arrow + dt / 0.5);
      if (phaseTime > 3.2) { phase = 'fade'; phaseTime = 0; }
    } else if (phase === 'fade') {
      weights = weights.map(w => w * Math.exp(-4 * dt));
      arrow = Math.max(0, arrow - dt / 0.6);
      if (phaseTime > 1.1) reset();
    }
  }

  function draw() {
    const w = canvas.width, h = canvas.height;
    const R = Math.min(w, h) * 0.37;
    const cx = w / 2, cy = h * 0.5;
    const unit = Math.min(w, h) / 420;
    const view = p => rotate(p, angle, TILT);
    const sx = q => cx + q[0] * R;
    const sy = q => cy - q[1] * R;

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // Soft blue halo around the sphere.
    const halo = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.45);
    halo.addColorStop(0, 'rgba(59,130,246,0.22)');
    halo.addColorStop(1, 'rgba(59,130,246,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    // Activity of every neuron (display uses the square root so faint bumps stay visible).
    const shown = weights.map(Math.sqrt);
    const back = [], front = [];
    let hx = 0, hy = 0, hz = 0, sum = 0;
    for (const p of points) {
      let a = 0;
      for (let k = 0; k < 3; k++) a += shown[k] * Math.exp((dot(p, targets[k]) - 1) / BUMP_WIDTH);
      const q = view(p);
      hx += a * q[0]; hy += a * q[1]; hz += a * q[2]; sum += a;
      (q[2] < 0 ? back : front).push([q, Math.min(1, a)]);
    }

    // Back half first, then a translucent sphere body over it, then the front half.
    drawWires(false);
    drawNeurons(back);
    const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    body.addColorStop(0, 'rgba(48,96,200,0.26)');
    body.addColorStop(0.55, 'rgba(16,34,80,0.5)');
    body.addColorStop(1, 'rgba(6,14,34,0.75)');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(125,170,255,0.35)';
    ctx.lineWidth = 1.2 * unit;
    ctx.stroke();
    drawWires(true);
    drawNeurons(front);

    // Target markers, just outside the sphere along each target's direction.
    // The ring around each marker grows with its quality slider.
    ctx.font = `500 ${11 * unit}px "IBM Plex Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const qual = quality();
    targets.forEach((t, k) => {
      const q = view(t);
      const depth = (q[2] + 1) / 2;
      const won = k === winner;
      const x = cx + q[0] * R * 1.14, y = cy - q[1] * R * 1.14;
      const ink = won ? '#67e8f9' : 'rgba(214,228,255,0.85)';
      ctx.globalAlpha = 0.3 + 0.7 * depth;
      ctx.strokeStyle = ink;
      ctx.fillStyle = ink;
      ctx.lineWidth = 1.3 * unit;
      ctx.beginPath(); ctx.arc(x, y, (3 + 5 * qual[k]) * unit, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, (won ? 3 : 1.8) * unit, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(LABELS[k], cx + q[0] * R * 1.3, cy - q[1] * R * 1.3);
    });
    ctx.globalAlpha = 1;

    // Heading arrow: the population vector of all neurons, drawn once the network commits.
    if (arrow > 0 && sum > 0) {
      const len = Math.hypot(hx, hy, hz);
      const ux = hx / len, uy = hy / len;
      const L = R * 1.02 * easeOut(arrow);
      const tx = cx + ux * L, ty = cy - uy * L;
      const grad = ctx.createLinearGradient(cx, cy, tx, ty);
      grad.addColorStop(0, 'rgba(236,252,255,0.2)');
      grad.addColorStop(1, 'rgba(236,252,255,1)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.4 * unit;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke();
      const ang = Math.atan2(ty - cy, tx - cx), head = 9 * unit;
      ctx.fillStyle = '#ecfcff';
      ctx.beginPath();
      ctx.moveTo(tx + Math.cos(ang) * head * 0.6, ty + Math.sin(ang) * head * 0.6);
      ctx.lineTo(tx + Math.cos(ang + 2.5) * head, ty + Math.sin(ang + 2.5) * head);
      ctx.lineTo(tx + Math.cos(ang - 2.5) * head, ty + Math.sin(ang - 2.5) * head);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 3 * unit, 0, Math.PI * 2); ctx.fill();
    }

    function drawWires(isFront) {
      ctx.strokeStyle = isFront ? 'rgba(125,170,255,0.16)' : 'rgba(125,170,255,0.06)';
      ctx.lineWidth = unit;
      ctx.beginPath();
      for (const ring of wires) {
        for (let i = 0; i < ring.length; i++) {
          const a = view(ring[i]), b = view(ring[(i + 1) % ring.length]);
          if ((a[2] + b[2] >= 0) !== isFront) continue;
          ctx.moveTo(sx(a), sy(a)); ctx.lineTo(sx(b), sy(b));
        }
      }
      ctx.stroke();
    }

    function drawNeurons(list) {
      // Quiet neurons: small dim dots.
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgb(150,180,240)';
      for (const [q, a] of list) {
        if (a > 0.05) continue;
        const depth = (q[2] + 1) / 2;
        ctx.globalAlpha = 0.08 + 0.5 * depth * depth;
        const r = unit * (0.55 + 0.9 * depth);
        ctx.fillRect(sx(q) - r, sy(q) - r, r * 2, r * 2);
      }
      // Active neurons: glow (added light) plus a bright core, coloured by activity.
      ctx.globalCompositeOperation = 'lighter';
      for (const [q, a] of list) {
        if (a <= 0.05) continue;
        const depth = (q[2] + 1) / 2;
        const i = Math.round(a * (STEPS - 1));
        const g = unit * (6 + 14 * a) * (0.6 + 0.6 * depth);
        ctx.globalAlpha = Math.min(1, a * 1.3) * (0.18 + 0.5 * depth);
        ctx.drawImage(glows[i], sx(q) - g, sy(q) - g, g * 2, g * 2);
        ctx.globalAlpha = 0.35 + 0.65 * depth;
        ctx.fillStyle = colours[i].css;
        const r = unit * (0.8 + 1.5 * a) * (0.7 + 0.5 * depth);
        ctx.beginPath(); ctx.arc(sx(q), sy(q), r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // Status text and the A/B/C strength bars under the canvas.
  let lastHud = '';
  function updateHud() {
    const status =
      phase === 'appear' ? 'Targets sensed' :
      phase === 'compete' ? 'Competing' :
      phase === 'commit' ? `Committed → ${LABELS[winner]}` : 'Resetting';
    if (status !== lastHud && statusEl) { statusEl.textContent = status; lastHud = status; }
    bars.forEach((bar, k) => {
      bar.querySelector('b').style.width = `${Math.min(100, weights[k] * 100)}%`;
      bar.querySelector('em').textContent = weights[k].toFixed(2);
      bar.classList.toggle('win', k === winner && phase !== 'fade');
    });
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    draw();
  }

  // With reduced motion: jump straight to a decision and draw one still frame.
  function settle() {
    reset();
    for (let i = 0; i < 6000 && phase !== 'commit'; i++) step(0.02);
    arrow = 1;
    draw();
    updateHud();
  }

  let visible = true, last = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (visible && !document.hidden) {
      angle += dt * SPIN;
      step(dt);
      draw();
      updateHud();
    }
    requestAnimationFrame(loop);
  }

  reset();
  new ResizeObserver(resize).observe(canvas);
  const restart = () => (reduceMotion ? settle() : reset());
  document.getElementById('sphere-replay')?.addEventListener('click', restart);
  document.getElementById('sphere-equal')?.addEventListener('click', () => {
    sliders.forEach(s => { if (s) s.value = 1; });
    restart();
  });
  // Moving a slider restarts the contest with the new qualities.
  sliders.forEach(s => s?.addEventListener('change', restart));

  if (reduceMotion) {
    settle();
  } else {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
    requestAnimationFrame(loop);
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// Spin around the vertical axis (yaw), then tip towards the viewer (pitch).
function rotate([x, y, z], yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
}

// The reverse of rotate(): turns a direction on screen back into sphere coordinates.
function unrotate([x, y, z], yaw, pitch) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y1 = y * cp + z * sp, z1 = -y * sp + z * cp;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  return [x * cy - z1 * sy, y1, x * sy + z1 * cy];
}

function gaussian() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

function circle(f, n = 72) {
  return Array.from({ length: n }, (_, i) => f((i / n) * Math.PI * 2));
}

// Targets spread roughly 120° apart around the visible rim, tipped slightly towards
// the viewer, so each bump and the final arrow are easy to see.
function pickTargets(n, yaw, pitch) {
  const base = Math.random() * Math.PI * 2;
  return Array.from({ length: n }, (_, k) => {
    const az = base + (k * 2 * Math.PI) / n + (Math.random() - 0.5) * 0.5;
    const z = 0.2 + Math.random() * 0.3;
    const r = Math.sqrt(1 - z * z);
    return unrotate([r * Math.cos(az), r * Math.sin(az), z], yaw, pitch);
  });
}

function rampColour(stops, t) {
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
  const k = (t - t0) / (t1 - t0);
  const rgb = c0.map((c, j) => Math.round(c + (c1[j] - c) * k));
  return { rgb, css: `rgb(${rgb.join(',')})` };
}

// A small pre-drawn radial glow, so each active neuron is one cheap drawImage call.
function makeGlow({ rgb }) {
  const s = 64, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, `rgba(${rgb.join(',')},0.9)`);
  grad.addColorStop(0.35, `rgba(${rgb.join(',')},0.35)`);
  grad.addColorStop(1, `rgba(${rgb.join(',')},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return c;
}
