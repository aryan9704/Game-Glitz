/**
 * Game Glitz Motion Engine v6.0
 * Unified, adaptive motion for a premium storefront experience.
 */
;(function () {
  'use strict';

  const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const EASE_IN_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

  const TOKENS = {
    instant: 120,
    hover: 180,
    card: 220,
    reveal: 560,
    section: 780,
    page: 360
  };

  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

  let prefersReduced = reducedQuery.matches;
  let canHover = finePointerQuery.matches;
  const hasTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

  const TILT_CARD_SELECTORS = [
    '.glass-card', '.game-card', '.deal-card', '.category-card', '.forum-category',
    '.group-card', '.event-card', '.clip-card', '.lfg-card', '.leaderboard-card',
    '.pricing-card', '.article-card', '.story-card', '.doc-card', '.kb-cat-card',
    '.quick-action-card', '.response-card', '.sitemap-category', '.profile-card',
    '.order-card', '.security-card', '.match-card', '.player-card', '.vod-card',
    '.news-card', '.feature-card', '.tool-card', '.team-card', '.value-card',
    '.milestone-card', '.award-card', '.job-card', '.gd-info-card', '.gd-review'
  ].join(', ');

  const GLOW_CARD_SELECTORS = [
    TILT_CARD_SELECTORS,
    '.service-row'
  ].join(', ');

  const CTA_SELECTORS = [
    '.btn-primary', '.btn-secondary', '.btn-ghost', '.gd-btn', '.watch-btn',
    '.card-hover-btn', '.card-wishlist-btn', '.hero-ctas a', '.hero-ctas button',
    '.page-chip', '.fab', '#loadMoreBtn', '#carouselPrev', '#carouselNext',
    '.notify-form button', '.quick-action-card'
  ].join(', ');

  const RIPPLE_SELECTORS = [
    'button', '[data-ripple]', '.btn-primary', '.btn-secondary', '.btn-ghost',
    '.gd-btn', '.tab-btn', '.dash-tab', '.cat-nav-btn', '.card-hover-btn',
    '.card-wishlist-btn', '.watch-btn', '.faq-question'
  ].join(', ');

  const TAB_BUTTON_SELECTOR = '.tab-btn, .dash-tab, .cat-nav-btn, [role="tab"], .billing-toggle > span';

  const interactionState = {
    pointerX: window.innerWidth / 2,
    pointerY: window.innerHeight / 2,
    lastPointerX: window.innerWidth / 2,
    lastPointerY: window.innerHeight / 2,
    pointerSpeed: 0,
    lastPointerTime: performance.now()
  };

  const parallaxState = {
    items: new Set(),
    active: new Set(),
    observer: null,
    frame: 0,
    velocity: 0,
    lastScrollY: window.scrollY,
    lastTime: performance.now()
  };

  let revealObserver = null;
  let staggerObserver = null;
  let counterObserver = null;
  let mutationObserver = null;
  let ambientGlow = null;
  let progressBar = null;
  let rippleReady = false;
  let scrollListenerReady = false;
  let smoothScrollReady = false;
  let faqListenerReady = false;
  let mutationRaf = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function toArray(value) {
    return Array.from(value || []);
  }

  function uniqueElements(value) {
    return Array.from(new Set((value || []).filter(Boolean)));
  }

  function onMediaChange(query, handler) {
    if (query.addEventListener) {
      query.addEventListener('change', handler);
    } else if (query.addListener) {
      query.addListener(handler);
    }
  }

  function ensureStyle() {
    // Runtime motion styles live in css/premium.css so CSP can forbid inline style blocks.
  }

  function queryAllWithin(scope, selector) {
    if (!scope || !selector) return [];
    const elements = [];
    if (scope.nodeType === 1 && scope.matches(selector)) {
      elements.push(scope);
    }
    if (scope.querySelectorAll) {
      elements.push(...scope.querySelectorAll(selector));
    }
    return uniqueElements(elements);
  }

  function setCapabilityClasses() {
    const root = document.documentElement;
    root.classList.toggle('gg-reduced-motion', prefersReduced);
    root.classList.toggle('gg-can-hover', canHover && !prefersReduced);
    root.classList.toggle('gg-coarse-pointer', !canHover || hasTouch);
  }

  onMediaChange(reducedQuery, event => {
    prefersReduced = event.matches;
    setCapabilityClasses();
  });

  onMediaChange(finePointerQuery, event => {
    canHover = event.matches;
    setCapabilityClasses();
  });

  function injectGlobalStyles() {
    ensureStyle('gg-engine-styles', `
      body {
        --gg-micro-duration: ${TOKENS.hover}ms;
        --gg-card-duration: ${TOKENS.card}ms;
        --gg-reveal-duration: ${TOKENS.reveal}ms;
      }

      button,
      .btn-primary,
      .btn-secondary,
      .btn-ghost,
      .gd-btn,
      [role="button"] {
        transition:
          background-color var(--gg-micro-duration) ${EASE_OUT},
          color var(--gg-micro-duration) ${EASE_OUT},
          border-color var(--gg-micro-duration) ${EASE_OUT},
          box-shadow var(--gg-card-duration) ${EASE_OUT},
          transform var(--gg-card-duration) ${EASE_OUT},
          opacity var(--gg-micro-duration) ${EASE_OUT},
          filter var(--gg-micro-duration) ${EASE_OUT};
        will-change: transform;
      }

      button:active,
      .btn-primary:active,
      .btn-secondary:active,
      .btn-ghost:active,
      .gd-btn:active {
        transform: scale(0.98);
        transition-duration: ${TOKENS.instant}ms;
      }

      [data-reveal] {
        will-change: transform, opacity, filter;
      }

      [data-stagger] > * {
        will-change: transform, opacity, filter;
      }

      [data-gradient-border],
      [data-glow],
      [data-tilt] {
        position: relative;
        backface-visibility: hidden;
        isolation: isolate;
        overflow: hidden;
      }

      [data-glow]::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: radial-gradient(
          360px circle at var(--glow-x, 50%) var(--glow-y, 50%),
          rgba(139,92,246,0.16) 0%,
          rgba(6,182,212,0.09) 24%,
          transparent 66%
        );
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--gg-micro-duration) ${EASE_OUT};
      }

      [data-gradient-border]::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        padding: 1px;
        background: conic-gradient(
          from var(--gradient-angle, 0deg),
          rgba(139,92,246,0) 0deg,
          rgba(139,92,246,0.48) 74deg,
          rgba(6,182,212,0.42) 144deg,
          rgba(192,132,252,0.46) 214deg,
          rgba(139,92,246,0) 320deg
        );
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--gg-micro-duration) ${EASE_OUT};
        animation: gg-border-spin 6s linear infinite;
      }

      @keyframes gg-border-spin {
        to {
          --gradient-angle: 360deg;
        }
      }

      [data-gradient-border].gg-glow-active::before,
      [data-gradient-border]:is(:hover, :focus-within)::before {
        opacity: 1;
      }

      [data-glow].gg-glow-active::after,
      [data-glow]:is(:hover, :focus-within)::after {
        opacity: max(var(--glow-opacity, 0), 0.78);
      }

      .gg-tab-rail {
        position: relative;
        isolation: isolate;
      }

      .gg-tab-rail > * {
        position: relative;
        z-index: 1;
      }

      .gg-tab-indicator {
        position: absolute;
        inset: 0 auto 0 0;
        width: 0;
        height: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, rgba(139,92,246,0.22), rgba(6,182,212,0.14));
        border: 1px solid rgba(139,92,246,0.26);
        box-shadow: 0 10px 28px rgba(5, 8, 24, 0.35), 0 0 18px rgba(139,92,246,0.14);
        pointer-events: none;
        transform: translate3d(0, 0, 0);
        opacity: 0;
        transition:
          transform var(--gg-card-duration) ${EASE_OUT},
          width var(--gg-card-duration) ${EASE_OUT},
          height var(--gg-card-duration) ${EASE_OUT},
          opacity var(--gg-micro-duration) ${EASE_OUT};
        z-index: 0;
      }

      .gg-tab-rail.gg-tab-ready .gg-tab-indicator {
        opacity: 1;
      }

      .modal-overlay {
        opacity: 0;
        transition: opacity ${TOKENS.page}ms ${EASE_OUT};
      }

      .modal-overlay.active {
        opacity: 1;
      }

      .modal-overlay .modal-box {
        opacity: 0;
        transform: translate3d(0, 24px, 0) scale(0.97);
        filter: blur(10px);
        transition:
          transform ${TOKENS.page}ms ${EASE_OUT},
          opacity ${TOKENS.page}ms ${EASE_OUT},
          filter ${TOKENS.page}ms ${EASE_OUT};
        will-change: transform, opacity, filter;
      }

      .modal-overlay.active .modal-box {
        opacity: 1;
        transform: none;
        filter: none;
      }

      .modal-overlay.gg-modal-exit {
        display: flex !important;
        opacity: 0;
      }

      .modal-overlay.gg-modal-exit .modal-box {
        opacity: 0;
        transform: translate3d(0, 24px, 0) scale(0.97);
        filter: blur(10px);
      }

      .faq-answer {
        opacity: 0.55;
        transition:
          max-height var(--gg-card-duration) ${EASE_OUT},
          opacity var(--gg-micro-duration) ${EASE_OUT};
      }

      .faq-item.open .faq-answer {
        opacity: 1;
      }

      img[loading="lazy"] {
        opacity: 0;
        transform: scale(1.035);
        filter: saturate(0.88) brightness(0.92);
        transition:
          opacity var(--gg-reveal-duration) ${EASE_OUT},
          transform var(--gg-reveal-duration) ${EASE_OUT},
          filter var(--gg-reveal-duration) ${EASE_OUT};
      }

      img[loading="lazy"].gg-loaded {
        opacity: 1;
        transform: none;
        filter: none;
      }

      #gg-progress {
        position: fixed;
        top: 0;
        left: 0;
        width: 0;
        height: 2px;
        background: linear-gradient(90deg, #8B5CF6, #06B6D4);
        z-index: 10000;
        transition: width ${TOKENS.instant}ms ${EASE_OUT};
        pointer-events: none;
      }

      @media (max-width: 900px) {
        .gg-tab-indicator {
          inset: 2px auto 2px 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        [data-reveal],
        [data-stagger] > *,
        .modal-overlay .modal-box,
        img[loading="lazy"] {
          transition-duration: 1ms !important;
          animation-duration: 1ms !important;
        }

        [data-reveal],
        [data-stagger] > * {
          opacity: 1 !important;
          transform: none !important;
          filter: none !important;
        }

        .gg-tab-indicator,
        #ambient-glow,
        #gg-progress {
          display: none !important;
        }
      }
    `);
  }

  function autoEnhance(scope) {
    queryAllWithin(scope, TILT_CARD_SELECTORS).forEach(el => {
      if (!el.hasAttribute('data-tilt')) {
        el.setAttribute('data-tilt', el.classList.contains('pricing-card') ? '6' : '5');
      }
      if (!el.hasAttribute('data-gradient-border')) {
        el.setAttribute('data-gradient-border', '');
      }
    });

    queryAllWithin(scope, GLOW_CARD_SELECTORS).forEach(el => {
      if (!el.hasAttribute('data-glow')) {
        el.setAttribute('data-glow', '');
      }
    });

    queryAllWithin(scope, CTA_SELECTORS).forEach(el => {
      if (!el.hasAttribute('data-magnetic')) {
        const strength = el.matches('.quick-action-card, .page-chip') ? '0.16' : '0.22';
        el.setAttribute('data-magnetic', strength);
      }
      if (!el.hasAttribute('data-ripple')) {
        el.setAttribute('data-ripple', '');
      }
    });

    queryAllWithin(scope, RIPPLE_SELECTORS).forEach(el => {
      if (!el.hasAttribute('data-ripple')) {
        el.setAttribute('data-ripple', '');
      }
    });
  }

  function initScrollReveal(scope) {
    const elements = queryAllWithin(scope, '[data-reveal]');
    if (!elements.length) return;

    if (prefersReduced) {
      elements.forEach(el => {
        el.style.opacity = '1';
        el.style.transform = 'none';
        el.style.filter = 'none';
      });
      return;
    }

    if (!revealObserver) {
      revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const target = entry.target;
          requestAnimationFrame(() => {
            target.style.opacity = '1';
            target.style.transform = 'none';
            target.style.filter = 'none';
          });
          revealObserver.unobserve(target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    }

    const initialTransform = {
      '': 'translate3d(0, 28px, 0)',
      'up': 'translate3d(0, 28px, 0)',
      'down': 'translate3d(0, -22px, 0)',
      'left': 'translate3d(-28px, 0, 0)',
      'right': 'translate3d(28px, 0, 0)',
      'scale': 'scale(0.96)',
      'fade': 'none'
    };

    elements.forEach(el => {
      if (el.dataset.ggRevealReady === 'true') return;
      el.dataset.ggRevealReady = 'true';

      const direction = (el.getAttribute('data-reveal') || '').trim().toLowerCase();
      const transform = initialTransform[direction] || initialTransform.up;
      const delay = parseInt(el.getAttribute('data-reveal-delay') || '0', 10);

      el.style.opacity = '0';
      el.style.filter = 'blur(10px)';
      if (transform !== 'none') {
        el.style.transform = transform;
      }
      el.style.transition = `opacity ${TOKENS.reveal}ms ${EASE_OUT}, transform ${TOKENS.reveal}ms ${EASE_OUT}, filter ${TOKENS.reveal}ms ${EASE_OUT}`;
      if (delay > 0) {
        el.style.transitionDelay = `${delay}ms`;
      }

      revealObserver.observe(el);
    });
  }

  function initStagger(scope) {
    const containers = queryAllWithin(scope, '[data-stagger]');
    if (!containers.length) return;

    if (prefersReduced) {
      containers.forEach(container => {
        toArray(container.children).forEach(child => {
          child.style.opacity = '1';
          child.style.transform = 'none';
          child.style.filter = 'none';
        });
      });
      return;
    }

    if (!staggerObserver) {
      staggerObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const children = toArray(entry.target.children);
          children.forEach(child => {
            requestAnimationFrame(() => {
              child.style.opacity = '1';
              child.style.transform = 'none';
              child.style.filter = 'none';
            });
          });
          staggerObserver.unobserve(entry.target);
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });
    }

    containers.forEach(container => {
      if (container.dataset.ggStaggerReady === 'true') return;
      container.dataset.ggStaggerReady = 'true';

      toArray(container.children).forEach((child, index) => {
        child.style.opacity = '0';
        child.style.transform = 'translate3d(0, 20px, 0)';
        child.style.filter = 'blur(8px)';
        child.style.transition = `opacity ${TOKENS.reveal}ms ${EASE_OUT}, transform ${TOKENS.reveal}ms ${EASE_OUT}, filter ${TOKENS.reveal}ms ${EASE_OUT}`;
        child.style.transitionDelay = `${index * 70}ms`;
      });

      staggerObserver.observe(container);
    });
  }

  function bindAdaptivePointerMotion(element, onFrame, onReset) {
    let frame = 0;
    let active = false;
    let rect = null;
    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;

    const render = () => {
      const boost = clamp(interactionState.pointerSpeed / 1.4, 0, 1);
      const follow = active ? 0.18 + (boost * 0.22) : 0.12 + (boost * 0.08);

      currentX = lerp(currentX, targetX, follow);
      currentY = lerp(currentY, targetY, follow);

      onFrame({
        x: currentX,
        y: currentY,
        strength: Math.max(Math.abs(currentX), Math.abs(currentY)),
        boost,
        active
      });

      if (!active && Math.abs(currentX - targetX) < 0.002 && Math.abs(currentY - targetY) < 0.002) {
        frame = 0;
        if (onReset) onReset();
        return;
      }

      frame = requestAnimationFrame(render);
    };

    const ensure = () => {
      if (!frame) {
        frame = requestAnimationFrame(render);
      }
    };

    element.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      rect = element.getBoundingClientRect();
      active = true;
      ensure();
    });

    element.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      rect = rect || element.getBoundingClientRect();
      const relativeX = ((event.clientX - rect.left) / rect.width) - 0.5;
      const relativeY = ((event.clientY - rect.top) / rect.height) - 0.5;
      targetX = clamp(relativeX * 2, -1, 1);
      targetY = clamp(relativeY * 2, -1, 1);
      active = true;
      ensure();
    }, { passive: true });

    element.addEventListener('pointerleave', () => {
      active = false;
      targetX = 0;
      targetY = 0;
      rect = null;
      ensure();
    });

    window.addEventListener('scroll', () => {
      rect = null;
    }, { passive: true });
  }

  function initCardTilt(scope) {
    if (!canHover || prefersReduced) return;

    queryAllWithin(scope, '[data-tilt]').forEach(card => {
      if (card.dataset.ggTiltReady === 'true') return;
      card.dataset.ggTiltReady = 'true';

      const maxTilt = parseFloat(card.getAttribute('data-tilt') || '5');

      bindAdaptivePointerMotion(card, state => {
        const rotateY = state.x * maxTilt;
        const rotateX = -state.y * maxTilt;
        const translateX = state.x * 5;
        const translateY = (-state.y * 5) - (6 + (state.boost * 4));
        const scale = 1 + (state.strength * 0.016) + (state.boost * 0.012);

        card.style.transform = `perspective(1200px) translate3d(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px, 0) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(${scale.toFixed(3)}, ${scale.toFixed(3)}, ${scale.toFixed(3)})`;
      }, () => {
        card.style.transform = '';
      });
    });
  }

  function initMagnetic(scope) {
    if (!canHover || prefersReduced) return;

    queryAllWithin(scope, '[data-magnetic]').forEach(element => {
      if (element.dataset.ggMagneticReady === 'true') return;
      element.dataset.ggMagneticReady = 'true';

      const strength = parseFloat(element.getAttribute('data-magnetic') || '0.22');

      bindAdaptivePointerMotion(element, state => {
        const pullX = state.x * strength * 26;
        const pullY = state.y * strength * 18;
        const scale = 1 + (state.boost * 0.015);
        element.style.transform = `translate3d(${pullX.toFixed(2)}px, ${pullY.toFixed(2)}px, 0) scale3d(${scale.toFixed(3)}, ${scale.toFixed(3)}, ${scale.toFixed(3)})`;
      }, () => {
        element.style.transform = '';
      });
    });
  }

  function initCounters(scope) {
    const counters = queryAllWithin(scope, '[data-count]');
    if (!counters.length) return;

    if (!counterObserver) {
      counterObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        });
      }, { threshold: 0.3 });
    }

    counters.forEach(counter => {
      if (counter.dataset.ggCountReady === 'true') return;
      counter.dataset.ggCountReady = 'true';
      counterObserver.observe(counter);
    });
  }

  function animateCounter(element) {
    const target = parseFloat(element.getAttribute('data-count') || '0');
    if (!Number.isFinite(target)) return;

    const suffix = element.getAttribute('data-count-suffix') || '';
    const prefix = element.getAttribute('data-count-prefix') || '';
    const duration = prefersReduced ? 1 : 1200;
    const start = performance.now();

    function frame(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const value = target % 1 !== 0
        ? (target * eased).toFixed(1)
        : Math.round(target * eased);
      element.textContent = `${prefix}${Number(value).toLocaleString()}${suffix}`;
      if (progress < 1) {
        requestAnimationFrame(frame);
      }
    }

    requestAnimationFrame(frame);
  }

  function initParallax(scope) {
    if (prefersReduced || !canHover) return;

    if (!parallaxState.observer) {
      parallaxState.observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            parallaxState.active.add(entry.target);
          } else {
            parallaxState.active.delete(entry.target);
          }
        });
        scheduleParallaxFrame();
      }, { threshold: 0, rootMargin: '10% 0px 10% 0px' });
    }

    queryAllWithin(scope, '[data-parallax]').forEach(element => {
      if (element.dataset.ggParallaxReady === 'true') return;
      element.dataset.ggParallaxReady = 'true';
      element._ggParallaxCurrent = 0;
      parallaxState.items.add(element);
      parallaxState.observer.observe(element);
    });

    if (!scrollListenerReady) {
      scrollListenerReady = true;
      window.addEventListener('scroll', updateParallaxVelocity, { passive: true });
      window.addEventListener('resize', scheduleParallaxFrame, { passive: true });
      scheduleParallaxFrame();
    }
  }

  function updateParallaxVelocity() {
    const now = performance.now();
    const scrollY = window.scrollY;
    const dt = Math.max(now - parallaxState.lastTime, 16);
    parallaxState.velocity = Math.abs(scrollY - parallaxState.lastScrollY) / dt;
    parallaxState.lastScrollY = scrollY;
    parallaxState.lastTime = now;
    scheduleParallaxFrame();
  }

  function scheduleParallaxFrame() {
    if (parallaxState.frame) return;
    parallaxState.frame = requestAnimationFrame(renderParallax);
  }

  function renderParallax() {
    parallaxState.frame = 0;
    if (!parallaxState.active.size) return;

    let needsAnotherFrame = false;
    const catchUp = clamp(0.1 + (parallaxState.velocity * 0.18), 0.1, 0.32);

    parallaxState.active.forEach(element => {
      const speed = parseFloat(element.getAttribute('data-parallax') || '0.12');
      const rect = element.getBoundingClientRect();
      const center = rect.top + (rect.height / 2);
      const targetOffset = (center - (window.innerHeight / 2)) * speed;

      element._ggParallaxCurrent = lerp(element._ggParallaxCurrent || 0, targetOffset, catchUp);
      element.style.transform = `translate3d(0, ${element._ggParallaxCurrent.toFixed(2)}px, 0)`;

      if (Math.abs((element._ggParallaxCurrent || 0) - targetOffset) > 0.4) {
        needsAnotherFrame = true;
      }
    });

    if (needsAnotherFrame) {
      scheduleParallaxFrame();
    }
  }

  function initAmbientGlow() {
    if (ambientGlow || prefersReduced || !canHover) return;

    ambientGlow = document.createElement('div');
    ambientGlow.id = 'ambient-glow';
    ambientGlow.setAttribute('aria-hidden', 'true');
    Object.assign(ambientGlow.style, {
      position: 'fixed',
      width: '560px',
      height: '560px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(139,92,246,0.11) 0%, rgba(6,182,212,0.07) 24%, rgba(99,102,241,0.03) 44%, transparent 72%)',
      pointerEvents: 'none',
      zIndex: '0',
      opacity: '0',
      transform: 'translate3d(-9999px, -9999px, 0)',
      transition: `opacity ${TOKENS.card}ms ${EASE_OUT}`
    });
    document.body.appendChild(ambientGlow);

    let currentX = interactionState.pointerX;
    let currentY = interactionState.pointerY;
    let targetX = interactionState.pointerX;
    let targetY = interactionState.pointerY;
    let frame = 0;
    let visible = false;

    const render = () => {
      const boost = clamp(interactionState.pointerSpeed / 1.5, 0, 1);
      const follow = 0.14 + (boost * 0.2);
      currentX = lerp(currentX, targetX, follow);
      currentY = lerp(currentY, targetY, follow);

      ambientGlow.style.transform = `translate3d(${(currentX - 280).toFixed(2)}px, ${(currentY - 280).toFixed(2)}px, 0)`;
      frame = 0;

      if (visible) {
        frame = requestAnimationFrame(render);
      }
    };

    const ensure = () => {
      if (!frame) {
        frame = requestAnimationFrame(render);
      }
    };

    document.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      targetX = event.clientX;
      targetY = event.clientY;
      visible = true;
      ambientGlow.style.opacity = '1';
      ensure();
    }, { passive: true });

    document.addEventListener('pointerdown', () => {
      visible = true;
      ambientGlow.style.opacity = '1';
      ensure();
    }, { passive: true });

    document.addEventListener('pointerleave', () => {
      visible = false;
      ambientGlow.style.opacity = '0';
    });

    window.addEventListener('blur', () => {
      visible = false;
      ambientGlow.style.opacity = '0';
    });
  }

  function initRipple() {
    if (rippleReady) return;
    rippleReady = true;

    ensureStyle('gg-ripple-styles', `
      .gg-ripple {
        position: absolute;
        border-radius: 999px;
        background: radial-gradient(circle, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.14) 38%, transparent 70%);
        transform: scale(0);
        opacity: 0.8;
        animation: gg-ripple-expand 520ms ${EASE_OUT} forwards;
        pointer-events: none;
      }

      @keyframes gg-ripple-expand {
        to {
          transform: scale(2.7);
          opacity: 0;
        }
      }
    `);

    document.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const target = event.target.closest(RIPPLE_SELECTORS);
      if (!target) return;
      if (target.disabled || target.getAttribute('aria-disabled') === 'true') return;

      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.18;
      const ripple = document.createElement('span');
      ripple.className = 'gg-ripple';
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - (size / 2)}px`;
      ripple.style.top = `${event.clientY - rect.top - (size / 2)}px`;

      if (getComputedStyle(target).position === 'static') {
        target.style.position = 'relative';
      }
      target.style.overflow = 'hidden';
      target.appendChild(ripple);

      window.setTimeout(() => ripple.remove(), 560);
    }, { passive: true });
  }

  function initTextShimmer() {
    ensureStyle('gg-text-shimmer', `
      [data-shimmer] {
        background: linear-gradient(110deg, currentColor 30%, rgba(139,92,246,0.95) 48%, rgba(6,182,212,0.92) 52%, currentColor 70%);
        background-size: 250% 100%;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: gg-shimmer 4s ease-in-out infinite;
      }

      @keyframes gg-shimmer {
        0%, 100% { background-position: 100% center; }
        50% { background-position: 0% center; }
      }
    `);
  }

  function initSmoothScroll() {
    if (smoothScrollReady) return;
    smoothScrollReady = true;

    document.addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const id = link.getAttribute('href').slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
    });
  }

  function initCardGlow(scope) {
    if (!canHover || prefersReduced) return;

    queryAllWithin(scope, '[data-glow]').forEach(card => {
      if (card.dataset.ggGlowReady === 'true') return;
      card.dataset.ggGlowReady = 'true';

      card.style.setProperty('--glow-opacity', '0');
      card.style.setProperty('--glow-x', '50%');
      card.style.setProperty('--glow-y', '50%');

      card.addEventListener('pointerenter', event => {
        if (event.pointerType === 'touch') return;
        card.classList.add('gg-glow-active');
      });

      card.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch') return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--glow-x', `${event.clientX - rect.left}px`);
        card.style.setProperty('--glow-y', `${event.clientY - rect.top}px`);
        card.style.setProperty('--glow-opacity', `${(0.5 + clamp(interactionState.pointerSpeed / 1.4, 0, 1) * 0.35).toFixed(3)}`);
      }, { passive: true });

      card.addEventListener('pointerleave', () => {
        card.classList.remove('gg-glow-active');
        card.style.setProperty('--glow-opacity', '0');
      });
    });
  }

  function initGradientBorder() {
    if (!window.CSS || !CSS.registerProperty) return;
    try {
      CSS.registerProperty({
        name: '--gradient-angle',
        syntax: '<angle>',
        initialValue: '0deg',
        inherits: false
      });
    } catch (error) {
      // Ignore duplicate registration.
    }
  }

  function initProgressBar() {
    if (progressBar || prefersReduced) return;

    progressBar = document.createElement('div');
    progressBar.id = 'gg-progress';
    progressBar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(progressBar);

    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
      progressBar.style.width = `${progress}%`;
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
  }

  function initImageReveal(scope) {
    queryAllWithin(scope, 'img[loading="lazy"]').forEach(image => {
      if (image.dataset.ggImageReady === 'true') return;
      image.dataset.ggImageReady = 'true';

      const markReady = () => image.classList.add('gg-loaded');
      if (image.complete) {
        markReady();
      } else {
        image.addEventListener('load', markReady, { once: true });
        image.addEventListener('error', markReady, { once: true });
      }
    });
  }

  function isTabButtonActive(button) {
    return button.classList.contains('active') || button.getAttribute('aria-selected') === 'true';
  }

  function getTabContainers(scope) {
    const containers = new Set(queryAllWithin(scope, '[data-tab-rail]'));

    queryAllWithin(scope, TAB_BUTTON_SELECTOR).forEach(button => {
      const parent = button.parentElement;
      if (!parent) return;
      const siblings = toArray(parent.children).filter(child => child.matches && child.matches(TAB_BUTTON_SELECTOR));
      if (siblings.length >= 2) {
        containers.add(parent);
      }
    });

    return Array.from(containers);
  }

  function refreshTabRail(container) {
    const indicator = container.querySelector(':scope > .gg-tab-indicator');
    if (!indicator) return;

    const buttons = toArray(container.children).filter(child => child.matches && child.matches(TAB_BUTTON_SELECTOR));
    if (!buttons.length) return;

    const active = buttons.find(isTabButtonActive) || buttons[0];
    const containerRect = container.getBoundingClientRect();
    const rect = active.getBoundingClientRect();
    const translateX = rect.left - containerRect.left;
    const translateY = rect.top - containerRect.top;

    indicator.style.width = `${rect.width}px`;
    indicator.style.height = `${rect.height}px`;
    indicator.style.borderRadius = getComputedStyle(active).borderRadius;
    indicator.style.transform = `translate3d(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px, 0)`;
    container.classList.add('gg-tab-ready');
  }

  function initTabRails(scope) {
    getTabContainers(scope).forEach(container => {
      if (container.dataset.ggTabRailReady === 'true') {
        refreshTabRail(container);
        return;
      }

      container.dataset.ggTabRailReady = 'true';
      container.classList.add('gg-tab-rail');

      const indicator = document.createElement('div');
      indicator.className = 'gg-tab-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      container.insertBefore(indicator, container.firstChild);

      const update = () => refreshTabRail(container);
      container._ggTabUpdate = update;

      container.addEventListener('click', () => {
        window.setTimeout(update, 0);
      });

      container.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          window.setTimeout(update, 0);
        }
      });

      if (window.ResizeObserver) {
        const observer = new ResizeObserver(update);
        observer.observe(container);
        toArray(container.children).forEach(child => observer.observe(child));
        container._ggTabResizeObserver = observer;
      }

      update();
    });
  }

  function initAccordionMeasurements(scope) {
    queryAllWithin(scope, '.faq-item').forEach(item => {
      if (item.dataset.ggFaqReady === 'true') return;
      item.dataset.ggFaqReady = 'true';

      const answer = item.querySelector('.faq-answer');
      const inner = answer && answer.firstElementChild;
      if (!answer || !inner) return;

      const sync = () => {
        if (item.classList.contains('open')) {
          answer.style.maxHeight = `${inner.scrollHeight}px`;
        }
      };

      if (window.ResizeObserver) {
        const observer = new ResizeObserver(sync);
        observer.observe(inner);
        item._ggFaqResizeObserver = observer;
      }

      sync();
    });

    if (!faqListenerReady) {
      faqListenerReady = true;
      document.addEventListener('click', event => {
        const trigger = event.target.closest('.faq-question');
        if (!trigger) return;
        requestAnimationFrame(() => initAccordionMeasurements(document));
      }, true);
    }
  }

  function patchModalAPI() {
    const ui = window.GG && window.GG.UI;
    if (!ui || ui._ggMotionPatched) return;

    const originalShow = ui.showModal;
    const originalHide = ui.hideModal;

    ui.showModal = function showModalWithMotion(id) {
      const modal = document.getElementById(id);
      if (modal) {
        modal.classList.remove('gg-modal-exit');
        delete modal.dataset.ggModalClosing;
      }
      originalShow.call(this, id);
    };

    ui.hideModal = function hideModalWithMotion(id) {
      const modal = document.getElementById(id);
      if (!modal || modal.dataset.ggModalClosing === 'true') {
        originalHide.call(this, id);
        return;
      }

      modal.dataset.ggModalClosing = 'true';
      modal.classList.add('gg-modal-exit');

      window.setTimeout(() => {
        originalHide.call(this, id);
        modal.classList.remove('gg-modal-exit');
        delete modal.dataset.ggModalClosing;
      }, 220);
    };

    ui._ggMotionPatched = true;
  }

  function scheduleMutationRefresh() {
    if (mutationRaf) return;
    mutationRaf = requestAnimationFrame(() => {
      mutationRaf = 0;
      initAll(document);
      patchModalAPI();
      scheduleParallaxFrame();
    });
  }

  function observeMutations() {
    if (mutationObserver || !document.body) return;

    mutationObserver = new MutationObserver(mutations => {
      const needsRefresh = mutations.some(mutation =>
        toArray(mutation.addedNodes).some(node => node.nodeType === 1)
      );
      if (needsRefresh) {
        scheduleMutationRefresh();
      }
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function initPointerTracking() {
    document.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      const now = performance.now();
      const dt = Math.max(now - interactionState.lastPointerTime, 16);
      const distance = Math.hypot(event.clientX - interactionState.lastPointerX, event.clientY - interactionState.lastPointerY);

      interactionState.pointerSpeed = distance / dt;
      interactionState.pointerX = event.clientX;
      interactionState.pointerY = event.clientY;
      interactionState.lastPointerX = event.clientX;
      interactionState.lastPointerY = event.clientY;
      interactionState.lastPointerTime = now;
    }, { passive: true });
  }

  function initAll(scope) {
    autoEnhance(scope);
    initScrollReveal(scope);
    initStagger(scope);
    initCardTilt(scope);
    initMagnetic(scope);
    initCounters(scope);
    initParallax(scope);
    initCardGlow(scope);
    initImageReveal(scope);
    initTabRails(scope);
    initAccordionMeasurements(scope);
  }

  function init() {
    setCapabilityClasses();
    injectGlobalStyles();
    initPointerTracking();
    initAll(document);
    initAmbientGlow();
    initRipple();
    initTextShimmer();
    initSmoothScroll();
    initGradientBorder();
    initProgressBar();
    patchModalAPI();
    observeMutations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then(registration => registration.update())
        .catch(() => {});
    });
  }

  // Clean up observers on page unload to prevent memory leaks
  window.addEventListener('pagehide', () => {
    if (revealObserver) { revealObserver.disconnect(); revealObserver = null; }
    if (staggerObserver) { staggerObserver.disconnect(); staggerObserver = null; }
    if (counterObserver) { counterObserver.disconnect(); counterObserver = null; }
    if (parallaxState.observer) { parallaxState.observer.disconnect(); parallaxState.observer = null; }
    if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }
  });
})();
