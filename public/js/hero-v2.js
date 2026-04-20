(function () {
  'use strict';

  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SLIDE_INTERVAL = 6000;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

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

  function initLogoAnim() {
    if (window.__ggLogoAnimed) return;
    const logo = document.querySelector('.nav-logo');
    if (!logo) return;
    window.__ggLogoAnimed = true;
    if (prefersReduced) {
      logo.classList.add('gg-logo-ready');
      return;
    }
    logo.classList.add('gg-logo-anim');
    requestAnimationFrame(() => logo.classList.add('gg-logo-play'));
    window.setTimeout(() => logo.classList.add('gg-logo-ready'), 3700);
  }

  function getFeaturedGames(limit) {
    const db = Array.isArray(window.GAME_DATABASE) ? window.GAME_DATABASE.slice() : [];
    const withImage = db.filter((game) => game && game.image && (game.featured || game.trending));
    withImage.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    return withImage.slice(0, limit || 5);
  }

  function gameHref(game) {
    return `game.html?slug=${encodeURIComponent(game.slug || game.id)}`;
  }

  function priceHtml(game) {
    if (game.salePrice != null && game.salePrice < game.price) {
      return `<span class="hv2-sale">$${game.price.toFixed(2)}</span>$${game.salePrice.toFixed(2)}`;
    }
    return `$${(game.price || 0).toFixed(2)}`;
  }

  function initFeaturedCarousel() {
    const stage = document.querySelector('.hv2-stage');
    const featured = document.querySelector('.hv2-featured');
    const pagination = document.querySelector('.hv2-pagination');
    const satellites = Array.from(document.querySelectorAll('.hv2-satellite'));
    if (!featured) return;
    if (featured.dataset.hv2Ready === 'true') return;
    featured.dataset.hv2Ready = 'true';

    const games = getFeaturedGames(5);
    if (!games.length) return;

    featured.innerHTML = games.map((game, index) => {
      const label = escapeHtml(game.title);
      const badge = game.newRelease ? 'Just Launched' : (game.trending ? 'Trending Now' : 'Featured');
      const genre = escapeHtml(((game.genre || [])[0] || 'Game'));
      return `
        <a
          id="hv2-slide-${index}"
          class="hv2-slide${index === 0 ? ' is-active' : ''}"
          href="${gameHref(game)}"
          data-hv2-bg="${escapeHtml(game.image)}"
          role="tabpanel"
          aria-label="${label}"
          aria-hidden="${index === 0 ? 'false' : 'true'}"
          tabindex="${index === 0 ? '0' : '-1'}"
        >
          <div class="hv2-featured-meta">
            <span class="hv2-featured-badge">${badge}</span>
            <span class="hv2-featured-title">${label}</span>
            <div class="hv2-featured-row">
              <span class="hv2-featured-rating">★ ${(game.rating || 0).toFixed(1)}</span>
              <span>•</span>
              <span>${genre}</span>
            </div>
            <div class="hv2-featured-row">
              <span class="hv2-featured-price">${priceHtml(game)}</span>
            </div>
          </div>
        </a>
      `;
    }).join('');

    if (pagination) {
      pagination.innerHTML = games.map((game, index) => `
        <button
          type="button"
          class="${index === 0 ? 'is-active' : ''}"
          role="tab"
          aria-label="Show ${escapeHtml(game.title)}"
          aria-controls="hv2-slide-${index}"
          aria-selected="${index === 0 ? 'true' : 'false'}"
          tabindex="${index === 0 ? '0' : '-1'}"
        ></button>
      `).join('');
    }

    const slides = Array.from(featured.querySelectorAll('.hv2-slide'));
    slides.forEach((slide) => {
      if (slide.dataset.hv2Bg) setBackgroundImage(slide, slide.dataset.hv2Bg);
    });
    const buttons = pagination ? Array.from(pagination.querySelectorAll('button')) : [];
    let currentIndex = 0;
    let timer = null;
    let paused = false;

    function updateSatellites(index) {
      satellites.forEach((el, offset) => {
        const game = games[(index + 1 + offset) % games.length];
        if (!game) {
          el.classList.add('is-hidden');
          el.removeAttribute('href');
          el.setAttribute('aria-hidden', 'true');
          el.tabIndex = -1;
          return;
        }
        el.classList.remove('is-hidden');
        setBackgroundImage(el, game.image);
        el.setAttribute('href', gameHref(game));
        el.setAttribute('aria-label', game.title);
        el.setAttribute('aria-hidden', 'false');
        el.tabIndex = 0;
      });
    }

    function render(nextIndex) {
      currentIndex = (nextIndex + games.length) % games.length;
      slides.forEach((slide, index) => {
        const active = index === currentIndex;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
        slide.tabIndex = active ? 0 : -1;
      });
      buttons.forEach((button, index) => {
        const active = index === currentIndex;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.tabIndex = active ? 0 : -1;
      });
      updateSatellites(currentIndex);
    }

    function clearTimer() {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function scheduleNext() {
      clearTimer();
      if (prefersReduced || paused || games.length < 2) return;
      timer = window.setTimeout(() => {
        render(currentIndex + 1);
        scheduleNext();
      }, SLIDE_INTERVAL);
    }

    function setPaused(value) {
      paused = value;
      if (stage) stage.classList.toggle('is-paused', value);
      if (value) clearTimer();
      else scheduleNext();
    }

    if (games.length < 2) {
      if (pagination) pagination.hidden = true;
      satellites.forEach((el) => {
        el.classList.add('is-hidden');
        el.setAttribute('aria-hidden', 'true');
        el.tabIndex = -1;
      });
    }

    render(0);
    scheduleNext();

    buttons.forEach((button, index) => {
      button.addEventListener('click', () => {
        render(index);
        if (!paused) scheduleNext();
      });
    });

    if (pagination) {
      pagination.addEventListener('keydown', (event) => {
        if (!buttons.length) return;
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const delta = event.key === 'ArrowRight' ? 1 : -1;
        const nextIndex = (currentIndex + delta + buttons.length) % buttons.length;
        render(nextIndex);
        buttons[nextIndex].focus();
        if (!paused) scheduleNext();
      });
    }

    if (stage) {
      stage.addEventListener('mouseenter', () => setPaused(true));
      stage.addEventListener('mouseleave', () => setPaused(false));
      stage.addEventListener('focusin', () => setPaused(true));
      stage.addEventListener('focusout', () => {
        window.setTimeout(() => {
          if (!stage.contains(document.activeElement)) setPaused(false);
        }, 0);
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimer();
      else if (!paused) scheduleNext();
    });
    window.addEventListener('pagehide', clearTimer, { once: true });
  }

  function initPedestalTilt() {
    if (prefersReduced) return;
    const stage = document.querySelector('.hv2-stage');
    const featured = document.querySelector('.hv2-featured');
    if (!stage || !featured) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let raf = null;

    let rect = stage.getBoundingClientRect();
    const refreshRect = () => { rect = stage.getBoundingClientRect(); };
    window.addEventListener('resize', refreshRect, { passive: true });
    window.addEventListener('scroll', refreshRect, { passive: true, once: false });

    function onMove(event) {
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      targetY = (x - 0.5) * 12;
      targetX = -(y - 0.5) * 10;
      if (!raf) loop();
    }

    function onLeave() {
      targetX = 0;
      targetY = 0;
      if (!raf) loop();
    }

    function loop() {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      featured.style.transform = `translate(-50%, -50%) rotateX(${currentX}deg) rotateY(${currentY}deg)`;
      if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
        raf = requestAnimationFrame(loop);
      } else {
        featured.style.transform = `translate(-50%, -50%) rotateX(${targetX}deg) rotateY(${targetY}deg)`;
        raf = null;
      }
    }

    stage.addEventListener('mousemove', onMove, { passive: true });
    stage.addEventListener('mouseleave', onLeave, { passive: true });
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  ready(() => {
    let tries = 0;
    const navTimer = window.setInterval(() => {
      tries += 1;
      if (document.querySelector('.nav-logo') || tries > 40) {
        window.clearInterval(navTimer);
        initLogoAnim();
      }
    }, 50);

    let dbTries = 0;
    const dbTimer = window.setInterval(() => {
      dbTries += 1;
      if ((window.GAME_DATABASE && window.GAME_DATABASE.length) || dbTries > 60) {
        window.clearInterval(dbTimer);
        initFeaturedCarousel();
        initPedestalTilt();
      }
    }, 80);
  });
})();
