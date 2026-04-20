(function () {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prefersReducedData = window.matchMedia('(prefers-reduced-data: reduce)').matches;
  const isSmallTouchViewport =
    window.matchMedia('(max-width: 768px)').matches &&
    window.matchMedia('(pointer: coarse)').matches;
  if (prefersReducedMotion || prefersReducedData || isSmallTouchViewport) return;

  /* ── Canvas particle tunnel ── */
  const canvas = document.getElementById('auth-3d-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let W, H;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  const DEPTH = 700;
  const COUNT = window.matchMedia('(max-width: 1200px)').matches ? 60 : 90;
  const particles = Array.from({ length: COUNT }, () => ({
    x: (Math.random() - 0.5) * 2400,
    y: (Math.random() - 0.5) * 2400,
    z: Math.random() * DEPTH,
    r: Math.random() * 1.8 + 0.4,
    vz: 0.5 + Math.random() * 0.9,
    hue: Math.random() > 0.55 ? 265 : 190,
  }));

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < COUNT; i++) {
      const p = particles[i];
      p.z -= p.vz;
      if (p.z <= 1) {
        p.x = (Math.random() - 0.5) * 2400;
        p.y = (Math.random() - 0.5) * 2400;
        p.z = DEPTH;
      }
      const scale = DEPTH / (DEPTH + p.z);
      const sx = p.x * scale + W * 0.5;
      const sy = p.y * scale + H * 0.5;
      if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;
      const radius = p.r * scale * 3;
      const alpha = (1 - p.z / DEPTH) * 0.65;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius * 2.5);
      g.addColorStop(0, `hsla(${p.hue},80%,68%,${alpha})`);
      g.addColorStop(1, `hsla(${p.hue},80%,68%,0)`);
      ctx.beginPath();
      ctx.arc(sx, sy, radius * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  draw();

  /* ── Mouse parallax on 3D scene layers ── */
  const scene = document.querySelector('.pg-auth-scene');
  if (!scene) return;
  const layers = Array.from(scene.querySelectorAll('.pg-layer'));
  let tx = 0, ty = 0, cx = 0, cy = 0, looping = false;

  document.addEventListener('mousemove', (e) => {
    tx = (e.clientX / window.innerWidth) * 2 - 1;
    ty = (e.clientY / window.innerHeight) * 2 - 1;
    if (!looping) { looping = true; requestAnimationFrame(parallax); }
  });

  function parallax() {
    cx += (tx - cx) * 0.065;
    cy += (ty - cy) * 0.065;
    for (const l of layers) {
      const d = parseFloat(l.dataset.depth || '0.2');
      l.style.transform = `translate3d(${(-cx * 22 * d).toFixed(2)}px,${(-cy * 22 * d).toFixed(2)}px,0)`;
    }
    looping = Math.abs(tx - cx) > 0.0008 || Math.abs(ty - cy) > 0.0008;
    if (looping) requestAnimationFrame(parallax);
  }
})();
