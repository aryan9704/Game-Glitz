(function() {
  'use strict';

  /* ══════════════════════════════════════
     STATE
     ══════════════════════════════════════ */
  const PAGE_SIZE = 24;
  let _filteredGames = [];
  let _renderedCount = 0;
  let _filters = { search: '', genre: '', platform: '', priceRange: null, onSale: false, sort: '' };
  let _carouselIndex = 0;
  let _carouselTimer = null;
  let _featuredGames = [];

  /* ══════════════════════════════════════
     UTILITY HELPERS
     ══════════════════════════════════════ */
  function renderStars(rating) {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    const empty = 5 - full - (half ? 1 : 0);
    return '★'.repeat(full) + (half ? '⯨' : '') + '☆'.repeat(empty);
  }

  function formatPrice(price) {
    if (price === 0) return 'Free';
    return '$' + price.toFixed(2);
  }

  function getPriceRange(code) {
    switch (code) {
      case 'free': return [0, 0];
      case 'u10': return [0.01, 9.99];
      case 'u20': return [0, 19.99];
      case 'u30': return [0, 29.99];
      case '30-60': return [30, 60];
      case '60p': return [60, 999];
      default: return null;
    }
  }

  function salePercent(game) {
    if (!game.salePrice || game.price === 0) return 0;
    return Math.round((1 - game.salePrice / game.price) * 100);
  }

  function escapeHtml(str) {
    return String(str ?? '')
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

  function getPlatformLabel(p) {
    const map = { PC: 'PC', PS5: 'PS5', Xbox: 'XB', Switch: 'SW', Mobile: 'MOB', 'PC VR': 'VR', 'PS VR2': 'VR', 'Meta Quest': 'VR' };
    return map[p] || p;
  }

  function systemRequirementsFor(game) {
    const platform = (game.platform || []).includes('PC') ? 'Windows 10/11 (64-bit)' : 'Platform-specific runtime';
    const base = Number((game.size || '0').replace(/[^\d.]/g, '')) || 20;
    return {
      os: platform,
      cpu: base > 80 ? 'Intel Core i7 / Ryzen 7 (6+ cores)' : 'Intel Core i5 / Ryzen 5',
      ram: base > 80 ? '16 GB RAM' : '8 GB RAM',
      gpu: base > 80 ? 'RTX 2060 / RX 5700 or better' : 'GTX 1060 / RX 580 or better',
      storage: game.size || '20 GB',
      network: (game.tags || []).some(t => /multiplayer|online|co-op/i.test(t)) ? 'Broadband Internet connection' : 'Not required for single-player',
    };
  }

  function screenshotsFor(game) {
    const db = window.GAME_DATABASE || [];
    const related = db
      .filter(g => g.id !== game.id && (g.genre || []).some(x => (game.genre || []).includes(x)))
      .slice(0, 3)
      .map(g => g.image);
    return [game.image, ...related].slice(0, 4);
  }

  function relatedGamesFor(game) {
    const db = window.GAME_DATABASE || [];
    return db
      .filter(g => g.id !== game.id)
      .map(g => {
        const sharedGenres = (g.genre || []).filter(x => (game.genre || []).includes(x)).length;
        const ratingBoost = (g.rating || 0) * 0.1;
        return { g, score: sharedGenres * 2 + ratingBoost };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(x => x.g);
  }

  /* ══════════════════════════════════════
     CAROUSEL
     ══════════════════════════════════════ */
  function buildCarousel() {
    const db = window.GAME_DATABASE || [];
    _featuredGames = db.filter(g => g.featured).slice(0, 4);
    if (_featuredGames.length < 2) _featuredGames = db.slice(0, 4);

    const carousel = document.querySelector('.hero-carousel');
    const dotsWrap = document.getElementById('carouselDots');

    _featuredGames.forEach((game, i) => {
      const slide = document.createElement('div');
      slide.className = 'hero-slide' + (i === 0 ? ' active' : '');
      slide.setAttribute('role', 'tabpanel');
      slide.setAttribute('aria-hidden', i !== 0 ? 'true' : 'false');

      const pct = salePercent(game);
      const priceHTML = game.price === 0
        ? '<span class="hero-price-current">Free to Play</span>'
        : game.salePrice
          ? `<span class="hero-sale-badge">-${pct}%</span>
             <span class="hero-price-original">${formatPrice(game.price)}</span>
             <span class="hero-price-current">${formatPrice(game.salePrice)}</span>`
          : `<span class="hero-price-current">${formatPrice(game.price)}</span>`;

      slide.innerHTML = `
        <div class="hero-slide__bg" data-hero-bg="${escapeHtml(game.image)}" data-parallax="0.1"></div>
        <div class="hero-slide__overlay"></div>
        <div class="hero-slide__content" data-tilt="5">
          <div class="hero-badge">Featured</div>
          <h2 class="hero-title">${escapeHtml(game.title)}</h2>
          <div class="hero-meta">
            <span class="hero-stars">${renderStars(game.rating)}</span>
            <div class="hero-tags">
              ${(game.genre || []).slice(0, 3).map(g => `<span class="hero-tag">${escapeHtml(g)}</span>`).join('')}
            </div>
          </div>
          <p class="hero-description">${escapeHtml(game.description)}</p>
          <div class="hero-price-row">${priceHTML}</div>
          <div class="hero-actions">
            <button type="button" class="btn-hero-primary" data-hero-cart="${game.id}">
              ${GG.Library.owns(game.id) ? '✓ In Library' : GG.Cart.has(game.id) ? '✓ In Cart' : '🛒 Add to Cart'}
            </button>
            <button type="button" class="btn-hero-secondary" data-hero-view="${game.id}">View Details</button>
          </div>
        </div>
      `;
      setBackgroundImage(slide.querySelector('[data-hero-bg]'), game.image);
      carousel.insertBefore(slide, document.getElementById('carouselPrev'));

      // Dot
      const dot = document.createElement('button');
      dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      dot.setAttribute('aria-label', `Slide ${i + 1}: ${game.title}`);
      dot.addEventListener('click', () => goToSlide(i));
      dotsWrap.appendChild(dot);
    });

    document.getElementById('carouselPrev').addEventListener('click', () => prevSlide());
    document.getElementById('carouselNext').addEventListener('click', () => nextSlide());

    startCarouselTimer();
    attachCarouselActions();
  }

  function goToSlide(idx) {
    const slides = document.querySelectorAll('.hero-slide');
    const dots = document.querySelectorAll('.carousel-dot');
    slides.forEach((s, i) => {
      s.classList.toggle('active', i === idx);
      s.setAttribute('aria-hidden', i !== idx ? 'true' : 'false');
    });
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === idx);
      d.setAttribute('aria-selected', i === idx ? 'true' : 'false');
    });
    _carouselIndex = idx;
    resetCarouselTimer();
  }

  function nextSlide() {
    goToSlide((_carouselIndex + 1) % _featuredGames.length);
  }

  function prevSlide() {
    goToSlide((_carouselIndex - 1 + _featuredGames.length) % _featuredGames.length);
  }

  function startCarouselTimer() {
    _carouselTimer = setInterval(nextSlide, 6000);
  }

  function resetCarouselTimer() {
    clearInterval(_carouselTimer);
    startCarouselTimer();
  }

  function attachCarouselActions() {
    document.querySelector('.hero-carousel').addEventListener('click', function(e) {
      const cartBtn = e.target.closest('[data-hero-cart]');
      const viewBtn = e.target.closest('[data-hero-view]');
      if (cartBtn) {
        const game = getGameById(+cartBtn.dataset.heroCart);
        if (game) handleAddToCart(game, cartBtn);
      }
      if (viewBtn) {
        const game = getGameById(+viewBtn.dataset.heroView);
        if (game) openQuickView(game);
      }
    });
  }

  /* ══════════════════════════════════════
     DEALS SECTION
     ══════════════════════════════════════ */
  function buildDeals() {
    const db = window.GAME_DATABASE || [];
    const deals = db.filter(g => g.salePrice).sort((a, b) => salePercent(b) - salePercent(a)).slice(0, 16);
    const track = document.getElementById('dealsTrack');

    deals.forEach(game => {
      const card = document.createElement('div');
      card.className = 'deal-card';
      card.setAttribute('role', 'listitem');
      card.innerHTML = `
        <img class="deal-card__img" src="${game.image}" alt="${game.title}" loading="lazy" decoding="async" data-csp-onerror="this.src='images/bg.webp'">
        <div class="deal-card__body">
          <div class="deal-card__title">${escapeHtml(game.title)}</div>
          <div class="deal-card__prices">
            <span class="deal-pct">-${salePercent(game)}%</span>
            <span class="deal-original">${formatPrice(game.price)}</span>
            <span class="deal-sale">${formatPrice(game.salePrice)}</span>
          </div>
        </div>
      `;
      card.addEventListener('click', () => openQuickView(game));
      track.appendChild(card);
    });

    // "See All Deals" link — click to filter
    document.getElementById('seeAllDealsLink').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('saleToggle').click();
      document.querySelector('.game-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ══════════════════════════════════════
     CATEGORIES
     ══════════════════════════════════════ */
  const CATEGORIES = [
    { name: 'RPG', icon: '⚔️' },
    { name: 'Action', icon: '💥' },
    { name: 'Shooter', icon: '🎯' },
    { name: 'Horror', icon: '👻' },
    { name: 'Racing', icon: '🏎️' },
    { name: 'Strategy', icon: '🧠' },
    { name: 'Sports', icon: '⚽' },
    { name: 'Adventure', icon: '🗺️' },
    { name: 'Simulation', icon: '🏙️' },
    { name: 'Roguelike', icon: '🎲' },
    { name: 'MOBA', icon: '🏆' },
    { name: 'MMO', icon: '🌐' },
    { name: 'Fighting', icon: '🥊' },
    { name: 'Sandbox', icon: '🧱' },
    { name: 'Platformer', icon: '🎮' },
    { name: 'Battle Royale', icon: '💀' },
  ];

  const CATEGORY_VIBES = {
    RPG: 'Deep builds',
    Action: 'Pure impact',
    Shooter: 'Twitch aim',
    Horror: 'Fear spikes',
    Racing: 'Full throttle',
    Strategy: 'Outsmart everyone',
    Sports: 'Competitive flow',
    Adventure: 'Story worlds',
    Simulation: 'Build and chill',
    Roguelike: 'One more run',
    MOBA: 'Team mastery',
    MMO: 'Massive worlds',
    Fighting: 'Perfect reads',
    Sandbox: 'Creative chaos',
    Platformer: 'Precision jumps',
    'Battle Royale': 'Last squad standing'
  };
  const SMART_PATHS = [
    {
      id: 'story',
      icon: '01',
      title: 'Cinematic Story Worlds',
      meta: 'Adventure + RPG + top-rated campaigns',
      note: 'Locks onto high-rated worlds with strong narratives and polished solo momentum.',
      genres: ['Adventure', 'RPG'],
      sort: 'rating'
    },
    {
      id: 'squad',
      icon: '02',
      title: 'Squad Up Fast',
      meta: 'Shooter + MOBA + MMO + live energy',
      note: 'Pushes you toward social, match-driven games where team play and repeat sessions matter most.',
      genres: ['Shooter', 'MOBA', 'MMO'],
      sort: 'popular'
    },
    {
      id: 'cozy',
      icon: '03',
      title: 'Late-Night Cooldown',
      meta: 'Simulation + Sandbox + Platformer',
      note: 'A softer lane for creative loops, steady progression, and lower-pressure sessions.',
      genres: ['Simulation', 'Sandbox', 'Platformer'],
      sort: 'name'
    },
    {
      id: 'deals',
      icon: '04',
      title: 'Deal Hunter',
      meta: 'On sale + under $30 + high value',
      note: 'Activates the sale lens so the store feels like a premium bargain radar instead of a cluttered discount wall.',
      onSale: true,
      priceCode: 'u30',
      sort: 'price-low'
    }
  ];

  let _activePath = '';

  function buildCategories() {
    const db = window.GAME_DATABASE || [];
    const grid = document.getElementById('categoriesGrid');
    grid.innerHTML = '';

    CATEGORIES.forEach(cat => {
      const count = db.filter(g => (g.genre || []).includes(cat.name)).length;
      if (count === 0) return;
      const card = document.createElement('button');
      card.className = 'category-card';
      card.type = 'button';
      card.dataset.genre = cat.name;
      card.setAttribute('aria-label', `Browse ${cat.name} games`);
      card.setAttribute('aria-pressed', _activeGenres.has(cat.name));
      card.setAttribute('data-tilt', '5');
      card.setAttribute('data-glow', '');
      card.innerHTML = `
        <span class="category-icon">${cat.icon}</span>
        <span class="category-name">${cat.name}</span>
        <span class="category-vibe">${CATEGORY_VIBES[cat.name] || 'Genre route'}</span>
        <span class="category-count">${count} games</span>
      `;
      card.addEventListener('click', () => {
        if (_activeGenres.size === 1 && _activeGenres.has(cat.name)) _activeGenres.clear();
        else {
          _activeGenres.clear();
          _activeGenres.add(cat.name);
        }
        _activePath = '';
        buildChipRow();
        syncCategoryCards();
        syncSmartPathState();
        applyFilters();
        document.querySelector('.game-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      grid.appendChild(card);
    });

    syncCategoryCards();
  }

  function buildSmartPathRow() {
    const track = document.getElementById('smartPathTrack');
    if (!track) return;
    track.innerHTML = '';

    SMART_PATHS.forEach(path => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'smart-path-btn';
      btn.dataset.path = path.id;
      btn.setAttribute('aria-pressed', path.id === _activePath);
      btn.innerHTML = `
        <span class="smart-path-btn__top">
          <span class="smart-path-btn__icon">${path.icon}</span>
          <span class="smart-path-btn__title">${path.title}</span>
        </span>
        <span class="smart-path-btn__meta">${path.meta}</span>
      `;
      btn.addEventListener('click', () => applySmartPath(path.id));
      track.appendChild(btn);
    });

    syncSmartPathState();
  }

  function syncCategoryCards() {
    document.querySelectorAll('.category-card').forEach(card => {
      const active = _activeGenres.has(card.dataset.genre);
      card.classList.toggle('active', active);
      card.setAttribute('aria-pressed', active);
    });
  }

  function syncSmartPathState() {
    document.querySelectorAll('.smart-path-btn').forEach(btn => {
      const active = btn.dataset.path === _activePath;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active);
    });

    const note = document.getElementById('smartPathNote');
    if (!note) return;
    const path = SMART_PATHS.find(item => item.id === _activePath);
    note.textContent = path
      ? path.note
      : 'Start with a curated route for campaigns, squads, cozy sessions, or deal hunting, then refine from there without losing momentum.';
  }

  function applySmartPath(pathId) {
    if (_activePath === pathId) {
      clearAllFilters();
      return;
    }

    const path = SMART_PATHS.find(item => item.id === pathId);
    if (!path) return;

    _activePath = path.id;
    _activeGenres = new Set(path.genres || []);
    _activePlatforms = new Set(path.platforms || []);
    document.getElementById('searchInput').value = path.search || '';
    document.getElementById('priceFilter').value = path.priceCode || '';
    document.getElementById('sortFilter').value = path.sort || '';

    const saleBtn = document.getElementById('saleToggle');
    const onSale = !!path.onSale;
    saleBtn.classList.toggle('active', onSale);
    saleBtn.setAttribute('aria-pressed', onSale);

    buildChipRow();
    syncCategoryCards();
    syncSmartPathState();
    applyFilters();
    document.getElementById('gridHeading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ══════════════════════════════════════
     GAME GRID
     ══════════════════════════════════════ */
  function getGameById(id) {
    return (window.GAME_DATABASE || []).find(g => g.id === id);
  }

  function buildGameCard(game) {
    const pct = salePercent(game);
    const isOwned = GG.Library.owns(game.id);
    const isInCart = GG.Cart.has(game.id);
    const isWished = GG.Wishlist.has(game.id);
    const effectivePrice = game.salePrice ?? game.price;

    // Badges
    let badges = '';
    if (game.freeToPlay || game.price === 0) badges += '<span class="card-badge card-badge--free">Free</span>';
    else if (pct > 0) badges += `<span class="card-badge card-badge--sale">-${pct}%</span>`;
    if (game.newRelease) badges += '<span class="card-badge card-badge--new">New</span>';
    if (game.trending) badges += '<span class="card-badge card-badge--trending">🔥</span>';

    // Cart button label
    let cartLabel, cartClass;
    if (isOwned) { cartLabel = '✓ In Library'; cartClass = 'card-hover-btn--owned'; }
    else if (isInCart) { cartLabel = '✓ In Cart'; cartClass = 'card-hover-btn--incart'; }
    else { cartLabel = 'Add to Cart'; cartClass = 'card-hover-btn--primary'; }

    // Price display
    let priceHTML;
    if (effectivePrice === 0 || game.freeToPlay) {
      priceHTML = '<span class="price-free">Free to Play</span>';
    } else if (game.salePrice) {
      priceHTML = `<span class="price-current on-sale">${formatPrice(game.salePrice)}</span>
                   <span class="price-original">${formatPrice(game.price)}</span>`;
    } else {
      priceHTML = `<span class="price-current">${formatPrice(game.price)}</span>`;
    }

    const card = document.createElement('div');
    card.className = 'game-card';
    card.setAttribute('data-tilt', '4');
    card.setAttribute('data-glow', '');
    card.setAttribute('data-game-id', game.id);
    card.setAttribute('role', 'listitem');
    const detailHref = `/game/${encodeURIComponent(game.slug || game.id)}`;
    card.innerHTML = `
      <div class="game-card__thumb">
        <a class="ggs-26c479df0d" href="${detailHref}" aria-label="View details for ${escapeHtml(game.title)}"></a>
        <img class="game-card__img" src="${game.image}" alt="${game.title}" loading="lazy" data-csp-onerror="this.src='images/bg.webp'" data-image-reveal="center">
        <div class="card-badges">${badges}</div>
        <div class="game-card__hover ggs-8968095d4f">
          <button type="button" class="card-hover-btn ${cartClass}" data-card-cart="${game.id}">${cartLabel}</button>
          <button type="button" class="card-hover-btn card-hover-btn--ghost" data-card-view="${game.id}">Quick View</button>
        </div>
        <button type="button" class="card-wishlist-btn ${isWished ? 'wishlisted' : ''} ggs-8968095d4f" data-card-wish="${game.id}" aria-label="${isWished ? 'Remove from wishlist' : 'Add to wishlist'}" title="Wishlist">
          ${isWished ? '❤️' : '🤍'}
        </button>
      </div>
      <div class="game-card__body">
        <a class="ggs-7ed833a222" href="${detailHref}"><div class="game-card__title">${escapeHtml(game.title)}</div></a>
        <div class="game-card__dev">${escapeHtml(game.developer)}</div>
        <div class="game-card__meta">
          <div class="game-card__platforms">
            ${(game.platform || []).slice(0, 4).map(p => `<span class="platform-dot">${getPlatformLabel(p)}</span>`).join('')}
          </div>
          <div class="game-card__rating">
            <span class="rating-stars">${renderStars(game.rating)}</span>
            <span class="rating-val">${game.rating}</span>
          </div>
        </div>
        <div class="game-card__price-row">${priceHTML}</div>
      </div>
    `;

    // Events
    card.querySelector('[data-card-cart]').addEventListener('click', (e) => {
      e.stopPropagation();
      handleAddToCart(game, e.currentTarget);
    });
    card.querySelector('[data-card-view]').addEventListener('click', (e) => {
      e.stopPropagation();
      openQuickView(game);
    });
    card.querySelector('[data-card-wish]').addEventListener('click', (e) => {
      e.stopPropagation();
      handleWishlistToggle(game, e.currentTarget);
    });

    return card;
  }

  function renderGrid() {
    const grid = document.getElementById('gameGrid');
    const start = _renderedCount;
    const end = Math.min(_renderedCount + PAGE_SIZE, _filteredGames.length);
    const frag = document.createDocumentFragment();

    if (_renderedCount === 0) grid.innerHTML = '';

    if (_filteredGames.length === 0) {
      grid.innerHTML = `
        <div class="no-results">
          <div class="no-results-icon">🔍</div>
          <h3>No games found</h3>
          <p>Try adjusting your filters or search query.</p>
        </div>
      `;
      document.getElementById('loadMoreBtn').style.display = 'none';
      return;
    }

    for (let i = start; i < end; i++) {
      frag.appendChild(buildGameCard(_filteredGames[i]));
    }
    grid.appendChild(frag);
    _renderedCount = end;

    const loadMoreBtn = document.getElementById('loadMoreBtn');
    loadMoreBtn.style.display = _renderedCount >= _filteredGames.length ? 'none' : 'block';
  }

  function applyFilters() {
    const search = document.getElementById('searchInput').value.trim();
    const priceCode = document.getElementById('priceFilter').value;
    const sort = document.getElementById('sortFilter').value;
    const onSale = document.getElementById('saleToggle').classList.contains('active');

    const filterOpts = { sort: sort || 'popular' };
    if (search) filterOpts.search = search;
    if (_activeGenres.size > 0) filterOpts.genres = [..._activeGenres];
    if (_activePlatforms.size > 0) filterOpts.platforms = [..._activePlatforms];
    if (onSale) filterOpts.onSale = true;
    if (priceCode === 'free') filterOpts.freeToPlay = true;
    else if (priceCode) {
      const range = getPriceRange(priceCode);
      if (range) filterOpts.priceRange = range;
    }

    _filteredGames = GG.Search.filter(filterOpts);
    _renderedCount = 0;

    document.getElementById('resultsCount').textContent = `${_filteredGames.length} game${_filteredGames.length !== 1 ? 's' : ''}`;

    // Update heading
    const headings = [];
    if (search) headings.push(`"${search}"`);
    if (_activeGenres.size > 0) headings.push([..._activeGenres].join('/'));
    if (_activePlatforms.size > 0) headings.push([..._activePlatforms].join('/'));
    if (onSale) headings.push('On Sale');
    const heading = document.getElementById('gridHeading');
    heading.innerHTML = headings.length ? headings.join(' + ') + ' <span>Games</span>' : 'All <span>Games</span>';

    renderGrid();

    // No-results state
    const noResults = document.getElementById('noResultsState');
    const grid = document.getElementById('gameGrid');
    if (_filteredGames.length === 0) {
      noResults.classList.add('visible');
      grid.style.display = 'none';
    } else {
      noResults.classList.remove('visible');
      grid.style.display = '';
    }

    syncCategoryCards();
    syncSmartPathState();
  }

  /* ══════════════════════════════════════
     CART ACTIONS
     ══════════════════════════════════════ */
  async function handleAddToCart(game, btn) {
    if (GG.Library.owns(game.id)) {
      GG.Toast.info('You already own this game!');
      return;
    }
    if (GG.Cart.has(game.id)) {
      openCartPanel();
      return;
    }
    try {
      await GG.Cart.add(game);
      GG.Toast.success(`🛒 ${game.title} added to cart!`);
      if (btn) {
        btn.textContent = '✓ In Cart';
        btn.className = btn.className.replace('card-hover-btn--primary', 'card-hover-btn--incart')
                                     .replace('btn-hero-primary', 'btn-hero-primary');
      }
      updateCartBadges();
      renderCartPanel();
    } catch (err) {
      GG.Toast.error(err.error || 'Could not add to cart.');
    }
  }

  async function handleWishlistToggle(game, btn) {
    try {
      const added = await GG.Wishlist.toggle(game);
      if (btn) {
        btn.textContent = added ? '❤️' : '🤍';
        btn.classList.toggle('wishlisted', added);
        btn.setAttribute('aria-label', added ? 'Remove from wishlist' : 'Add to wishlist');
      }
      GG.Toast[added ? 'info' : 'warning'](added ? `💜 ${game.title} added to wishlist!` : `Removed from wishlist`);
    } catch (err) {
      GG.Toast.error(err.error || 'Failed.');
    }
  }

  /* ══════════════════════════════════════
     QUICK VIEW MODAL
     ══════════════════════════════════════ */
  function openQuickView(game) {
    const modal = document.getElementById('quickViewModal');
    const box = document.getElementById('quickViewBox');
    const pct = salePercent(game);
    const isOwned = GG.Library.owns(game.id);
    const isInCart = GG.Cart.has(game.id);
    const isWished = GG.Wishlist.has(game.id);
    const screenshots = screenshotsFor(game);
    const req = systemRequirementsFor(game);
    const related = relatedGamesFor(game);

    let cartLabel, cartStateClass;
    if (isOwned) { cartLabel = '✓ Already in Library'; cartStateClass = ' modal-btn-cart--owned'; }
    else if (isInCart) { cartLabel = '✓ In Cart — View Cart'; cartStateClass = ' modal-btn-cart--in-cart'; }
    else { cartLabel = `🛒 Add to Cart — ${game.salePrice ? formatPrice(game.salePrice) : formatPrice(game.price)}`; cartStateClass = ''; }

    box.innerHTML = `
      <button type="button" class="modal-close" id="quickViewClose2" aria-label="Close">&times;</button>
      <div class="modal-hero">
        <img class="modal-hero-img" id="modalHeroImg" src="${game.image}" alt="${game.title}" data-csp-onerror="this.src='images/bg.webp'" loading="lazy" decoding="async">
        <div class="modal-hero-overlay"></div>
      </div>
      <div class="modal-body">
        <h2 class="modal-title"><a class="ggs-7bb4174728" href="/game/${encodeURIComponent(game.slug || game.id)}">${escapeHtml(game.title)}</a></h2>
        <div class="modal-developer">by ${escapeHtml(game.developer)} / ${escapeHtml(game.publisher)}</div>
        <div class="ggs-fe7b4979fe"><a href="/game/${encodeURIComponent(game.slug || game.id)}" class="modal-full-page-link ggs-8f29f3a51c">View full page →</a></div>
        <div class="modal-rating-row">
          <span class="modal-rating-stars">${renderStars(game.rating)}</span>
          <span class="modal-rating-val">${game.rating}/5</span>
          <span class="modal-reviews">(${game.reviews.toLocaleString()} reviews)</span>
        </div>
        <p class="modal-description">${escapeHtml(game.description)}</p>
        <div class="modal-section-title">Screenshots</div>
        <div class="modal-gallery">
          ${screenshots.map((src, idx) => `<img class="modal-gallery-thumb ${idx === 0 ? 'active' : ''}" data-shot="${idx}" src="${src}" alt="${escapeHtml(game.title)} screenshot ${idx + 1}" data-csp-onerror="this.src='images/bg.webp'" loading="lazy" decoding="async">`).join('')}
        </div>
        <div class="modal-section-title">Full Description</div>
        <p class="modal-description">${escapeHtml(game.description)} ${escapeHtml(game.title)} features ${(game.tags || []).slice(0, 4).join(', ')} gameplay loops with ${escapeHtml(game.size || 'varied')} content footprint and ${(game.platform || []).join(', ')} platform support.</p>
        <div class="modal-tags-row">
          ${[...(game.genre || []), ...(game.tags || [])].map(t => `<span class="modal-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        <div class="modal-info-grid">
          <div class="modal-info-item"><label>Release Date</label><span>${new Date(game.releaseDate).toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric'})}</span></div>
          <div class="modal-info-item"><label>File Size</label><span>${escapeHtml(game.size || 'N/A')}</span></div>
          <div class="modal-info-item"><label>Developer</label><span>${escapeHtml(game.developer)}</span></div>
          <div class="modal-info-item"><label>Publisher</label><span>${escapeHtml(game.publisher)}</span></div>
          <div class="modal-info-item"><label>Platforms</label><span>${(game.platform || []).map(escapeHtml).join(', ')}</span></div>
          <div class="modal-info-item"><label>Genre</label><span>${(game.genre || []).slice(0, 3).map(escapeHtml).join(', ')}</span></div>
        </div>
        <div class="modal-section-title">System Requirements (Estimated)</div>
        <div class="modal-requirements">
          <div class="modal-req-card"><div class="modal-req-label">OS</div><div class="modal-req-value">${escapeHtml(req.os)}</div></div>
          <div class="modal-req-card"><div class="modal-req-label">CPU</div><div class="modal-req-value">${escapeHtml(req.cpu)}</div></div>
          <div class="modal-req-card"><div class="modal-req-label">Memory</div><div class="modal-req-value">${escapeHtml(req.ram)}</div></div>
          <div class="modal-req-card"><div class="modal-req-label">Graphics</div><div class="modal-req-value">${escapeHtml(req.gpu)}</div></div>
          <div class="modal-req-card"><div class="modal-req-label">Storage</div><div class="modal-req-value">${escapeHtml(req.storage)}</div></div>
          <div class="modal-req-card"><div class="modal-req-label">Network</div><div class="modal-req-value">${escapeHtml(req.network)}</div></div>
        </div>
        <div class="modal-section-title">Related Games</div>
        <div class="modal-related-grid">
          ${related.map(r => {
            const rp = r.salePrice ?? r.price;
            return `<button type="button" class="modal-related-card" data-related-id="${r.id}" aria-label="View ${escapeHtml(r.title)} details">
              <img class="modal-related-img" src="${r.image}" alt="${escapeHtml(r.title)}" data-csp-onerror="this.src='images/bg.webp'" loading="lazy" decoding="async">
              <div class="modal-related-body">
                <div class="modal-related-title">${escapeHtml(r.title)}</div>
                <div class="modal-related-price">${rp === 0 ? 'Free' : formatPrice(rp)}</div>
              </div>
            </button>`;
          }).join('')}
        </div>
        <div class="modal-price-block">
          ${game.price === 0 || game.freeToPlay
            ? '<span class="modal-price-current modal-price-free">Free to Play</span>'
            : pct > 0
              ? `<span class="modal-discount-badge">-${pct}%</span>
                 <span class="modal-price-was">${formatPrice(game.price)}</span>
                 <span class="modal-price-current">${formatPrice(game.salePrice)}</span>
                 <span class="modal-price-save">You save ${formatPrice(game.price - game.salePrice)}</span>`
              : `<span class="modal-price-current">${formatPrice(game.price)}</span>`
          }
        </div>
        <div class="modal-actions">
          <button type="button" class="modal-btn-cart${cartStateClass}" id="modalCartBtn" ${isOwned ? 'disabled' : ''}>${cartLabel}</button>
          <button type="button" class="modal-btn-wish ${isWished ? 'active' : ''}" id="modalWishBtn">
            ${isWished ? '❤️ Wishlisted' : '🤍 Wishlist'}
          </button>
          <a href="/game/${encodeURIComponent(game.slug || game.id)}" class="modal-btn-view ggs-aee34a3872">View Full Page</a>
        </div>
      </div>
    `;

    box.querySelector('#quickViewClose2').addEventListener('click', closeQuickView);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeQuickView(); });

    const cartBtn = box.querySelector('#modalCartBtn');
    if (cartBtn && !isOwned) {
      cartBtn.addEventListener('click', () => {
        if (isInCart) { closeQuickView(); openCartPanel(); return; }
        handleAddToCart(game, null);
        cartBtn.textContent = '✓ In Cart — View Cart';
        cartBtn.classList.add('modal-btn-cart--in-cart');
      });
    }

    const wishBtn = box.querySelector('#modalWishBtn');
    if (wishBtn) {
      wishBtn.addEventListener('click', async () => {
        try {
          const added = await GG.Wishlist.toggle(game);
          wishBtn.textContent = added ? '❤️ Wishlisted' : '🤍 Wishlist';
          wishBtn.classList.toggle('active', added);
          GG.Toast[added ? 'info' : 'warning'](added ? '💜 Added to wishlist!' : 'Removed from wishlist');
        } catch {}
      });
    }

    const heroImg = box.querySelector('#modalHeroImg');
    box.querySelectorAll('.modal-gallery-thumb').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        box.querySelectorAll('.modal-gallery-thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
        if (heroImg) heroImg.src = thumb.src;
      });
    });

    box.querySelectorAll('[data-related-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextGame = getGameById(Number(btn.dataset.relatedId));
        if (nextGame) openQuickView(nextGame);
      });
    });

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    window.GlitzFocusTrap?.trapFocus(modal);
  }

  function closeQuickView() {
    const modal = document.getElementById('quickViewModal');
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    window.GlitzFocusTrap?.releaseFocus();
  }

  /* ══════════════════════════════════════
     CART PANEL
     ══════════════════════════════════════ */
  function openCartPanel() {
    const cartPanel = document.getElementById('cartPanel');
    cartPanel.classList.add('active');
    document.getElementById('cartOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
    renderCartPanel();
    window.GlitzFocusTrap?.trapFocus(cartPanel);
  }

  function closeCartPanel() {
    document.getElementById('cartPanel').classList.remove('active');
    document.getElementById('cartOverlay').classList.remove('active');
    document.body.style.overflow = '';
    window.GlitzFocusTrap?.releaseFocus();
  }

  function renderCartPanel() {
    const body = document.getElementById('cartBody');
    const footer = document.getElementById('cartFooter');
    const items = GG.Cart.items;

    if (items.length === 0) {
      body.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty-icon">🛒</div>
          <h3>Your cart is empty</h3>
          <p>Add games from deals or browse by genre to get started.</p>
          <button type="button" class="btn-hero-secondary" id="cartBrowseBtn">Browse Top Deals</button>
        </div>
      `;
      footer.innerHTML = `
        <button type="button" class="btn-checkout" disabled>Checkout — $0.00</button>
      `;
      const browseBtn = document.getElementById('cartBrowseBtn');
      if (browseBtn) {
        browseBtn.addEventListener('click', () => {
          closeCartPanel();
          document.getElementById('deals')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      return;
    }

    body.innerHTML = '';
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'cart-item';
      const price = item.sale_price ?? item.salePrice ?? item.price;
      row.innerHTML = `
        <img class="cart-item__img" src="${item.image}" alt="${item.title}" data-csp-onerror="this.src='images/bg.webp'" loading="lazy" decoding="async">
        <div class="cart-item__info">
          <div class="cart-item__title">${item.title}</div>
          <div class="cart-item__price">${price === 0 ? 'Free' : '$' + price.toFixed(2)}</div>
        </div>
        <button type="button" class="cart-item__remove" data-remove="${item.id}" aria-label="Remove ${item.title}">✕</button>
      `;
      row.querySelector('[data-remove]').addEventListener('click', async (e) => {
        try {
          await GG.Cart.remove(e.currentTarget.dataset.remove);
          GG.Toast.warning('Removed from cart');
          renderCartPanel();
          updateCartBadges();
          refreshGridCards();
        } catch {}
      });
      body.appendChild(row);
    });

    const savings = GG.Cart.savings;
    const total = GG.Cart.total;

    footer.innerHTML = `
      <div class="cart-totals">
        ${savings > 0 ? `<div class="cart-total-row"><span>Savings</span><span class="cart-savings-val">-$${savings.toFixed(2)}</span></div>` : ''}
        <div class="cart-total-row total"><span>Total</span><span>$${total.toFixed(2)}</span></div>
      </div>
      <button type="button" class="btn-checkout" id="checkoutBtn">Pay with wallet — $${total.toFixed(2)}</button>
      <button type="button" class="btn-checkout ggs-29d8dfe4d9" id="stripeBtn">
        💳 Pay with card (Stripe)
      </button>
      <p class="ggs-796c45c7f8">Test mode. Use card 4242 4242 4242 4242.</p>
    `;

    document.getElementById('checkoutBtn').addEventListener('click', handleCheckout);
    const stripeBtn = document.getElementById('stripeBtn');
    if (stripeBtn) stripeBtn.addEventListener('click', handleStripeCheckout);
  }

  async function handleStripeCheckout() {
    const btn = document.getElementById('stripeBtn');
    const token = (window.GG && GG.Auth && GG.Auth.getToken && GG.Auth.getToken()) || localStorage.getItem('gg_token') || '';
    if (!token) { GG.Toast.error('Please sign in first.'); window.location.href = '/account.html'; return; }
    try {
      btn.disabled = true; btn.textContent = 'Opening Stripe…';
      const r = await fetch(window.GG.apiUrl('/checkout/stripe'), {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 503) { GG.Toast.info('Stripe is not configured on this server yet. Ask the admin to add STRIPE_SECRET_KEY.'); btn.disabled = false; btn.textContent = '💳 Pay with card (Stripe)'; return; }
      if (!r.ok || !data.url) { GG.Toast.error(data.error || 'Could not open Stripe.'); btn.disabled = false; btn.textContent = '💳 Pay with card (Stripe)'; return; }
      window.location.href = data.url;
    } catch (e) {
      GG.Toast.error('Network error opening Stripe.');
      btn.disabled = false; btn.textContent = '💳 Pay with card (Stripe)';
    }
  }

  async function handleCheckout() {
    try {
      const result = await GG.Cart.checkout();
      closeCartPanel();
      GG.Toast.success(`🎉 Order confirmed! Games added to your library.`);
      showStoreCheckoutSuccess(result && result.order ? result.order : result);
      updateCartBadges();
      refreshGridCards();
    } catch (err) {
      GG.Toast.error(err.error || 'Checkout failed.');
    }
  }

  function showStoreCheckoutSuccess(order) {
    const modal = document.getElementById('storeCheckoutModal');
    const body = document.getElementById('storeCheckoutBody');
    if (!modal || !body || !order) return;

    const items = Array.isArray(order.items) ? order.items : [];
    const total = Number(order.total || 0);
    const timestamp = new Date(order.created_at || Date.now()).toLocaleString();
    const savings = items.reduce((acc, item) => {
      const orig = Number(item.price || 0);
      const paid = Number(item.price_paid ?? item.sale_price ?? item.salePrice ?? orig);
      return acc + Math.max(0, orig - paid);
    }, 0);
    body.innerHTML = `
      <div class="store-checkout-icon">🎉</div>
      <h2 class="modal-title ggs-6c002e2180">Purchase Complete!</h2>
      <p class="modal-description ggs-6c002e2180">Your games are now in your library and ready to play.</p>
      <div class="store-checkout-order-id">Order ${escapeHtml(order.id || 'N/A')}</div>
      <div class="store-checkout-items">
        ${items.map(item => {
          const paid = Number(item.price_paid ?? item.salePrice ?? item.sale_price ?? item.price ?? 0);
          const orig = Number(item.price ?? paid);
          const hasSavings = orig > paid && paid > 0;
          return `<div class="store-checkout-item">
            <img src="${item.image || 'images/bg.webp'}" alt="${escapeHtml(item.title || 'Game')}" data-csp-onerror="this.src='images/bg.webp'" loading="lazy" decoding="async">
            <div class="store-checkout-item-title">${escapeHtml(item.title || 'Game')}</div>
            <div class="store-checkout-item-price">
              ${paid === 0 ? '<span class="ggs-a4c6acf330">Free</span>' : hasSavings
                ? `<span class="ggs-b67e25d2d6">${formatPrice(orig)}</span>${formatPrice(paid)}`
                : formatPrice(paid)}
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="store-checkout-total"><span>Total Paid</span><span>${formatPrice(total)}</span></div>
      ${savings > 0 ? `<div class="store-checkout-total ggs-0c3f98dffc"><span>💰 You saved</span><span>-${formatPrice(savings)}</span></div>` : ''}
      <div class="store-checkout-meta">${items.length} item${items.length === 1 ? '' : 's'} · ${timestamp}</div>
      <div class="modal-actions ggs-bdadfb8099">
        <a href="account.html" class="modal-btn-cart ggs-bcdb66c1aa">🎮 Go to Library</a>
        <button type="button" class="modal-btn-wish ggs-c85949f5af" data-csp-onclick="closeStoreCheckoutSuccess()">Browse More</button>
      </div>
    `;

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeStoreCheckoutSuccess() {
    const modal = document.getElementById('storeCheckoutModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function updateCartBadges() {
    GG.UI.updateCartBadge();
    const count = GG.Cart.count;
    const floatBadge = document.getElementById('floatBadge');
    if (floatBadge) {
      floatBadge.textContent = count;
      floatBadge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  function refreshGridCards() {
    // Re-render all visible cards to update button states
    const grid = document.getElementById('gameGrid');
    const cards = grid.querySelectorAll('.game-card');
    cards.forEach(card => {
      const id = +card.dataset.gameId;
      const game = getGameById(id);
      if (!game) return;

      const cartBtn = card.querySelector('[data-card-cart]');
      if (cartBtn) {
        const isOwned = GG.Library.owns(id);
        const isInCart = GG.Cart.has(id);
        if (isOwned) { cartBtn.textContent = '✓ In Library'; cartBtn.className = 'card-hover-btn card-hover-btn--owned'; }
        else if (isInCart) { cartBtn.textContent = '✓ In Cart'; cartBtn.className = 'card-hover-btn card-hover-btn--incart'; }
        else { cartBtn.textContent = 'Add to Cart'; cartBtn.className = 'card-hover-btn card-hover-btn--primary'; }
      }

      const wishBtn = card.querySelector('[data-card-wish]');
      if (wishBtn) {
        const isWished = GG.Wishlist.has(id);
        wishBtn.textContent = isWished ? '❤️' : '🤍';
        wishBtn.classList.toggle('wishlisted', isWished);
      }
    });
  }

  /* ══════════════════════════════════════
     SCROLL REVEAL
     ══════════════════════════════════════ */
  function initScrollReveal() {
    const els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('revealed'); obs.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach(el => obs.observe(el));
  }

  /* ══════════════════════════════════════
     MULTI-SELECT FILTER CHIPS
     ══════════════════════════════════════ */
  const GENRES    = ['Action','Adventure','RPG','Shooter','Strategy','Horror','Racing','Sports',
                     'Platformer','Simulation','Roguelike','MOBA','MMO','Fighting','Sandbox',
                     'Battle Royale','VR','Puzzle'];
  const PLATFORMS = ['PC','PS5','Xbox','Switch','Mobile'];

  let _activeGenres    = new Set();
  let _activePlatforms = new Set();

  function buildChipRow() {
    const row = document.getElementById('filterChipRow');
    row.innerHTML = '';

    // Genre chips
    const genreGroup = document.createElement('div');
    genreGroup.className = 'filter-chip-group';
    genreGroup.innerHTML = '<span class="filter-chip-label">Genre</span>';
    GENRES.forEach(g => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip' + (_activeGenres.has(g) ? ' active' : '');
      btn.textContent = g;
      btn.setAttribute('aria-pressed', _activeGenres.has(g));
      btn.addEventListener('click', () => {
        _activePath = '';
        if (_activeGenres.has(g)) _activeGenres.delete(g);
        else _activeGenres.add(g);
        buildChipRow();
        syncCategoryCards();
        syncSmartPathState();
        applyFilters();
      });
      genreGroup.appendChild(btn);
    });
    row.appendChild(genreGroup);

    // Divider
    const div = document.createElement('div');
    div.className = 'filter-chip-divider';
    row.appendChild(div);

    // Platform chips
    const platGroup = document.createElement('div');
    platGroup.className = 'filter-chip-group';
    platGroup.innerHTML = '<span class="filter-chip-label">Platform</span>';
    PLATFORMS.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip filter-chip-platform' + (_activePlatforms.has(p) ? ' active' : '');
      btn.textContent = p;
      btn.setAttribute('aria-pressed', _activePlatforms.has(p));
      btn.addEventListener('click', () => {
        _activePath = '';
        if (_activePlatforms.has(p)) _activePlatforms.delete(p);
        else _activePlatforms.add(p);
        buildChipRow();
        syncSmartPathState();
        applyFilters();
      });
      platGroup.appendChild(btn);
    });
    row.appendChild(platGroup);

    // Clear button — only shown if any chip active
    if (_activeGenres.size > 0 || _activePlatforms.size > 0) {
      const div2 = document.createElement('div');
      div2.className = 'filter-chip-divider';
      row.appendChild(div2);
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'filter-clear-btn';
      clearBtn.textContent = '✕ Clear filters';
      clearBtn.addEventListener('click', clearChipFilters);
      row.appendChild(clearBtn);
    }
  }

  function clearChipFilters() {
    _activeGenres.clear();
    _activePlatforms.clear();
    _activePath = '';
    buildChipRow();
    syncCategoryCards();
    syncSmartPathState();
    applyFilters();
  }

  function clearAllFilters() {
    _activeGenres.clear();
    _activePlatforms.clear();
    _activePath = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('priceFilter').value = '';
    document.getElementById('sortFilter').value = '';
    const saleBtn = document.getElementById('saleToggle');
    saleBtn.classList.remove('active');
    saleBtn.setAttribute('aria-pressed', 'false');
    buildChipRow();
    syncCategoryCards();
    syncSmartPathState();
    applyFilters();
  }

  /* ══════════════════════════════════════
     FILTER EVENTS
     ══════════════════════════════════════ */
  function initFilterEvents() {
    buildChipRow();
    buildSmartPathRow();

    let searchDebounce;
    document.getElementById('searchInput').addEventListener('input', () => {
      _activePath = '';
      syncSmartPathState();
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(applyFilters, 280);
    });

    ['priceFilter', 'sortFilter'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        _activePath = '';
        syncSmartPathState();
        applyFilters();
      });
    });

    document.getElementById('saleToggle').addEventListener('click', function() {
      _activePath = '';
      const isActive = this.classList.toggle('active');
      this.setAttribute('aria-pressed', isActive);
      syncSmartPathState();
      applyFilters();
    });

    document.getElementById('loadMoreBtn').addEventListener('click', () => {
      renderGrid();
    });

    // Cart panel triggers
    document.getElementById('floatingCartBtn').addEventListener('click', openCartPanel);
    document.getElementById('cartCloseBtn').addEventListener('click', closeCartPanel);
    document.getElementById('cartOverlay').addEventListener('click', closeCartPanel);
    document.getElementById('storeCheckoutClose')?.addEventListener('click', closeStoreCheckoutSuccess);
    document.getElementById('storeCheckoutModal')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'storeCheckoutModal') closeStoreCheckoutSuccess();
    });

    // ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeQuickView();
        closeCartPanel();
        closeStoreCheckoutSuccess();
      }
    });

    // GG cart open from nav (via openCart event or direct nav-cart click)
    window.addEventListener('openCart', openCartPanel);
    const navCartBtn = document.querySelector('.nav-cart');
    if (navCartBtn) {
      navCartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openCartPanel();
      });
    }
  }

  /* ══════════════════════════════════════
     INIT
     ══════════════════════════════════════ */
  function init() {
    // Wait for all scripts
    if (typeof GG === 'undefined' || !window.GAME_DATABASE) {
      setTimeout(init, 50);
      return;
    }

    buildCarousel();
    buildDeals();
    buildCategories();
    applyFilters();
    initScrollReveal();
    initFilterEvents();
    updateCartBadges();

    // Listen to state events
    GG.on('cart:update', () => { updateCartBadges(); refreshGridCards(); renderCartPanel(); });
    GG.on('wishlist:update', () => { refreshGridCards(); });
    GG.on('library:update', () => { refreshGridCards(); });
  }

  /* ══════════════════════════════════════
     FILTER BAR SCROLL BEHAVIOR
     ══════════════════════════════════════ */
  function initFilterBarScroll() {
    const filterBar = document.getElementById('filterBar');
    if (!filterBar) return;
    let lastY = window.scrollY;
    let ticking = false;

    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const scrollingDown = y > lastY && y > 140;
        filterBar.style.transition = 'opacity 0.35s cubic-bezier(0.16,1,0.3,1), transform 0.35s cubic-bezier(0.16,1,0.3,1)';
        if (scrollingDown) {
          filterBar.style.opacity = '0';
          filterBar.style.pointerEvents = 'none';
          filterBar.style.transform = 'translateY(-6px)';
        } else {
          filterBar.style.opacity = '1';
          filterBar.style.pointerEvents = 'auto';
          filterBar.style.transform = 'translateY(0)';
        }
        lastY = y;
        ticking = false;
      });
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); initFilterBarScroll(); });
  } else {
    init();
    initFilterBarScroll();
  }

})();
