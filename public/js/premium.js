/**
 * GameGlitz — Premium Enhancement Layer
 * Additive motion + atmosphere system that cooperates with engine.js
 *
 * Responsibilities:
 *  - Scroll progress rail
 *  - Ambient starfield + scanlines injection
 *  - Hero 3D tilt + parallax (home page only)
 *  - Kinetic typography splitter for hero headline + section titles
 *  - Scroll-reveal system (pg-reveal, pg-stagger)
 *  - Card tilt + spotlight tracking (pointer)
 *  - Button ripple + magnetic pull
 *  - Smart nav (scrolled state, hide-on-scroll-down)
 *  - Scroll-to-top FAB
 *  - Adaptive motion (fast scroll mode, prefers-reduced-motion)
 */
(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  const doc = document.documentElement;

  function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Deduplicate against engine.js: mark our tilt/spot targets with data-pg-* attributes only
  // so engine.js keeps its own system.

  /* ────────────────────────────────────────────────────────
     1. SCROLL PROGRESS RAIL
     ──────────────────────────────────────────────────────── */
  function initProgressRail() {
    if (document.querySelector('.pg-progress-rail')) return;
    const rail = document.createElement('div');
    rail.className = 'pg-progress-rail';
    rail.innerHTML = '<span></span>';
    document.body.appendChild(rail);
    const bar = rail.firstElementChild;

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      if (!rail.isConnected || !bar) {
        window.removeEventListener('scroll', onScroll);
        return;
      }
      ticking = true;
      requestAnimationFrame(() => {
        if (!rail.isConnected || !bar) {
          ticking = false;
          return;
        }
        const h = document.documentElement.scrollHeight - window.innerHeight;
        const p = h > 0 ? (window.scrollY / h) * 100 : 0;
        bar.style.width = p + '%';
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', () => window.removeEventListener('scroll', onScroll), { once: true });
    onScroll();
  }

  /* ────────────────────────────────────────────────────────
     2. AMBIENT STARFIELD + SCANLINES
     ──────────────────────────────────────────────────────── */
  function initAmbient() {
    if (reducedMotion) return;
    if (document.querySelector('.pg-starfield')) return;

    const star = document.createElement('div');
    star.className = 'pg-starfield';
    star.setAttribute('aria-hidden', 'true');
    const count = window.innerWidth < 768 ? 18 : 38;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const size = 1 + Math.random() * 2.2;
      const d = 2 + Math.random() * 4;
      const delay = Math.random() * 5;
      const dot = document.createElement('i');
      dot.className = 'pg-star';
      dot.style.left = `${x}%`;
      dot.style.top = `${y}%`;
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
      dot.style.setProperty('--d', `${d}s`);
      dot.style.animationDelay = `${delay}s`;
      star.appendChild(dot);
    }
    document.body.appendChild(star);

    const lines = document.createElement('div');
    lines.className = 'pg-scanlines';
    lines.setAttribute('aria-hidden', 'true');
    document.body.appendChild(lines);
  }

  /* ────────────────────────────────────────────────────────
     3. HERO 3D TILT + PARALLAX (home only)
     ──────────────────────────────────────────────────────── */
  function initHero3D() {
    const hero = document.querySelector('#main-content[data-particles]');
    if (!hero) return;

    // Inject cinematic scene
    if (!hero.querySelector('.pg-hero-scene')) {
      const scene = document.createElement('div');
      scene.className = 'pg-hero-scene';
      scene.setAttribute('aria-hidden', 'true');
      scene.innerHTML = `
        <div class="pg-layer pg-nebula" data-depth="-0.15"></div>
        <div class="pg-layer pg-ring pg-ring--c" data-depth="0.05"></div>
        <div class="pg-layer pg-ring pg-ring--b" data-depth="0.1"></div>
        <div class="pg-layer pg-ring pg-ring--a" data-depth="0.15"></div>
        <div class="pg-layer pg-layer--cube-a" data-depth="0.35">
          <div class="pg-cube"><div class="pg-face f-front"></div><div class="pg-face f-back"></div><div class="pg-face f-right"></div><div class="pg-face f-left"></div><div class="pg-face f-top"></div><div class="pg-face f-bottom"></div></div>
        </div>
        <div class="pg-layer pg-layer--cube-b" data-depth="0.45">
          <div class="pg-cube pg-cube--slow"><div class="pg-face f-front"></div><div class="pg-face f-back"></div><div class="pg-face f-right"></div><div class="pg-face f-left"></div><div class="pg-face f-top"></div><div class="pg-face f-bottom"></div></div>
        </div>
        <div class="pg-layer pg-layer--cube-c" data-depth="0.25">
          <div class="pg-cube pg-cube--tilted"><div class="pg-face f-front"></div><div class="pg-face f-back"></div><div class="pg-face f-right"></div><div class="pg-face f-left"></div><div class="pg-face f-top"></div><div class="pg-face f-bottom"></div></div>
        </div>
        <div class="pg-layer pg-shard pg-shard--one" data-depth="0.3"></div>
        <div class="pg-layer pg-shard pg-shard--two" data-depth="0.4"></div>
        <div class="pg-layer pg-shard pg-shard--three" data-depth="0.25"></div>
        <div class="pg-layer pg-shard pg-shard--four" data-depth="0.35"></div>
      `;
      // Insert as first child so hero-content sits above
      hero.prepend(scene);
    }

    if (reducedMotion) return;

    const scene = hero.querySelector('.pg-hero-scene');
    const layers = Array.from(hero.querySelectorAll('.pg-hero-scene .pg-layer'));
    const content = hero.querySelector('.hv3-wrap, .hero-content:not([aria-hidden="true"])');

    // Pointer-based 3D tilt + parallax depth
    let tx = 0, ty = 0; // target
    let cx = 0, cy = 0; // current
    let running = false;
    let rect = hero.getBoundingClientRect();

    function updateRect() { rect = hero.getBoundingClientRect(); }
    window.addEventListener('resize', updateRect, { passive: true });

    function onMove(e) {
      const px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const py = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      const nx = clamp((px / rect.width) * 2 - 1, -1, 1);
      const ny = clamp((py / rect.height) * 2 - 1, -1, 1);
      tx = nx;
      ty = ny;
      if (!running) { running = true; requestAnimationFrame(loop); }
    }

    function onLeave() {
      tx = 0; ty = 0;
      if (!running) { running = true; requestAnimationFrame(loop); }
    }

    function loop() {
      cx = lerp(cx, tx, 0.09);
      cy = lerp(cy, ty, 0.09);

      // Parallax each layer by depth
      for (let i = 0; i < layers.length; i++) {
        const l = layers[i];
        const d = parseFloat(l.dataset.depth || '0.2');
        const x = -cx * 28 * d;
        const y = -cy * 28 * d;
        l.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      }

      // Tilt content slightly
      if (content) {
        const rx = (cy * -4).toFixed(2);
        const ry = (cx * 4).toFixed(2);
        const tz = 0;
        content.style.transform = `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(${tz}px)`;
      }

      if (Math.abs(cx - tx) < 0.001 && Math.abs(cy - ty) < 0.001) {
        running = false;
        return;
      }
      requestAnimationFrame(loop);
    }

    if (finePointer && !isTouch) {
      hero.addEventListener('mousemove', onMove, { passive: true });
      hero.addEventListener('mouseleave', onLeave, { passive: true });
    }

    // Scroll parallax — fade hero scene out as you scroll away
    let scrollTicking = false;
    function onScroll() {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        const h = hero.offsetHeight || 1;
        const y = window.scrollY;
        const progress = clamp(y / h, 0, 1);
        scene.style.opacity = String(1 - progress * 0.7);
        scene.style.transform = `translate3d(0, ${y * 0.15}px, 0) scale(${1 + progress * 0.05})`;
        if (content) {
          content.style.opacity = String(1 - progress * 0.9);
          content.style.filter = `blur(${progress * 4}px)`;
        }
        scrollTicking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ────────────────────────────────────────────────────────
     4. KINETIC TYPOGRAPHY — splits text into words for reveal
     ──────────────────────────────────────────────────────── */
  function splitKinetic(el) {
    if (!el || el.dataset.pgSplit === '1') return;
    // Only split spans that DON'T rely on background-clip:text (gradient/neon)
    const spans = el.querySelectorAll('.glitch-text');
    const targets = spans.length ? Array.from(spans) : [];

    targets.forEach((t) => {
      if (t.querySelector('.pg-word')) return;
      const text = t.textContent;
      if (!text) return;
      const words = text.split(/(\s+)/);
      const kinetic = document.createElement('span');
      kinetic.className = 'pg-kinetic';
      let i = 0;
      words.forEach((w) => {
        if (/^\s+$/.test(w)) {
          kinetic.appendChild(document.createTextNode(w));
          return;
        }
        const span = document.createElement('span');
        span.className = 'pg-word';
        span.textContent = w;
        span.style.transitionDelay = (i * 90) + 'ms';
        kinetic.appendChild(span);
        i++;
      });
      t.textContent = '';
      t.appendChild(kinetic);
    });
    el.dataset.pgSplit = '1';
  }

  function initKineticHeadline() {
    if (reducedMotion) return;
    const headline = document.querySelector('.hv3-title, .hero-headline');
    if (!headline) return;

    splitKinetic(headline);

    // For gradient/neon spans, use an opacity/translate fade without fragmenting them
    const smoothSpans = headline.querySelectorAll('.gradient-text, .neon-text');
    smoothSpans.forEach((s, idx) => {
      if (s.dataset.pgFade === '1') return;
      s.dataset.pgFade = '1';
      s.style.opacity = '0';
      s.style.transform = 'translateY(24px)';
      s.style.transition = 'opacity 720ms var(--pg-ease), transform 720ms var(--pg-ease)';
      s.style.transitionDelay = (420 + idx * 120) + 'ms';
      s.style.display = 'inline-block';
    });

    requestAnimationFrame(() => {
      headline.querySelectorAll('.pg-kinetic').forEach((k) => k.classList.add('is-live'));
      smoothSpans.forEach((s) => {
        s.style.opacity = '1';
        s.style.transform = 'translateY(0)';
      });
    });
  }

  /* ────────────────────────────────────────────────────────
     5. SCROLL REVEAL SYSTEM
     ──────────────────────────────────────────────────────── */
  function initReveal() {
    if (!('IntersectionObserver' in window)) return;

    const autoSelectors = [
      '.section-title',
      '.section-header',
      '.eyebrow',
      '.hero-stats',
      '.category-card',
      '.pricing-card',
      '.feature-card',
      '.tool-card',
      '.team-card',
      '.value-card',
      '.news-card',
      '.article-card',
      '.milestone-card',
      '.match-card',
      '.player-card',
      '.story-card',
      '.doc-card',
      '.kb-cat-card',
      '.vod-card'
    ];

    autoSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        // Don't interfere with elements inside the hero
        if (el.closest('#main-content[data-particles]')) return;
        if (el.hasAttribute('data-pg-reveal')) return;
        if (el.hasAttribute('data-reveal')) return; // engine.js owns these
        el.setAttribute('data-pg-reveal', '');
      });
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    document.querySelectorAll('[data-pg-reveal]').forEach((el) => io.observe(el));

    // Stagger children
    document.querySelectorAll('[data-pg-stagger]').forEach((parent) => {
      Array.from(parent.children).forEach((child, i) => {
        child.style.setProperty('--pg-i', String(i));
      });
    });
    const ioStagger = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          ioStagger.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-pg-stagger]').forEach((el) => ioStagger.observe(el));

    // Active section title glow
    const titleObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) e.target.classList.add('pg-active');
        else e.target.classList.remove('pg-active');
      });
    }, { threshold: 0.4 });
    document.querySelectorAll('.section-title').forEach((el) => titleObserver.observe(el));
  }

  /* ────────────────────────────────────────────────────────
     6. CARD SPOTLIGHT TRACKING (pointer-follow highlight)
     ──────────────────────────────────────────────────────── */
  function initCardSpotlight() {
    if (!finePointer || isTouch) return;

    const selector = '.game-card, .deal-card, .category-card, .forum-category, ' +
      '.group-card, .event-card, .pricing-card, .article-card, .news-card, ' +
      '.feature-card, .tool-card, .team-card, .match-card, .player-card, ' +
      '.gd-info-card, .value-card, .quick-action-card, .profile-card, ' +
      '.kb-cat-card, .story-card, .doc-card, .vod-card, .milestone-card';

    const cardRects = new WeakMap();

    function handleMove(e) {
      const card = e.currentTarget;
      let r = cardRects.get(card);
      if (!r) {
        r = card.getBoundingClientRect();
        cardRects.set(card, r);
      }
      card.style.setProperty('--pg-x', (e.clientX - r.left) + 'px');
      card.style.setProperty('--pg-y', (e.clientY - r.top) + 'px');
    }

    function handleLeave(e) {
      cardRects.delete(e.currentTarget);
    }

    // Delegate via per-element listeners (cards are finite)
    function attach() {
      document.querySelectorAll(selector).forEach((card) => {
        if (card.dataset.pgSpotReady) return;
        card.dataset.pgSpotReady = '1';
        card.addEventListener('mousemove', handleMove, { passive: true });
        card.addEventListener('mouseleave', handleLeave, { passive: true });
      });
    }
    attach();

    // Re-attach when new cards get added dynamically
    const mo = new MutationObserver(() => {
      clearTimeout(window.__pgSpotMO);
      window.__pgSpotMO = setTimeout(attach, 80);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ────────────────────────────────────────────────────────
     7. BUTTON RIPPLE (additive, lightweight)
     ──────────────────────────────────────────────────────── */
  function initRipple() {
    if (reducedMotion) return;
    const selector = '.btn, .gd-btn, .watch-btn, button[type="submit"]';

    document.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest(selector);
      if (!btn) return;
      // Don't double-ripple if engine.js already adds one
      if (btn.querySelector('.pg-ripple')) return;
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const size = Math.max(r.width, r.height);
      const ripple = document.createElement('span');
      ripple.className = 'pg-ripple';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      ripple.style.width = size + 'px';
      ripple.style.height = size + 'px';
      // Ensure container is positioned
      const cs = getComputedStyle(btn);
      if (cs.position === 'static') btn.style.position = 'relative';
      if (cs.overflow === 'visible') btn.style.overflow = 'hidden';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);
    }, { passive: true });
  }

  /* ────────────────────────────────────────────────────────
     8. SMART NAV (scrolled / hide-on-scroll-down)
     ──────────────────────────────────────────────────────── */
  function initSmartNav() {
    const nav = document.getElementById('glitz-nav');
    if (!nav) return;

    let last = window.scrollY;
    let last2 = performance.now();
    let fastScrollTimer;

    function onScroll() {
      const y = window.scrollY;
      const now = performance.now();
      const dt = Math.max(1, now - last2);
      const dy = y - last;
      const velocity = Math.abs(dy) / dt; // px per ms
      last = y;
      last2 = now;

      doc.classList.toggle('pg-scrolled', y > 20);

      // Fast scroll mode
      if (velocity > 2) {
        doc.classList.add('pg-fast-scroll');
        clearTimeout(fastScrollTimer);
        fastScrollTimer = setTimeout(() => doc.classList.remove('pg-fast-scroll'), 200);
      }

      // Hide on scroll down, show on scroll up (after 240px)
      if (y > 240 && dy > 5) {
        doc.classList.add('pg-nav-hide');
      } else if (dy < -5) {
        doc.classList.remove('pg-nav-hide');
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Mark current page link as active if not already
    try {
      const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
      nav.querySelectorAll('a[href]').forEach((a) => {
        const href = (a.getAttribute('href') || '').toLowerCase();
        if (!href || href.startsWith('#')) return;
        const clean = href.split('?')[0].split('#')[0];
        if (clean === path || (path === 'index.html' && (clean === '' || clean === '/' || clean === 'index.html'))) {
          if (!a.hasAttribute('aria-current')) a.setAttribute('aria-current', 'page');
          a.classList.add('is-active');
        }
      });
    } catch {}
  }

  /* ────────────────────────────────────────────────────────
     9. SCROLL-TO-TOP FAB
     ──────────────────────────────────────────────────────── */
  function initFab() {
    if (document.querySelector('.pg-fab')) return;
    const fab = document.createElement('button');
    fab.className = 'pg-fab';
    fab.setAttribute('aria-label', 'Scroll to top');
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>';
    document.body.appendChild(fab);

    fab.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    });

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        fab.classList.toggle('is-on', window.scrollY > 600);
        ticking = false;
      });
    }, { passive: true });
  }

  /* ────────────────────────────────────────────────────────
     10. PAGE CURTAIN on link navigation
     ──────────────────────────────────────────────────────── */
  function initCurtain() {
    if (reducedMotion) return;
    const curtain = document.createElement('div');
    curtain.className = 'pg-curtain';
    curtain.innerHTML = '<div class="pg-curtain-logo"></div>';
    document.body.appendChild(curtain);

    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;
      try {
        const u = new URL(href, location.href);
        if (u.origin !== location.origin) return;
        if (u.pathname === location.pathname && u.search === location.search) return;
      } catch { return; }

      curtain.classList.add('is-on');
      // Fail-safe: remove after 900ms if navigation failed
      setTimeout(() => curtain.classList.remove('is-on'), 900);
    }, true);

    window.addEventListener('pageshow', () => curtain.classList.remove('is-on'));
  }

  /* ────────────────────────────────────────────────────────
     11. MAGNETIC BUTTONS (pointer-follow pull)
     ──────────────────────────────────────────────────────── */
  function initMagneticButtons() {
    if (!finePointer || isTouch || reducedMotion) return;

    const btns = document.querySelectorAll('[data-magnetic], .hero-ctas .btn, .btn-primary, .pg-fab');
    btns.forEach((btn) => {
      if (btn.dataset.pgMag === '1') return;
      btn.dataset.pgMag = '1';
      let rect = null;
      btn.addEventListener('mouseenter', () => { rect = btn.getBoundingClientRect(); });
      btn.addEventListener('mousemove', (e) => {
        if (!rect) rect = btn.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) * 0.18;
        const dy = (e.clientY - cy) * 0.22;
        btn.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
        rect = null;
      });
    });
  }

  /* ────────────────────────────────────────────────────────
     BOOT
     ──────────────────────────────────────────────────────── */
  function safeInit(name, fn) {
    try {
      fn();
    } catch (err) {
      console.warn(`[premium] ${name} failed:`, err);
    }
  }

  function boot() {
    safeInit('progress rail', initProgressRail);
    safeInit('ambient scene', initAmbient);
    safeInit('hero 3D', initHero3D);
    safeInit('kinetic headline', initKineticHeadline);
    safeInit('reveal effects', initReveal);
    safeInit('card spotlight', initCardSpotlight);
    safeInit('ripple effects', initRipple);
    safeInit('smart nav', initSmartNav);
    safeInit('floating action button', initFab);
    safeInit('page curtain', initCurtain);
    safeInit('magnetic buttons', initMagneticButtons);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // Re-run for dynamically inserted nav / cards
  window.addEventListener('load', () => {
    safeInit('smart nav refresh', initSmartNav);
    safeInit('magnetic buttons refresh', initMagneticButtons);
    safeInit('card spotlight refresh', initCardSpotlight);
  });

  // Expose for debug
  window.PG = { reboot: boot };
})();
