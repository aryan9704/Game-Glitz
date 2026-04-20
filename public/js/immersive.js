/**
 * GAME GLITZ — Immersive Layer v1.0
 * ===================================
 * 1.  Kinetic Typography       — [data-kinetic], [data-word-pop]
 * 2.  Scroll Story Nav         — [data-story-section] → chapter dots
 * 3.  Nav Scroll Progress Bar  — thin gradient bar at nav bottom
 * 4.  Nav Active Section       — highlights nav link for visible section
 * 5.  3D Depth Layers          — [data-depth-scene] mouse parallax
 * 6.  Gaming Atmosphere        — scanlines, vignette, ambient rays
 * 7.  Genre Filter Chips       — enhanced category selection
 * 8.  Smart Micro Interactions — press, underline-morph, nav ripple
 * 9.  Glassmorphism Init       — adds glass-ultra to key surfaces
 * 10. Scroll-based BG Shift    — section background glow moves with scroll
 */
;(function (global) {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const cleanupTasks = [];
  function addCleanup(fn) {
    if (typeof fn === 'function') cleanupTasks.push(fn);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  /* ─────────────────────────────────────────────
     1. KINETIC TYPOGRAPHY
  ───────────────────────────────────────────── */
  function initKineticText() {
    const kEls = document.querySelectorAll('[data-kinetic], [data-word-pop]');
    if (!kEls.length) return;

    kEls.forEach(el => {
      const mode = el.hasAttribute('data-kinetic') ? 'char' : 'word';
      // Skip if already processed
      if (el.dataset.kineticReady) return;
      el.dataset.kineticReady = '1';

      const raw = el.innerHTML;
      let charGlobal = 0;
      el.innerHTML = '';

      // Tokenise text nodes & elements
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = raw;

      let wIdx = 0;
      function processNode(node, output) {
        if (node.nodeType === Node.TEXT_NODE) {
          const words = node.textContent.split(/(\s+)/);
          words.forEach(seg => {
            if (/^\s+$/.test(seg)) {
              output.push(seg);
              return;
            }
            if (!seg) return;
            if (mode === 'char') {
              const charSpans = [...seg].map((c, i) =>
                `<span class="gg-char" data-gg-i="${charGlobal++}">${c}</span>`
              ).join('');
              output.push(`<span class="gg-word" data-gg-wi="${wIdx++}">${charSpans}</span>`);
            } else {
              output.push(`<span class="gg-word" data-gg-wi="${wIdx++}">${seg}</span>`);
            }
          });
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // Preserve inner elements (spans, em, etc.)
          const tag = node.tagName.toLowerCase();
          const attrs = [...node.attributes].map(a => `${a.name}="${a.value}"`).join(' ');
          const inner = [];
          node.childNodes.forEach(c => processNode(c, inner));
          output.push(`<${tag}${attrs ? ' ' + attrs : ''}>${inner.join('')}</${tag}>`);
        }
      }
      const parts = [];
      tempDiv.childNodes.forEach(n => processNode(n, parts));
      el.innerHTML = parts.join('');
      el.querySelectorAll('.gg-char[data-gg-i]').forEach(span => {
        span.style.setProperty('--i', span.dataset.ggI);
      });
      el.querySelectorAll('.gg-word[data-gg-wi]').forEach(span => {
        span.style.setProperty('--wi', span.dataset.ggWi);
      });
    });

    // Intersection observer to trigger animation
    if (REDUCED) {
      kEls.forEach(el => el.classList.add('gg-in'));
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('gg-in');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });

    kEls.forEach(el => obs.observe(el));
    addCleanup(() => obs.disconnect());
  }

  /* ─────────────────────────────────────────────
     2. SCROLL STORY NAV
  ───────────────────────────────────────────── */
  function initStoryNav() {
    const sections = document.querySelectorAll('[data-story-section]');
    if (sections.length < 2) return;

    const nav = document.createElement('nav');
    nav.className = 'gg-story-nav';
    nav.setAttribute('aria-label', 'Page sections');

    const dots = [];
    sections.forEach((sec, i) => {
      const label = sec.getAttribute('data-story-section') || `Section ${i + 1}`;
      const dot = document.createElement('button');
      dot.className = 'gg-story-dot';
      dot.setAttribute('data-label', label);
      dot.setAttribute('aria-label', `Go to ${label}`);
      dot.addEventListener('click', () => {
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      nav.appendChild(dot);
      dots.push({ dot, sec });
    });

    document.body.appendChild(nav);

    // Observer to track active section
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        const idx = dots.findIndex(d => d.sec === e.target);
        if (idx < 0) return;
        dots[idx].dot.classList.toggle('active', e.isIntersecting);
        // Mark the story section
        e.target.classList.toggle('gg-story-active', e.isIntersecting);
      });
    }, { threshold: 0.35, rootMargin: '-10% 0px -10% 0px' });

    dots.forEach(({ sec }) => obs.observe(sec));
    addCleanup(() => obs.disconnect());
  }

  /* ─────────────────────────────────────────────
     3. NAV SCROLL PROGRESS BAR
  ───────────────────────────────────────────── */
  function initNavProgress() {
    // Wait for nav to be injected by nav.js
    function attach() {
      const navEl = document.getElementById('glitz-nav');
      if (!navEl) return;
      const inner = navEl.querySelector('.nav-inner');
      if (!inner) return;

      // Avoid double-init
      if (inner.querySelector('.gg-nav-progress')) return;

      const bar = document.createElement('div');
      bar.className = 'gg-nav-progress';
      inner.style.position = 'relative';
      inner.appendChild(bar);

      function update() {
        const docH = document.documentElement.scrollHeight - window.innerHeight;
        const pct = docH > 0 ? (window.scrollY / docH) * 100 : 0;
        bar.style.width = clamp(pct, 0, 100) + '%';
      }
      window.addEventListener('scroll', update, { passive: true });
      addCleanup(() => window.removeEventListener('scroll', update));
      update();
    }

    // Retry until nav.js has injected the nav HTML
    let retries = 0;
    const poll = setInterval(() => {
      attach();
      const navEl = document.getElementById('glitz-nav');
      if ((navEl && navEl.querySelector('.gg-nav-progress')) || ++retries > 30) {
        clearInterval(poll);
      }
    }, 200);
  }

  /* ─────────────────────────────────────────────
     4. NAV ACTIVE SECTION TRACKING
  ───────────────────────────────────────────── */
  function initNavSectionTracker() {
    const sections = document.querySelectorAll('section[id]');
    if (!sections.length) return;

    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const id = e.target.id;
        // Find nav link pointing to this section (fragment or page match)
        const links = document.querySelectorAll('.nav-link, .mobile-link');
        links.forEach(link => {
          const href = link.getAttribute('href') || '';
          const match = href.includes(`#${id}`) || href.endsWith(`${id}.html`);
          link.classList.toggle('gg-section-active', match);
        });
      });
    }, { threshold: 0.4 });

    sections.forEach(s => obs.observe(s));
    addCleanup(() => obs.disconnect());
  }

  /* ─────────────────────────────────────────────
     5. 3D DEPTH LAYERS (mouse parallax)
  ───────────────────────────────────────────── */
  function initDepthLayers() {
    if (IS_TOUCH || REDUCED) return;

    const scenes = document.querySelectorAll('[data-depth-scene]');
    if (!scenes.length) return;

    // Use a single mousemove listener for all scenes
    const sceneData = [];
    const resizeHandlers = [];

    scenes.forEach(scene => {
      const rect = { w: 0, h: 0, l: 0, t: 0 };
      let raf;

      function updateRect() {
        const r = scene.getBoundingClientRect();
        rect.w = r.width; rect.h = r.height;
        rect.l = r.left + window.scrollX;
        rect.t = r.top + window.scrollY;
      }
      updateRect();
      window.addEventListener('resize', updateRect, { passive: true });
      resizeHandlers.push(updateRect);

      let mx = 0.5, my = 0.5;
      let cx = 0.5, cy = 0.5;

      function tick() {
        raf = null;
        cx = lerp(cx, mx, 0.08);
        cy = lerp(cy, my, 0.08);
        scene.style.setProperty('--scene-mx', cx.toFixed(4));
        scene.style.setProperty('--scene-my', cy.toFixed(4));
        if (Math.abs(cx - mx) > 0.001 || Math.abs(cy - my) > 0.001) {
          raf = requestAnimationFrame(tick);
        }
      }

      sceneData.push({ scene, rect, get mx() { return mx; }, set mx(v) { mx = v; }, get my() { return my; }, set my(v) { my = v; }, tick, get raf() { return raf; }, set raf(v) { raf = v; } });
    });

    const onMouseMove = (e) => {
      const sx = e.clientX + window.scrollX;
      const sy = e.clientY + window.scrollY;
      for (const s of sceneData) {
        s.mx = clamp((sx - s.rect.l) / (s.rect.w || 1), 0, 1);
        s.my = clamp((sy - s.rect.t) / (s.rect.h || 1), 0, 1);
        if (!s.raf) s.raf = requestAnimationFrame(s.tick);
      }
    };
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    addCleanup(() => {
      document.removeEventListener('mousemove', onMouseMove);
      resizeHandlers.forEach(handler => window.removeEventListener('resize', handler));
      sceneData.forEach(s => { if (s.raf) cancelAnimationFrame(s.raf); });
    });
  }

  /* ─────────────────────────────────────────────
     6. GAMING ATMOSPHERE
  ───────────────────────────────────────────── */
  function initAtmosphere() {
    if (REDUCED) return;

    // CRT scanlines (very subtle)
    if (!document.querySelector('.gg-scanlines')) {
      const sl = document.createElement('div');
      sl.className = 'gg-scanlines';
      sl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(sl);
    }

    // Film-grain noise
    if (!document.querySelector('.gg-noise')) {
      const noise = document.createElement('div');
      noise.className = 'gg-noise';
      noise.setAttribute('aria-hidden', 'true');
      document.body.appendChild(noise);
    }

    // Corner vignette
    if (!document.querySelector('.gg-vignette')) {
      const vig = document.createElement('div');
      vig.className = 'gg-vignette';
      vig.setAttribute('aria-hidden', 'true');
      document.body.appendChild(vig);
    }

    // Ambient light rays — inject into sections that have a hero
    const heroSections = document.querySelectorAll(
      '.cat-hero, section[data-particles], .hero-section, section#main-content'
    );
    heroSections.forEach(section => {
      if (section.querySelector('.gg-ray')) return;
      section.style.position = section.style.position || 'relative';
      section.style.overflow = 'hidden';

      const positions = [15, 35, 55, 75];
      const delays    = [0, 3, 7, 2];
      const durations = [14, 11, 16, 9];
      positions.forEach((left, i) => {
        const ray = document.createElement('div');
        ray.className = `gg-ray${i % 2 === 0 ? '' : ' gg-ray--wide'}`;
        ray.setAttribute('aria-hidden', 'true');
        ray.style.left = left + '%';
        ray.style.setProperty('--ray-dur', durations[i] + 's');
        ray.style.setProperty('--ray-delay', delays[i] + 's');
        section.appendChild(ray);
      });
    });
  }

  /* ─────────────────────────────────────────────
     7. GENRE FILTER CHIPS (categories page)
  ───────────────────────────────────────────── */
  function initGenreFilter() {
    const grid = document.getElementById('category-grid');
    const catSearch = document.getElementById('cat-search-input');
    if (!grid) return;

    // Read genre meta from page scope
    const meta = global.CATEGORY_META || {};
    const cats = Object.keys(meta);
    if (!cats.length) return;

    // Avoid double-init
    if (document.querySelector('.gg-genre-bar-wrap')) return;

    // Build chip bar
    const wrap = document.createElement('div');
    wrap.className = 'gg-genre-bar-wrap';
    wrap.innerHTML = `<div class="gg-genre-bar-label">Filter by genre</div>`;

    const bar = document.createElement('div');
    bar.className = 'gg-genre-bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Genre filter');

    // "All" chip
    const allChip = document.createElement('button');
    allChip.className = 'gg-genre-chip gg-genre-chip--all gg-active';
    allChip.setAttribute('aria-pressed', 'true');
    allChip.innerHTML = `<span class="chip-icon">🎮</span> All`;
    bar.appendChild(allChip);

    const chipMap = new Map();

    cats.forEach(cat => {
      const m = meta[cat] || {};
      const chip = document.createElement('button');
      chip.className = 'gg-genre-chip';
      chip.setAttribute('aria-pressed', 'false');
      chip.setAttribute('data-genre', cat);
      chip.innerHTML = `<span class="chip-icon">${m.icon || '🎮'}</span>${cat}`;
      bar.appendChild(chip);
      chipMap.set(cat, chip);
    });

    wrap.appendChild(bar);

    // Insert before the category grid section
    const gridSection = document.getElementById('categories-grid-section');
    if (gridSection) {
      gridSection.insertBefore(wrap, gridSection.firstChild);
    }

    // Wire chip clicks
    let activeGenre = null;

    function setActiveChip(genre) {
      activeGenre = genre;
      allChip.classList.toggle('gg-active', genre === null);
      allChip.setAttribute('aria-pressed', String(genre === null));
      chipMap.forEach((chip, cat) => {
        const active = cat === genre;
        chip.classList.toggle('gg-active', active);
        chip.setAttribute('aria-pressed', String(active));
      });

      // Filter the cards
      const cards = grid.querySelectorAll('[data-genre-card]');
      if (!cards.length) {
        // Fallback: trigger re-render if renderCategories is available
        if (global.renderCategories) global.renderCategories(genre || '');
        return;
      }
      cards.forEach(card => {
        const cardGenre = card.getAttribute('data-genre-card');
        const visible = genre === null || cardGenre === genre;
        card.style.transition = 'opacity 250ms ease, transform 250ms ease';
        card.style.opacity    = visible ? '1' : '0.25';
        card.style.transform  = visible ? '' : 'scale(0.97)';
        card.style.pointerEvents = visible ? '' : 'none';
      });

      // Sync search box
      if (catSearch && genre !== null) {
        catSearch.value = genre;
        catSearch.dispatchEvent(new Event('input'));
      } else if (catSearch && genre === null) {
        catSearch.value = '';
        catSearch.dispatchEvent(new Event('input'));
      }
    }

    allChip.addEventListener('click', () => setActiveChip(null));
    chipMap.forEach((chip, cat) => {
      chip.addEventListener('click', () => setActiveChip(activeGenre === cat ? null : cat));
    });

    // Tag the rendered cards when grid updates
    function tagCards() {
      const cards = grid.querySelectorAll('a[href*="store.html"]');
      cards.forEach(card => {
        if (card.dataset.genreCard) return;
        // Guess genre from aria-label or inner text
        const label = (card.getAttribute('aria-label') || card.querySelector('h3')?.textContent || '').toLowerCase();
        cats.forEach(cat => {
          if (label.includes(cat.toLowerCase())) {
            card.setAttribute('data-genre-card', cat);
            card.style.setProperty('--genre-color', meta[cat]?.color || '#8B5CF6');
          }
        });
      });
    }

    // Observe grid mutations (cards loaded async)
    const mo = new MutationObserver(tagCards);
    mo.observe(grid, { childList: true });
    tagCards(); // immediate pass
  }

  /* ─────────────────────────────────────────────
     8. SMART MICRO INTERACTIONS
  ───────────────────────────────────────────── */
  function initMicroInteractions() {
    // Underline-morph links (add to nav links)
    function applyUnderlineMorph() {
      document.querySelectorAll('.nav-link:not([data-underline-morph])').forEach(link => {
        link.setAttribute('data-underline-morph', '');
      });
    }

    // Nav link ripple on click
    function addNavRipples() {
      document.querySelectorAll('.nav-link').forEach(link => {
        if (link.dataset.rippleAdded) return;
        link.dataset.rippleAdded = '1';
        link.style.overflow = 'hidden';
        link.style.position = 'relative';
        link.addEventListener('click', (e) => {
          const rect = link.getBoundingClientRect();
          const rip = document.createElement('span');
          rip.className = 'nav-link-ripple';
          rip.style.cssText = `
            width: ${rect.width}px;
            height: ${rect.width}px;
            left: ${e.clientX - rect.left - rect.width / 2}px;
            top: ${e.clientY - rect.top - rect.width / 2}px;
          `;
          link.appendChild(rip);
          setTimeout(() => rip.remove(), 500);
        });
      });
    }

    // Retry for nav injection
    let retries = 0;
    const poll = setInterval(() => {
      applyUnderlineMorph();
      addNavRipples();
      if (document.querySelectorAll('.nav-link').length > 0 || ++retries > 30) {
        clearInterval(poll);
      }
    }, 300);

    // data-press: already in CSS for :active, but add visual feedback on touch
    document.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('[data-press], .btn, .gg-genre-chip');
      if (el) el.style.setProperty('--pressed', '1');
    });
    document.addEventListener('pointerup', () => {
      document.querySelectorAll('[style*="--pressed"]').forEach(el =>
        el.style.removeProperty('--pressed')
      );
    });
  }

  /* ─────────────────────────────────────────────
     9. GLASSMORPHISM INIT
  ───────────────────────────────────────────── */
  function initGlassmorphism() {
    // Hero cards, premium cards, stat cards — add glass-ultra class
    const targets = document.querySelectorAll(
      '.premium-card, .rp-card, .hero-stat-card, [data-glass-upgrade]'
    );
    targets.forEach(el => el.classList.add('glass-ultra'));

    // Add glass-bevel to category cards as they render
    const gridEl = document.getElementById('category-grid');
    if (gridEl) {
      const mo = new MutationObserver(() => {
        gridEl.querySelectorAll('.category-card:not([data-glass-bevel])').forEach(card => {
          card.setAttribute('data-glass-bevel', '');
        });
      });
      mo.observe(gridEl, { childList: true });
    }
  }

  /* ─────────────────────────────────────────────
     10. SCROLL-BASED BG SHIFT (ambient glow moves)
  ───────────────────────────────────────────── */
  function initScrollBgShift() {
    if (REDUCED) return;

    const heroSection = document.querySelector(
      'section[data-particles], section#main-content, .cat-hero, .hero-section'
    );
    if (!heroSection) return;

    let lastY = 0;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 5) return;
      lastY = y;

      const pct = clamp(y / (window.innerHeight * 0.8), 0, 1);
      // Shift the hero background gradient Y position
      heroSection.style.backgroundPositionY = (50 + pct * 30) + '%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    addCleanup(() => window.removeEventListener('scroll', onScroll));
  }

  /* ─────────────────────────────────────────────
     INIT
  ───────────────────────────────────────────── */
  function init() {
    initKineticText();
    initStoryNav();
    initNavProgress();
    initNavSectionTracker();
    initDepthLayers();
    initAtmosphere();
    initGenreFilter();
    initMicroInteractions();
    initGlassmorphism();
    initScrollBgShift();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-run genre filter after DB loads (categories page async pattern)
  if (document.getElementById('category-grid')) {
    window.addEventListener('load', initGenreFilter);
    addCleanup(() => window.removeEventListener('load', initGenreFilter));
  }

  window.addEventListener('pagehide', () => {
    while (cleanupTasks.length) {
      try { cleanupTasks.pop()(); } catch {}
    }
  }, { once: true });

})(window);
