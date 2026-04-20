/**
 * GAME GLITZ — Dynamic Cinematic Background System
 * Picks 5-8 random game poster images and cycles through them
 * with blur, dark overlay, Ken Burns effect, and crossfade transitions.
 * Respects prefers-reduced-motion.
 */
(function () {
  'use strict';

  /* ── Config ─────────────────────────────────────────── */
  const FADE_DURATION  = 2800;   // ms — crossfade between images
  const HOLD_DURATION  = 11000;  // ms — how long each image stays
  const BLUR_PX        = 80;     // px — background blur (higher = smoother ambient glow)
  const DARK_OPACITY   = 0.92;   // 0-1 — darkness overlay (higher = cleaner text contrast)
  const KB_SCALE_START = 1.04;   // Ken Burns start scale (subtle)
  const KB_SCALE_END   = 1.10;   // Ken Burns end scale
  const KB_DURATION    = (HOLD_DURATION + FADE_DURATION) * 1.1; // ms

  /* ── Reduced-motion guard ───────────────────────────── */
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prefersReducedData =
    window.matchMedia('(prefers-reduced-data: reduce)').matches ||
    (navigator.connection && navigator.connection.saveData === true);
  const isSmallTouchDevice =
    window.matchMedia('(max-width: 768px)').matches &&
    (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
  const shouldUseStatic = prefersReduced || prefersReducedData || isSmallTouchDevice;

  function safeCssUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw || /[\u0000-\u001F\u007F]/.test(raw)) return '';
    try {
      const hasExplicitProtocol = /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//');
      const parsed = new URL(raw, window.location.href);
      if (hasExplicitProtocol && !['http:', 'https:'].includes(parsed.protocol)) return '';
    } catch {
      return '';
    }
    return raw.replace(/["\\\n\r\f]/g, '\\$&');
  }

  function setBackgroundImage(element, value) {
    const url = safeCssUrl(value);
    element.style.backgroundImage = url ? `url("${url}")` : '';
  }

  /* ── Pick images from GAME_DATABASE ────────────────── */
  function pickImages() {
    const db = window.GAME_DATABASE;
    if (!db || !db.length) return [];

    // Shuffle and pick 10 images; prefer featured/high-rated/trending games
    const scored = db
      .filter(g => g.image && g.rating >= 4.0)
      .map(g => ({
        img: g.image,
        score: (g.featured ? 4 : 0) + (g.trending ? 2 : 0) + (g.newRelease ? 1 : 0) + (g.rating || 0) + Math.random() * 2.5
      }))
      .sort((a, b) => b.score - a.score);

    // Deduplicate images
    const seen = new Set();
    const pool = [];
    for (const item of scored) {
      if (!seen.has(item.img)) {
        seen.add(item.img);
        pool.push(item.img);
      }
      if (pool.length >= 10) break;
    }
    // Fisher-Yates shuffle to randomise order
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }

  /* ── Build CSS ──────────────────────────────────────── */
  function injectStyles() {
    // Styles are provided by css/premium.css to keep style-src CSP strict.
  }

  /* Build DOM */
  function buildDOM(images) {
    const existing = document.getElementById('dynamic-bg-root');
    if (existing) existing.remove();

    const root = document.createElement('div');
    root.id = 'dynamic-bg-root';
    root.setAttribute('aria-hidden', 'true');

    // Two layers for crossfade
    const layerA = document.createElement('div');
    layerA.className = 'dyn-bg-layer';
    layerA.id = 'dyn-bg-a';

    const layerB = document.createElement('div');
    layerB.className = 'dyn-bg-layer';
    layerB.id = 'dyn-bg-b';

    // Colour overlay
    const overlay = document.createElement('div');
    overlay.id = 'dynamic-bg-overlay';

    root.appendChild(layerA);
    root.appendChild(layerB);
    root.appendChild(overlay);

    // Insert as first child of body so it's truly behind everything
    document.body.insertBefore(root, document.body.firstChild);

    return { layerA, layerB };
  }

  /* ── Preload an image URL ───────────────────────────── */
  function preload(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = img.onerror = () => resolve(url);
      img.src = url;
    });
  }

  /* ── Main init ──────────────────────────────────────── */
  function init() {
    const images = pickImages();
    if (!images.length) return; // no DB available — silent fail

    injectStyles();
    const { layerA, layerB } = buildDOM(images);

    let currentIdx = 0;
    let activeDom  = layerA;  // currently visible layer
    let standbyDom = layerB;  // next layer waiting in wings
    let startTimer = null;
    let cycleTimer1 = null;
    let cycleTimer2 = null;
    let stopped = false;

    // Kick off: show first image immediately
    setBackgroundImage(layerA, images[0]);
    // Small rAF delay ensures transition fires
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { layerA.classList.add('active'); });
    });

    if (images.length < 2) return; // only one image — nothing to cycle

    // Preload next image while current is showing
    function cycle() {
      if (stopped || !activeDom.isConnected || !standbyDom.isConnected) return;
      const nextIdx = (currentIdx + 1) % images.length;

      preload(images[nextIdx]).then(() => {
        if (stopped || !activeDom.isConnected || !standbyDom.isConnected) return;
        // Set the standby layer's image (hidden behind active)
        setBackgroundImage(standbyDom, images[nextIdx]);
        standbyDom.classList.remove('active');

        // Wait until the current image has been shown long enough, then crossfade
        cycleTimer1 = setTimeout(() => {
          if (stopped || !activeDom.isConnected || !standbyDom.isConnected) return;
          // Swap: fade in standby, fade out active
          standbyDom.classList.add('active');
          activeDom.classList.remove('active');

          // Swap references
          const temp = activeDom;
          activeDom  = standbyDom;
          standbyDom = temp;
          currentIdx = nextIdx;

          // Schedule next cycle
          cycleTimer2 = setTimeout(cycle, HOLD_DURATION);
        }, HOLD_DURATION - FADE_DURATION);
      });
    }

    // Clean up timers when page is hidden/unloaded
    function clearTimers() {
      clearTimeout(startTimer);
      clearTimeout(cycleTimer1);
      clearTimeout(cycleTimer2);
    }
    function stopCycle() {
      stopped = true;
      clearTimers();
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimers();
      else if (!stopped) {
        clearTimers();
        startTimer = setTimeout(cycle, HOLD_DURATION);
      }
    });
    window.addEventListener('pagehide', stopCycle, { once: true });

    // Start first cycle after hold duration
    startTimer = setTimeout(cycle, HOLD_DURATION);
  }

  /* ── Boot ──────────────────────────────────────────── */
  if (shouldUseStatic) {
    // On reduced-motion, reduced-data, or small touch devices, keep the background static.
    function initStatic() {
      const images = pickImages();
      if (!images.length) return;
      injectStyles();
      const { layerA } = buildDOM(images);
      setBackgroundImage(layerA, images[0]);
      requestAnimationFrame(() => { layerA.classList.add('active'); });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initStatic);
    } else {
      initStatic();
    }
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
