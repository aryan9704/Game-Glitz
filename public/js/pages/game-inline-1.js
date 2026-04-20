(function() {
  'use strict';

  // Extract slug from /game/<slug> path (or ?slug=... fallback)
  const pathMatch = window.location.pathname.match(/^\/game\/([^\/?#]+)/);
  const urlParams = new URLSearchParams(window.location.search);
  const slug = pathMatch ? decodeURIComponent(pathMatch[1]) : urlParams.get('slug') || urlParams.get('id');

  const el = id => document.getElementById(id);
  const escape = s => String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const fmtPrice = p => p === 0 ? 'Free' : '$' + Number(p).toFixed(2);

  function toast(msg, isError) {
    const t = el('gd-toast');
    t.textContent = msg;
    t.classList.toggle('error', !!isError);
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

  function renderStars(rating) {
    const r = Number(rating || 0);
    const full = Math.round(r);
    return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
  }

  function parseArray(val) {
    if (Array.isArray(val)) return val;
    if (typeof val !== 'string' || !val) return [];
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
  }

  function hasAuthToken() {
    try {
      return !!localStorage.getItem('gg_token') || !!sessionStorage.getItem('gg_token');
    } catch {
      return false;
    }
  }

  function _renderGameContent(data) {
    const g = data.game;
    const reviews = data.reviews || [];
    const state = data.userState || {};

    // Compute effective price (sale_price trumps price, even $0)
    const hasSale = g.sale_price !== null && g.sale_price !== undefined;
    const effective = hasSale ? Number(g.sale_price) : Number(g.price || 0);

    // ── Title + hero bg + cover
    document.title = g.title + ' — GameGlitz';
    // Normalize image URL: DB stores relative paths like 'images/x.jpg' which would
    // resolve against /game/<slug>/ — we need absolute paths from site root.
    const imgUrl = g.image
      ? (g.image.startsWith('http') || g.image.startsWith('/') ? g.image : '/' + g.image)
      : '';
    el('gd-hero-bg').style.backgroundImage = imgUrl ? `url("${imgUrl}")` : '';
    el('gd-cover').innerHTML = imgUrl
      ? `<img src="${escape(imgUrl)}" alt="${escape(g.title)} cover art" loading="eager">`
      : '<div class="ggs-ddf60cdcd0">No cover image</div>';

    el('gd-heading').textContent = g.title;

    // ── Badges
    const badges = [];
    if (g.featured)     badges.push('<span class="gd-badge">Featured</span>');
    if (g.trending)     badges.push('<span class="gd-badge">Trending</span>');
    if (g.new_release)  badges.push('<span class="gd-badge">New Release</span>');
    if (g.free_to_play || effective === 0) badges.push('<span class="gd-badge free">Free</span>');
    else if (hasSale)   badges.push('<span class="gd-badge sale">On Sale</span>');
    el('gd-badges').innerHTML = badges.join('');

    // ── Meta (rating + developer + platforms)
    const platforms = parseArray(g.platform);
    const metaParts = [
      `<span class="gd-stars" aria-label="${g.rating || 0} out of 5">${renderStars(g.rating)}</span>
       <span>${Number(g.rating || 0).toFixed(1)} (${g.reviews || 0} reviews)</span>`,
    ];
    if (g.developer) metaParts.push(`<span>· ${escape(g.developer)}</span>`);
    if (platforms.length) metaParts.push(`<span>· ${platforms.map(escape).join(' / ')}</span>`);
    el('gd-meta').innerHTML = metaParts.join('');

    // ── Tags (genres)
    const genres = parseArray(g.genre);
    const tagsHtml = genres.slice(0, 6).map(t => `<span class="gd-tag">${escape(t)}</span>`).join('');
    el('gd-tags').innerHTML = tagsHtml;

    // ── Price row
    let priceHtml = '';
    if (effective === 0) {
      priceHtml = '<div class="gd-price-current">Free</div>';
    } else if (hasSale && Number(g.price) > Number(g.sale_price)) {
      const pct = Math.round(((g.price - g.sale_price) / g.price) * 100);
      priceHtml = `
        <div class="gd-price-current">${fmtPrice(effective)}</div>
        <div class="gd-price-original">${fmtPrice(g.price)}</div>
        <div class="gd-price-discount">-${pct}%</div>`;
    } else {
      priceHtml = `<div class="gd-price-current">${fmtPrice(effective)}</div>`;
    }
    el('gd-price').innerHTML = priceHtml;

    // ── CTAs
    renderCta(g, state);

    // ── Description
    el('gd-description').textContent = g.description || 'No description available.';

    // ── Info cards
    const publisher = g.publisher || g.developer || 'Unknown';
    const release = g.release_date || 'TBA';
    const size = g.size || '—';
    const infoItems = [
      ['Developer',  g.developer || publisher],
      ['Publisher',  publisher],
      ['Release date', release],
      ['Platforms',  platforms.length ? platforms.join(', ') : '—'],
      ['Download size', size],
      ['Genre',      genres.join(', ') || '—'],
    ];
    el('gd-info').innerHTML = infoItems.map(([k, v]) => `
      <div class="gd-info-card">
        <div class="gd-info-card__label">${k}</div>
        <div class="gd-info-card__value">${escape(v)}</div>
      </div>
    `).join('');
    el('gd-info').querySelectorAll('.gd-info-card').forEach(card => {
      card.setAttribute('data-tilt', '4');
      card.setAttribute('data-glow', '');
      card.setAttribute('data-gradient-border', '');
    });

    // ── Trailer (K26)
    const trailerSection = el('gd-trailer-section');
    if (trailerSection && g.trailer_url) {
      const ytMatch = String(g.trailer_url).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch) {
        const iframe = document.createElement('iframe');
        iframe.src = 'https://www.youtube.com/embed/' + ytMatch[1];
        iframe.title = 'Trailer for ' + g.title;
        iframe.loading = 'lazy';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        el('gd-trailer').appendChild(iframe);
        trailerSection.style.display = '';
      }
    }

    // ── Screenshots (K27)
    const screenshotsSection = el('gd-screenshots-section');
    if (screenshotsSection) {
      let shots = [];
      try { shots = JSON.parse(g.screenshots || '[]'); } catch {}
      if (Array.isArray(shots) && shots.length) {
        const container = el('gd-screenshots');
        shots.slice(0, 12).forEach((src, i) => {
          const item = document.createElement('div');
          item.className = 'gd-screenshot-item';
          item.setAttribute('role', 'listitem');
          const img = document.createElement('img');
          img.src = src;
          img.alt = escape(g.title) + ' screenshot ' + (i + 1);
          img.loading = 'lazy';
          img.decoding = 'async';
          item.appendChild(img);
          container.appendChild(item);
        });
        screenshotsSection.style.display = '';
      }
    }

    // ── System requirements (K29)
    const sysreqSection = el('gd-sysreq-section');
    if (sysreqSection && g.system_requirements) {
      let reqs;
      try { reqs = JSON.parse(g.system_requirements); } catch {}
      if (reqs && (reqs.minimum || reqs.recommended)) {
        function renderReqCard(title, specs) {
          if (!specs) return '';
          const rows = Object.entries(specs).map(([k, v]) => `<div class="gd-sysreq-row"><dt>${escape(k)}</dt><dd>${escape(String(v))}</dd></div>`).join('');
          return `<div class="gd-sysreq-card"><h3>${escape(title)}</h3><dl>${rows}</dl></div>`;
        }
        el('gd-sysreq').innerHTML = renderReqCard('Minimum', reqs.minimum) + renderReqCard('Recommended', reqs.recommended);
        sysreqSection.style.display = '';
      }
    }

    // ── Related games (K28)
    const relatedSection = el('gd-related-section');
    const related = data.related || [];
    if (relatedSection && related.length) {
      el('gd-related').innerHTML = related.map(r => {
        const relImg = r.image ? (r.image.startsWith('http') || r.image.startsWith('/') ? r.image : '/' + r.image) : '';
        const relHasSale = r.sale_price !== null && r.sale_price !== undefined;
        const relEff = relHasSale ? Number(r.sale_price) : Number(r.price || 0);
        const relPrice = relEff === 0 ? 'Free' : '$' + relEff.toFixed(2);
        return `<a href="/game/${encodeURIComponent(r.slug || r.id)}" class="gd-related-card" data-tilt="5" data-glow data-gradient-border>
          ${relImg ? `<img class="gd-related-card__img" src="${escape(relImg)}" alt="${escape(r.title)} cover" loading="lazy" decoding="async">` : '<div class="gd-related-card__img"></div>'}
          <div class="gd-related-card__body">
            <div class="gd-related-card__title">${escape(r.title)}</div>
            <div class="gd-related-card__price">${relPrice}</div>
          </div>
        </a>`;
      }).join('');
      relatedSection.style.display = '';
    }

    // ── Reviews
    if (!reviews.length) {
      el('gd-reviews').innerHTML = '<div class="gd-empty">No reviews yet. Be the first to review this game.</div>';
    } else {
      el('gd-reviews').innerHTML = reviews.map(r => `
        <article class="gd-review">
          <header class="gd-review__header">
            <div class="gd-review__avatar">${escape((r.display_name || r.username || '?')[0].toUpperCase())}</div>
            <div>
              <div class="gd-review__name">${escape(r.display_name || r.username)}</div>
              <div class="gd-review__date">${escape((r.created_at || '').slice(0, 10))}</div>
            </div>
            <div class="gd-review__stars" aria-label="${r.rating} out of 5">${renderStars(r.rating)}</div>
          </header>
          ${r.title ? `<div class="gd-review__title">${escape(r.title)}</div>` : ''}
          <div class="gd-review__body">${escape(r.body || '')}</div>
        </article>
      `).join('');
      el('gd-reviews').querySelectorAll('.gd-review').forEach(reviewEl => {
        reviewEl.setAttribute('data-reveal', 'up');
        reviewEl.setAttribute('data-tilt', '4');
        reviewEl.setAttribute('data-glow', '');
        reviewEl.setAttribute('data-gradient-border', '');
      });
    }
  }

  function renderCta(g, state) {
    const cta = el('gd-cta');
    const inCart    = !!state.inCart;
    const owned     = !!state.owned;
    const inWish    = !!state.inWishlist;
    const isLoggedIn = !!window.GG?.Auth?.isLoggedIn || hasAuthToken();

    const parts = [];
    if (owned) {
      parts.push(`<a href="/account.html#library" class="gd-btn gd-btn-primary">✓ In your library — Play</a>`);
    } else if (inCart) {
      parts.push(`<a href="/account.html#cart" class="gd-btn gd-btn-primary">Go to cart</a>`);
    } else {
      parts.push(`<button type="button" class="gd-btn gd-btn-primary" id="gd-add-cart">Add to cart</button>`);
    }
    parts.push(`<button type="button" class="gd-btn gd-btn-ghost" id="gd-wishlist-btn" aria-pressed="${inWish}">${inWish ? '♥ In wishlist' : '♡ Wishlist'}</button>`);
    parts.push(`<button type="button" class="gd-btn gd-btn-ghost gd-btn-icon" id="gd-share-btn" aria-label="Share this game">↗</button>`);
    cta.innerHTML = parts.join('');
    cta.querySelectorAll('.gd-btn').forEach(button => {
      button.setAttribute('data-ripple', '');
      if (!button.classList.contains('gd-btn-icon')) {
        button.setAttribute('data-magnetic', '');
      }
    });

    const addBtn  = el('gd-add-cart');
    const wishBtn = el('gd-wishlist-btn');
    const shareBtn = el('gd-share-btn');

    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        if (!isLoggedIn) { window.location.href = '/account.html#signin'; return; }
        addBtn.disabled = true; addBtn.textContent = 'Adding…';
        try {
          await window.GG.Cart.add(g.id);
          addBtn.textContent = '✓ In cart';
          toast('Added to cart');
          state.inCart = true;
        } catch (err) {
          if (err?.status === 401 || err?.status === 403) { window.location.href = '/account.html#signin'; return; }
          addBtn.disabled = false; addBtn.textContent = 'Add to cart';
          toast(err.error || err.message || 'Could not add', true);
        }
      });
    }

    if (wishBtn) {
      wishBtn.addEventListener('click', async () => {
        if (!isLoggedIn) { window.location.href = '/account.html#signin'; return; }
        try {
          const on = !!(await window.GG.Wishlist.toggle(g.id));
          state.inWishlist = on;
          wishBtn.setAttribute('aria-pressed', on);
          wishBtn.textContent = on ? '♥ In wishlist' : '♡ Wishlist';
          toast(on ? 'Added to wishlist' : 'Removed from wishlist');
        } catch (err) {
          if (err?.status === 401 || err?.status === 403) { window.location.href = '/account.html#signin'; return; }
          toast(err.error || err.message || 'Could not update wishlist', true);
        }
      });
    }

    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        const url = window.location.href;
        const data = { title: g.title + ' on GameGlitz', text: 'Check out ' + g.title, url };
        if (navigator.share) {
          try { await navigator.share(data); } catch {}
        } else {
          try { await navigator.clipboard.writeText(url); toast('Link copied'); }
          catch { toast('Could not copy link', true); }
        }
      });
    }
  }

  function renderNotFound(msg) {
    document.title = 'Game not found — GameGlitz';
    document.querySelector('main').innerHTML = `
      <div class="ggs-9989db0ff0">
        <div class="ggs-3108666870">🎮</div>
        <h2 class="ggs-56e854e6aa">${escape(msg)}</h2>
        <p class="ggs-39a7280cab">The game you're looking for may have been removed or the link may be incorrect.</p>
        <a href="/store.html" class="gd-btn gd-btn-primary ggs-f984c5207e">Browse the store</a>
      </div>
    `;
  }

  // ── Age gate (K21) ──────────────────────────────────────
  const MATURE_RATINGS = new Set(['m', 'ao', 'adults only', 'mature', '18+', 'pegi 18']);
  const AGE_KEY = 'gg_age_ok';

  function isMatureGame(g) {
    if (!g) return false;
    const cr = String(g.content_rating || '').toLowerCase();
    if (MATURE_RATINGS.has(cr)) return true;
    const tags = parseArray(g.tags);
    return tags.some(t => MATURE_RATINGS.has(String(t).toLowerCase()));
  }

  function showAgeGate(g) {
    const gate = el('gd-age-gate');
    if (!gate) return;
    const ratingLabel = el('gd-age-gate-rating');
    if (ratingLabel) ratingLabel.textContent = g.content_rating ? 'Rated ' + g.content_rating + ' (18+)' : 'Mature (18+)';
    gate.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    const confirmBtn = el('gd-age-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        try { localStorage.setItem(AGE_KEY, '1'); } catch {}
        gate.style.display = 'none';
        document.body.style.overflow = '';
      });
    }
  }

  async function renderGame() {
    if (!slug) { return renderNotFound('No game specified.'); }
    let data;
    try { data = await window.GG.Games.get(slug); }
    catch (err) {
      if (err?.status === 404) return renderNotFound('Game not found.');
      return renderNotFound('Could not load this game. Please try again.');
    }
    const g = data.game;
    try {
      if (isMatureGame(g) && !localStorage.getItem(AGE_KEY)) {
        showAgeGate(g);
      }
    } catch {}
    _renderGameContent(data);
  }


  document.addEventListener('DOMContentLoaded', renderGame);
})();
