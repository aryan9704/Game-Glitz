/**
 * GAME GLITZ — Premium Motion System v2.0
 * =========================================
 * Extends engine.js with advanced, velocity-reactive motion.
 * Every effect is purposeful, performance-first, and accessible.
 *
 * Systems:
 *  1.  Velocity-Reactive Cursor    — speed-aware custom cursor with morphing
 *  2.  Scroll Velocity Tracker     — dampens heavy effects when scrolling fast
 *  3.  Advanced Parallax           — velocity-dampened with lerp smoothing
 *  4.  Spotlight Hover             — cursor-following radial light on cards
 *  5.  Toast Notification System   — window.GG.toast(msg, type, duration)
 *  6.  Tab Sliding Indicator       — animated underline for tab groups
 *  7.  Accordion Height Transition — smooth expand/collapse without jank
 *  8.  Modal Entrance/Exit         — scale+fade with backdrop
 *  9.  CTA Attention Pulse         — idle-triggered pulse near key actions
 * 10.  Section Orchestration       — staggered child reveals per section type
 * 11.  Hero Entrance Sequence      — coordinated multi-element intro
 * 12.  Cart/Wishlist Microanim     — success states for add actions
 * 13.  Number Counter (enhanced)   — spring ease + locale formatting
 * 14.  Skeleton → Content Reveal   — shimmer placeholders until loaded
 * 15.  Page Transition System      — directional fade+slide between pages
 * 16.  Scroll Direction Tracker    — reveals/hides nav intelligently
 * 17.  Reactive Hover Lift         — spring-physics elevation on cards
 * 18.  Badge / Live Pulse          — priority pulse for hot/live/new items
 * 19.  Input Focus Glow            — glow system for form fields
 * 20.  Ambient Spotlight Mesh      — subtle reactive background glow
 */
;(function (global) {
  'use strict';

  /* ─────────────────────────────────────────────
     GLOBAL STATE
  ───────────────────────────────────────────── */
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isMobile = window.innerWidth < 768;

  const mouse = { x: 0, y: 0, vx: 0, vy: 0, speed: 0, lastX: 0, lastY: 0, lastTime: 0 };
  const scroll = { y: 0, lastY: 0, velocity: 0, direction: 'down', ticking: false };

  /* Premium easing */
  const EASE_OUT   = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const EASE_SPRING= 'cubic-bezier(0.34, 1.56, 0.64, 1)';

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

  /* ─────────────────────────────────────────────
     1. VELOCITY-REACTIVE CURSOR
  ───────────────────────────────────────────── */
  function initCursor() {
    if (isTouch || prefersReduced) return;

    const dot  = document.getElementById('cursor-dot');
    const ring = document.getElementById('cursor-ring');
    if (!dot || !ring) return;

    let rx = 0, ry = 0; // ring lerp position
    let raf;

    function updateCursor() {
      // Lerp ring toward mouse — faster when cursor moves fast
      const lerpFactor = clamp(0.1 + mouse.speed * 0.004, 0.1, 0.35);
      rx = lerp(rx, mouse.x, lerpFactor);
      ry = lerp(ry, mouse.y, lerpFactor);

      dot.style.left  = mouse.x + 'px';
      dot.style.top   = mouse.y + 'px';
      ring.style.left = rx + 'px';
      ring.style.top  = ry + 'px';

      // Scale ring with velocity
      const scale = clamp(1 + mouse.speed * 0.008, 1, 1.5);
      ring.style.transform = `translate(-50%, -50%) scale(${scale})`;

      raf = requestAnimationFrame(updateCursor);
    }

    document.addEventListener('mousemove', (e) => {
      const now = performance.now();
      const dt = now - (mouse.lastTime || now);
      mouse.vx = (e.clientX - mouse.lastX) / (dt || 16);
      mouse.vy = (e.clientY - mouse.lastY) / (dt || 16);
      mouse.speed = Math.sqrt(mouse.vx * mouse.vx + mouse.vy * mouse.vy);
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.lastX = e.clientX;
      mouse.lastY = e.clientY;
      mouse.lastTime = now;
      dot.style.opacity = '1';
      ring.style.opacity = '1';
    }, { passive: true });

    document.addEventListener('mouseleave', () => {
      dot.style.opacity = '0';
      ring.style.opacity = '0';
    });

    // State classes for semantic hover
    document.addEventListener('mouseover', (e) => {
      const interactive = e.target.closest('a, button, [role="button"], [data-magnetic], input, select, textarea, label');
      if (interactive) {
        ring.classList.add('cursor-hover');
        dot.classList.add('cursor-hover');
      }
    });
    document.addEventListener('mouseout', (e) => {
      const interactive = e.target.closest('a, button, [role="button"], [data-magnetic], input, select, textarea, label');
      if (interactive) {
        ring.classList.remove('cursor-hover');
        dot.classList.remove('cursor-hover');
      }
    });

    document.addEventListener('mousedown', () => ring.classList.add('cursor-click'));
    document.addEventListener('mouseup',   () => ring.classList.remove('cursor-click'));

    raf = requestAnimationFrame(updateCursor);
  }

  /* ─────────────────────────────────────────────
     2 + 3. UNIFIED SCROLL HANDLER
     (replaces separate initScrollTracker + initAdvancedParallax scroll listeners)
  ───────────────────────────────────────────── */
  let _scrollRafPending = false;

  function _onScrollRaf() {
    _scrollRafPending = false;
    const body = document.body;
    const currentY = window.scrollY;
    scroll.velocity = currentY - scroll.lastY;
    scroll.direction = scroll.velocity >= 0 ? 'down' : 'up';
    scroll.lastY = currentY;
    scroll.y = currentY;

    const speed = Math.abs(scroll.velocity);
    body.classList.toggle('scroll-fast', speed > 15);
    body.classList.toggle('scroll-slow', speed <= 3 && speed > 0);

    if (_parallaxEls.length) {
      const dampener = clamp(1 - speed * 0.02, 0.4, 1);
      const vh2 = window.innerHeight / 2;
      _parallaxEls.forEach(item => {
        const offset = (item.pageCenter - currentY - vh2) * item.depth * dampener;
        item.el.style.transform = `translate3d(0, ${offset}px, 0)`;
      });
    }
  }

  function initScrollTracker() {
    window.addEventListener('scroll', () => {
      if (_scrollRafPending) return;
      _scrollRafPending = true;
      requestAnimationFrame(_onScrollRaf);
    }, { passive: true });
  }

  /* ─────────────────────────────────────────────
     3. ADVANCED PARALLAX (velocity-dampened)
     Parallax elements are cached once; scroll handled by unified listener above.
  ───────────────────────────────────────────── */
  let _parallaxEls = [];

  function _cacheParallaxEls() {
    _parallaxEls = [];
    document.querySelectorAll('[data-depth]').forEach(el => {
      const rect = el.getBoundingClientRect();
      _parallaxEls.push({
        el,
        depth: parseFloat(el.getAttribute('data-depth')) || 0.2,
        pageCenter: rect.top + window.scrollY + rect.height / 2,
      });
    });
  }

  function initAdvancedParallax() {
    if (prefersReduced || isMobile) return;
    if (!document.querySelectorAll('[data-depth]').length) return;

    _cacheParallaxEls();
    window.addEventListener('resize', _cacheParallaxEls, { passive: true });

    // Mouse parallax for hero elements
    if (!isTouch) {
      const heroEls = document.querySelectorAll('[data-mouse-depth]');
      if (heroEls.length) {
        document.addEventListener('mousemove', () => {
          requestAnimationFrame(() => {
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            const nx = (mouse.x - cx) / cx;
            const ny = (mouse.y - cy) / cy;
            heroEls.forEach(el => {
              const d = parseFloat(el.getAttribute('data-mouse-depth')) || 0.05;
              el.style.transform = `translate3d(${nx * d * 40}px, ${ny * d * 30}px, 0)`;
            });
          });
        }, { passive: true });
      }
    }
  }

  /* ─────────────────────────────────────────────
     4. SPOTLIGHT HOVER (cursor-following glow)
  ───────────────────────────────────────────── */
  function initSpotlight() {
    if (isTouch || prefersReduced) return;
    const cards = document.querySelectorAll('[data-spotlight]');
    if (!cards.length) return;

    cards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--spotlight-x', x + '%');
        card.style.setProperty('--spotlight-y', y + '%');
        card.style.setProperty('--spotlight-opacity', '1');
      });
      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--spotlight-opacity', '0');
      });
    });
  }

  /* ─────────────────────────────────────────────
     5. TOAST NOTIFICATION SYSTEM
  ───────────────────────────────────────────── */
  const toastIcons = {
    success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>`,
    error:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>`,
    cart:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>`,
  };

  let toastContainer;
  function getToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'gg-toasts';
      toastContainer.setAttribute('aria-live', 'polite');
      toastContainer.setAttribute('aria-atomic', 'false');
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  function showToast(message, type = 'info', duration = 3500) {
    const container = getToastContainer();
    const toast = document.createElement('div');
    toast.className = `gg-toast gg-toast--${type}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
      <span class="gg-toast__icon" aria-hidden="true">${toastIcons[type] || toastIcons.info}</span>
      <span class="gg-toast__message">${message}</span>
      <button class="gg-toast__close" aria-label="Dismiss" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    toast.querySelector('.gg-toast__close')?.addEventListener('click', () => dismissToast(toast));

    container.appendChild(toast);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('gg-toast--visible'));
    });

    const timer = setTimeout(() => dismissToast(toast), duration);
    toast.addEventListener('mouseenter', () => clearTimeout(timer));
    toast.addEventListener('mouseleave', () => setTimeout(() => dismissToast(toast), 1200));
  }

  function dismissToast(toast) {
    toast.classList.remove('gg-toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }

  /* ─────────────────────────────────────────────
     6. TAB SLIDING INDICATOR
  ───────────────────────────────────────────── */
  function initTabIndicators() {
    const tabGroups = document.querySelectorAll('[data-tab-group]');
    if (!tabGroups.length) return;

    tabGroups.forEach(group => {
      const tabs = group.querySelectorAll('[data-tab]');
      if (!tabs.length) return;

      // Create sliding indicator
      const indicator = document.createElement('span');
      indicator.className = 'gg-tab-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      group.style.position = 'relative';
      group.appendChild(indicator);

      function moveIndicator(tab) {
        if (!tab) return;
        const groupRect = group.getBoundingClientRect();
        const tabRect = tab.getBoundingClientRect();
        const left = tabRect.left - groupRect.left;
        indicator.style.width  = tabRect.width + 'px';
        indicator.style.left   = left + 'px';
      }

      // Find active tab on init
      const active = group.querySelector('[data-tab][aria-selected="true"], [data-tab].active, [data-tab].is-active');
      if (active) {
        indicator.style.transition = 'none';
        moveIndicator(active);
        requestAnimationFrame(() => {
          indicator.style.transition = '';
        });
      } else if (tabs[0]) {
        moveIndicator(tabs[0]);
      }

      tabs.forEach(tab => {
        tab.addEventListener('click', () => moveIndicator(tab));
        // Support MutationObserver for programmatic tab changes
      });

      // Watch for active class changes
      const mo = new MutationObserver(() => {
        const nowActive = group.querySelector('[data-tab][aria-selected="true"], [data-tab].active, [data-tab].is-active');
        if (nowActive) moveIndicator(nowActive);
      });
      mo.observe(group, { attributes: true, subtree: true, attributeFilter: ['class', 'aria-selected'] });
    });
  }

  /* ─────────────────────────────────────────────
     7. ACCORDION SMOOTH ANIMATION
  ───────────────────────────────────────────── */
  function initAccordions() {
    const accordions = document.querySelectorAll('[data-accordion]');
    if (!accordions.length) return;

    accordions.forEach(accordion => {
      const trigger = accordion.querySelector('[data-accordion-trigger]');
      const body    = accordion.querySelector('[data-accordion-body]');
      if (!trigger || !body) return;

      // Prepare body for animation
      body.style.overflow = 'hidden';
      const isOpen = accordion.classList.contains('open') || accordion.hasAttribute('open');
      if (!isOpen) {
        body.style.height = '0px';
        body.style.opacity = '0';
      }
      body.style.transition = `height 0.38s ${EASE_OUT}, opacity 0.3s ease`;

      trigger.addEventListener('click', () => {
        const open = accordion.classList.toggle('open');
        trigger.setAttribute('aria-expanded', open);
        accordion.setAttribute('aria-expanded', open);

        if (open) {
          body.style.height = body.scrollHeight + 'px';
          body.style.opacity = '1';
          body.addEventListener('transitionend', () => {
            if (accordion.classList.contains('open')) body.style.height = 'auto';
          }, { once: true });
        } else {
          body.style.height = body.scrollHeight + 'px';
          requestAnimationFrame(() => {
            body.style.height = '0px';
            body.style.opacity = '0';
          });
        }
      });
    });
  }

  /* ─────────────────────────────────────────────
     8. MODAL ENTRANCE / EXIT
  ───────────────────────────────────────────── */
  function initModals() {
    // Wire data-modal-open / data-modal-close triggers
    document.addEventListener('click', (e) => {
      const opener = e.target.closest('[data-modal-open]');
      if (opener) {
        const id = opener.getAttribute('data-modal-open');
        const modal = document.getElementById(id);
        if (modal) openModal(modal);
        return;
      }

      const closer = e.target.closest('[data-modal-close]');
      if (closer) {
        const modal = closer.closest('[data-modal]');
        if (modal) closeModal(modal);
        return;
      }

      // Click backdrop to close
      if (e.target.hasAttribute('data-modal')) closeModal(e.target);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const open = document.querySelector('[data-modal].modal-open');
        if (open) closeModal(open);
      }
    });
  }

  function openModal(modal) {
    modal.classList.add('modal-open');
    document.body.classList.add('modal-active');
    const inner = modal.querySelector('[data-modal-inner]');
    if (inner) inner.style.transform = 'scale(0.92) translateY(12px)';
    requestAnimationFrame(() => {
      if (inner) inner.style.transform = '';
    });
    const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable) setTimeout(() => focusable.focus(), 50);
  }

  function closeModal(modal) {
    const inner = modal.querySelector('[data-modal-inner]');
    if (inner) {
      inner.style.transform = 'scale(0.95) translateY(8px)';
      inner.style.opacity = '0';
    }
    modal.style.opacity = '0';
    setTimeout(() => {
      modal.classList.remove('modal-open');
      document.body.classList.remove('modal-active');
      if (inner) { inner.style.transform = ''; inner.style.opacity = ''; }
      modal.style.opacity = '';
    }, 280);
  }

  global.openModal  = openModal;
  global.closeModal = closeModal;

  /* ─────────────────────────────────────────────
     9. CTA ATTENTION PULSE (idle-triggered)
  ───────────────────────────────────────────── */
  function initCtaAttention() {
    if (prefersReduced) return;
    const ctas = document.querySelectorAll('[data-cta-pulse]');
    if (!ctas.length) return;

    let idleTimer;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      ctas.forEach(c => c.classList.remove('cta-attention'));
      idleTimer = setTimeout(() => {
        // Only pulse CTA that's in the viewport
        ctas.forEach(c => {
          const rect = c.getBoundingClientRect();
          if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
            c.classList.add('cta-attention');
            setTimeout(() => c.classList.remove('cta-attention'), 1800);
          }
        });
      }, 4000);
    };

    ['mousemove', 'scroll', 'keydown', 'touchstart'].forEach(ev => {
      document.addEventListener(ev, resetIdle, { passive: true });
    });
    resetIdle();
  }

  /* ─────────────────────────────────────────────
     10. SECTION ORCHESTRATION
  ───────────────────────────────────────────── */
  function initSectionOrchestration() {
    const sections = document.querySelectorAll('[data-section]');
    if (!sections.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const section = entry.target;
        const type = section.getAttribute('data-section');

        if (type === 'hero') {
          orchestrateHero(section);
        } else {
          orchestrateSection(section);
        }
        observer.unobserve(section);
      });
    }, { threshold: 0.05 });

    sections.forEach(s => observer.observe(s));
  }

  function orchestrateHero(section) {
    const elements = section.querySelectorAll('[data-hero-item]');
    elements.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(30px)';
      el.style.transition = `opacity 0.7s ${EASE_OUT}, transform 0.7s ${EASE_OUT}`;
      el.style.transitionDelay = `${i * 120}ms`;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.opacity = '1';
          el.style.transform = 'none';
        });
      });
    });
  }

  function orchestrateSection(section) {
    const children = section.querySelectorAll('[data-section-item]');
    children.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = `opacity 0.55s ${EASE_OUT}, transform 0.55s ${EASE_OUT}`;
      el.style.transitionDelay = `${i * 80}ms`;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.opacity = '1';
          el.style.transform = 'none';
        });
      });
    });
  }

  /* ─────────────────────────────────────────────
     11. HERO ENTRANCE SEQUENCE
  ───────────────────────────────────────────── */
  function initHeroEntrance() {
    const hero = document.querySelector('[data-hero-entrance]');
    if (!hero) return;

    const items = hero.querySelectorAll('[data-hero-step]');
    items.forEach(item => {
      item.style.opacity = '0';
      item.style.transform = 'translateY(24px)';
    });

    // Wait a tick so page paints first, then orchestrate
    setTimeout(() => {
      items.forEach((item, i) => {
        const delay = parseInt(item.getAttribute('data-hero-step') || i * 100);
        setTimeout(() => {
          item.style.transition = `opacity 0.75s ${EASE_OUT}, transform 0.75s ${EASE_OUT}`;
          item.style.opacity = '1';
          item.style.transform = 'none';
        }, 80 + delay);
      });
    }, 50);
  }

  /* ─────────────────────────────────────────────
     12. CART / WISHLIST MICROANIMATIONS
  ───────────────────────────────────────────── */
  function initMicroAnimations() {
    // Cart success burst
    document.addEventListener('gg:cart:added', (e) => {
      const btn = e.detail?.button;
      if (btn) pulseSuccess(btn, '#10B981');
      showToast('Added to cart!', 'cart');
    });

    // Wishlist toggle
    document.addEventListener('gg:wishlist:toggled', (e) => {
      const btn = e.detail?.button;
      const added = e.detail?.added;
      if (btn) {
        btn.classList.add(added ? 'wishlist-added' : 'wishlist-removed');
        setTimeout(() => btn.classList.remove('wishlist-added', 'wishlist-removed'), 600);
      }
      if (added) showToast('Added to wishlist!', 'success');
    });

    // Review submitted
    document.addEventListener('gg:review:submitted', () => {
      showToast('Review submitted. Thank you!', 'success');
    });

    // Auth success
    document.addEventListener('gg:auth:login', () => {
      showToast('Welcome back!', 'success', 2500);
    });

    document.addEventListener('gg:auth:register', () => {
      showToast('Account created! Welcome to GameGlitz.', 'success', 3000);
    });
  }

  function pulseSuccess(el, color = '#8B5CF6') {
    const burst = document.createElement('span');
    burst.className = 'gg-success-burst';
    burst.style.setProperty('--burst-color', color);
    el.style.position = 'relative';
    el.appendChild(burst);
    setTimeout(() => burst.remove(), 700);
  }

  /* ─────────────────────────────────────────────
     13. ENHANCED NUMBER COUNTERS
  ───────────────────────────────────────────── */
  function initEnhancedCounters() {
    const counters = document.querySelectorAll('[data-counter]');
    if (!counters.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          runCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });

    counters.forEach(el => observer.observe(el));
  }

  function runCounter(el) {
    const target  = parseFloat(el.getAttribute('data-counter'));
    const suffix  = el.getAttribute('data-counter-suffix') || '';
    const prefix  = el.getAttribute('data-counter-prefix') || '';
    const decimals= (target % 1 !== 0) ? 1 : 0;
    const duration = parseInt(el.getAttribute('data-counter-duration') || '1400');
    const start   = performance.now();

    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const val = decimals
        ? (target * eased).toFixed(decimals)
        : Math.round(target * eased).toLocaleString();
      el.textContent = prefix + val + suffix;
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = prefix + (decimals ? target.toFixed(decimals) : target.toLocaleString()) + suffix;
    }
    requestAnimationFrame(step);
  }

  /* ─────────────────────────────────────────────
     14. SKELETON LOADER REVEAL
  ───────────────────────────────────────────── */
  function initSkeletonReveal() {
    const skeletons = document.querySelectorAll('[data-skeleton]');
    if (!skeletons.length) return;

    skeletons.forEach(skeleton => {
      const targetId = skeleton.getAttribute('data-skeleton');
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (!target) return;

      // Show skeleton, hide target
      target.style.opacity = '0';
      target.style.transition = `opacity 0.4s ${EASE_OUT}`;

      const observer = new MutationObserver(() => {
        if (target.children.length > 0 || target.textContent.trim()) {
          skeleton.style.opacity = '0';
          setTimeout(() => {
            skeleton.style.display = 'none';
            target.style.opacity = '1';
          }, 300);
          observer.disconnect();
        }
      });
      observer.observe(target, { childList: true, subtree: true });
    });
  }

  /* ─────────────────────────────────────────────
     15. PAGE TRANSITIONS (directional)
  ───────────────────────────────────────────── */
  function initPageTransitions() {
    if (prefersReduced) return;

    // Never hide the whole page on load; JS failure should not blank the UI.
    document.body.style.transition = `opacity 0.3s ${EASE_OUT}`;

    // Intercept internal navigation for smooth exit
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') ||
          href.startsWith('tel:') || a.target === '_blank' ||
          href.startsWith('javascript:') || a.hasAttribute('download')) return;
      if (href.startsWith('http') && !href.includes(location.hostname)) return;

      e.preventDefault();
      document.body.style.opacity = '0';
      setTimeout(() => { window.location = href; }, 200);
    });
  }

  /* ─────────────────────────────────────────────
     17. REACTIVE HOVER LIFT (spring physics)
  ───────────────────────────────────────────── */
  function initHoverLift() {
    if (isTouch || prefersReduced) return;
    const cards = document.querySelectorAll('[data-hover-lift]');
    if (!cards.length) return;

    cards.forEach(card => {
      const intensity = parseFloat(card.getAttribute('data-hover-lift')) || 8;

      card.addEventListener('mouseenter', () => {
        card.style.transition = `transform 0.38s ${EASE_SPRING}, box-shadow 0.38s ${EASE_OUT}`;
        card.style.transform = `translateY(-${intensity}px) scale(1.012)`;
        card.style.boxShadow = `0 ${intensity * 3}px ${intensity * 5}px rgba(0,0,0,0.4), 0 0 ${intensity * 2}px rgba(139,92,246,0.15)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transition = `transform 0.5s ${EASE_OUT}, box-shadow 0.5s ${EASE_OUT}`;
        card.style.transform = '';
        card.style.boxShadow = '';
      });
    });
  }

  /* ─────────────────────────────────────────────
     18. BADGE / LIVE PULSE
  ───────────────────────────────────────────── */
  function initBadgePulse() {
    const badges = document.querySelectorAll('[data-badge-live]');
    badges.forEach(badge => {
      badge.classList.add('gg-live-badge');
    });
  }

  /* ─────────────────────────────────────────────
     19. INPUT FOCUS GLOW
  ───────────────────────────────────────────── */
  function initInputGlow() {
    const inputs = document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select');

    inputs.forEach(input => {
      input.addEventListener('focus', () => {
        const wrapper = input.closest('.input-wrapper, .form-group, .field') || input.parentElement;
        if (wrapper) wrapper.classList.add('input-focused');
      });
      input.addEventListener('blur', () => {
        const wrapper = input.closest('.input-wrapper, .form-group, .field') || input.parentElement;
        if (wrapper) wrapper.classList.remove('input-focused');
      });
    });
  }

  /* ─────────────────────────────────────────────
     20. AMBIENT SPOTLIGHT MESH
  ───────────────────────────────────────────── */
  function initAmbientMesh() {
    if (isTouch || prefersReduced || isMobile) return;

    const mesh = document.createElement('div');
    mesh.id = 'gg-ambient-mesh';
    mesh.setAttribute('aria-hidden', 'true');
    document.body.appendChild(mesh);

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let cx = mx, cy = my;

    document.addEventListener('mousemove', (e) => {
      mx = e.clientX;
      my = e.clientY;
    }, { passive: true });

    function animateMesh() {
      if (document.hidden) return;
      cx = lerp(cx, mx, 0.04);
      cy = lerp(cy, my, 0.04);
      mesh.style.background = `radial-gradient(600px circle at ${cx}px ${cy}px, rgba(139,92,246,0.04) 0%, transparent 70%)`;
      requestAnimationFrame(animateMesh);
    }
    animateMesh();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) requestAnimationFrame(animateMesh);
    });
  }

  /* ─────────────────────────────────────────────
     INJECT MOTION CSS (if not already linked)
  ───────────────────────────────────────────── */
  function injectMotionStyles() {
    // motion.css is linked directly in HTML — nothing to do
  }

  /* ─────────────────────────────────────────────
     EXPOSE PUBLIC API
  ───────────────────────────────────────────── */
  const GGMotion = {
    toast: showToast,
    openModal,
    closeModal,
    pulseSuccess,
    runCounter,
  };

  // Merge into existing GG namespace or create
  if (!global.GG) global.GG = {};
  Object.assign(global.GG, GGMotion);

  /* ─────────────────────────────────────────────
     INIT
  ───────────────────────────────────────────── */
  function init() {
    initCursor();
    initScrollTracker();
    initAdvancedParallax();
    initSpotlight();
    initTabIndicators();
    initAccordions();
    initModals();
    initCtaAttention();
    initSectionOrchestration();
    initHeroEntrance();
    initMicroAnimations();
    initEnhancedCounters();
    initSkeletonReveal();
    initPageTransitions();
    initHoverLift();
    initBadgePulse();
    initInputGlow();
    initAmbientMesh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
