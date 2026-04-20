/* ═══════════════════════════════════════════════
       CATEGORIES PAGE — DYNAMIC CONTENT
       ═══════════════════════════════════════════════ */

    const CATEGORY_META = {
      'RPG':          { icon: '⚔️', color: '#8B5CF6' },
      'Action':       { icon: '💥', color: '#F43F5E' },
      'Shooter':      { icon: '🎯', color: '#06B6D4' },
      'Horror':       { icon: '💀', color: '#6366F1' },
      'Racing':       { icon: '🏎️', color: '#F59E0B' },
      'Strategy':     { icon: '♟️', color: '#10B981' },
      'Sports':       { icon: '⚽', color: '#22D3EE' },
      'Survival':     { icon: '🏕️', color: '#84CC16' },
      'Puzzle':       { icon: '🧩', color: '#A78BFA' },
      'Fighting':     { icon: '🥊', color: '#F97316' },
      'Adventure':    { icon: '🗺️', color: '#34D399' },
      'Simulation':   { icon: '🌱', color: '#38BDF8' },
      'Battle Royale':{ icon: '👑', color: '#FBBF24' },
      'MOBA':         { icon: '🗡️', color: '#818CF8' },
      'MMO':          { icon: '🌐', color: '#C084FC' },
      'Roguelike':    { icon: '🎲', color: '#FB923C' },
      'Indie':        { icon: '💡', color: '#E879F9' },
      'Co-op':        { icon: '🤝', color: '#4ADE80' },
      'Sandbox':      { icon: '🏗️', color: '#FCD34D' },
      'Platformer':   { icon: '🕹️', color: '#67E8F9' },
    };

    const CATEGORIES = Object.keys(CATEGORY_META);
    const CATEGORY_COPY = {
      RPG: 'Build-heavy worlds, party strategy, and long-form progression.',
      Action: 'Fast decisions, instant payoff, and spectacle-first pacing.',
      Shooter: 'Precision aim, pressure spikes, and relentless match flow.',
      Horror: 'Tension systems, dread-heavy pacing, and survival pressure.',
      Racing: 'Velocity, overtakes, and pure reaction-time fantasy.',
      Strategy: 'Macro thinking, system mastery, and outplay potential.',
      Sports: 'Competitive rhythm, licensed energy, and repeatable rivalry.',
      Survival: 'Resource pressure, adaptation, and high-stakes persistence.',
      Puzzle: 'Smart loops, clean friction, and pattern-breaking focus.',
      Fighting: 'Reads, counterplay, and frame-perfect clutch moments.',
      Adventure: 'Narrative pull, exploration, and atmospheric momentum.',
      Simulation: 'Creative loops, building systems, and slower satisfaction.',
      'Battle Royale': 'Last-team-standing intensity and constant map pressure.',
      MOBA: 'Role mastery, layered teamwork, and long-session competition.',
      MMO: 'Massive social worlds, progression grind, and guild culture.',
      Roguelike: 'Run-based mastery, high replayability, and comeback highs.',
      Indie: 'Bold ideas, sharper aesthetics, and surprise discoveries.',
      'Co-op': 'Shared chaos, support roles, and friend-first fun.',
      Sandbox: 'Player-driven creation and open-ended experimentation.',
      Platformer: 'Movement feel, precision routing, and cheerful difficulty.'
    };
    const GENRE_ROUTES = {
      all: {
        eyebrow: 'Full Spectrum',
        title: 'All genres live',
        copy: 'Keep the whole map visible and discover organically.',
        categories: []
      },
      story: {
        eyebrow: 'Story Route',
        title: 'Narrative worlds',
        copy: 'Adventure, RPG, Indie, and Horror with more atmosphere and payoff.',
        categories: ['Adventure', 'RPG', 'Indie', 'Horror']
      },
      arena: {
        eyebrow: 'Arena Route',
        title: 'Competitive energy',
        copy: 'Shooter, Sports, Fighting, and Battle Royale with faster decision loops.',
        categories: ['Shooter', 'Sports', 'Fighting', 'Battle Royale']
      },
      tactics: {
        eyebrow: 'Tactics Route',
        title: 'Think-first systems',
        copy: 'Strategy, Simulation, Sandbox, and Puzzle for systems-heavy sessions.',
        categories: ['Strategy', 'Simulation', 'Sandbox', 'Puzzle']
      },
      social: {
        eyebrow: 'Social Route',
        title: 'Squad and community',
        copy: 'MMO, MOBA, Co-op, and Racing for party-first or shared play.',
        categories: ['MMO', 'MOBA', 'Co-op', 'Racing']
      }
    };

    let activeRoute = 'all';
    let categorySearch = '';

    /* Build genre → game count + sample images map */
    function buildCategoryData() {
      const db = window.GAME_DATABASE || [];
      const map = {};

      CATEGORIES.forEach(cat => {
        map[cat] = { count: 0, games: [] };
      });

      db.forEach(game => {
        const genres = game.genre || [];
        genres.forEach(g => {
          CATEGORIES.forEach(cat => {
            if (g.toLowerCase().includes(cat.toLowerCase()) || cat.toLowerCase().includes(g.toLowerCase())) {
              if (!map[cat]) map[cat] = { count: 0, games: [] };
              map[cat].count++;
              if (map[cat].games.length < 3 && game.image) {
                map[cat].games.push(game);
              }
            }
          });
        });
      });

      // Fallback: match by tag
      db.forEach(game => {
        const tags = (game.tags || []).concat(game.genre || []);
        CATEGORIES.forEach(cat => {
          if (map[cat].count === 0) {
            if (tags.some(t => t.toLowerCase().includes(cat.toLowerCase()) || cat.toLowerCase().includes(t.toLowerCase()))) {
              map[cat].count++;
              if (map[cat].games.length < 3 && game.image) map[cat].games.push(game);
            }
          }
        });
      });

      return map;
    }

    function getVisibleCategories() {
      const route = GENRE_ROUTES[activeRoute] || GENRE_ROUTES.all;
      return CATEGORIES.filter(cat => {
        const matchesSearch = cat.toLowerCase().includes(categorySearch.toLowerCase());
        const matchesRoute = !route.categories.length || route.categories.includes(cat);
        return matchesSearch && matchesRoute;
      });
    }

    function updateRouteStatus(visibleCount) {
      const status = document.getElementById('genre-route-status');
      if (!status) return;
      const route = GENRE_ROUTES[activeRoute] || GENRE_ROUTES.all;
      status.textContent = activeRoute === 'all'
        ? `All genre lanes are open. ${visibleCount} routes are currently visible, so you can browse broadly before narrowing down.`
        : `${route.title} is active. ${visibleCount} matching genres are highlighted so you can move quickly from mood to storefront.`;
    }

    function renderRouteButtons() {
      const wrap = document.getElementById('genre-route-buttons');
      if (!wrap) return;
      wrap.innerHTML = Object.entries(GENRE_ROUTES).map(([id, route]) => `
        <button type="button"
                class="genre-route-btn${id === activeRoute ? ' active' : ''}"
                data-route-id="${id}"
                aria-pressed="${id === activeRoute}">
          <span class="genre-route-btn__eyebrow">${route.eyebrow}</span>
          <span class="genre-route-btn__title">${route.title}</span>
          <span class="genre-route-btn__copy">${route.copy}</span>
        </button>
      `).join('');

      wrap.querySelectorAll('[data-route-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          activeRoute = btn.dataset.routeId;
          renderRouteButtons();
          renderCategories();
        });
      });
    }

    function renderCategories(filter = categorySearch) {
      const grid = document.getElementById('category-grid');
      const noResults = document.getElementById('no-results');
      const data = buildCategoryData();
      categorySearch = filter || '';
      const filtered = getVisibleCategories();

      if (filtered.length === 0) {
        grid.innerHTML = '';
        noResults.querySelector('p').textContent = activeRoute === 'all'
          ? 'No categories found'
          : 'No genres match this route';
        noResults.style.display = 'block';
        updateRouteStatus(0);
        return;
      }
      noResults.style.display = 'none';
      updateRouteStatus(filtered.length);

      grid.innerHTML = filtered.map(cat => {
        const meta = CATEGORY_META[cat];
        const info = data[cat] || { count: 0, games: [] };
        const games = info.games.slice(0, 3);
        const route = GENRE_ROUTES[activeRoute] || GENRE_ROUTES.all;
        const isHighlighted = activeRoute !== 'all' && route.categories.includes(cat);
        const leadTag = (games[0]?.tags || games[0]?.genre || []).find(Boolean) || 'Genre lane';

        let thumbsHTML = '';
        if (games.length >= 2) {
          thumbsHTML = `<div class="cat-thumb-strip" data-image-reveal="center">
            ${games.slice(0,3).map(g => `
              <div class="cat-thumb">
                <img src="${g.image}" alt="${g.title}" loading="lazy" decoding="async" data-csp-onerror="this.parentElement.style.background='rgba(139,92,246,0.08)'">
              </div>`).join('')}
          </div>`;
        } else {
          thumbsHTML = `<div class="cat-thumb-placeholder">${meta.icon}</div>`;
        }

        const countLabel = info.count === 0 ? 'No games yet'
          : info.count === 1 ? '1 game'
          : `${info.count} games`;

        return `
          <a href="store.html?genre=${encodeURIComponent(cat)}"
             class="category-card${isHighlighted ? ' is-highlighted' : ''}"
             role="listitem"
             data-tilt="6" data-glow
             aria-label="${cat} — ${countLabel}">
            ${thumbsHTML}
            <div class="cat-card-body">
              <div class="cat-card-header">
                <div class="cat-icon" data-cat-color="${meta.color}">${meta.icon}</div>
                <div class="cat-info">
                  <h3>${cat}</h3>
                  <span class="cat-count">${countLabel}</span>
                </div>
              </div>
              <span class="cat-browse-link">
                Browse
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </span>
            </div>
          </a>`;
      }).join('');

      grid.querySelectorAll('[data-cat-color]').forEach((el) => {
        const color = el.dataset.catColor;
        el.style.background = `${color}18`;
        el.style.borderColor = `${color}30`;
      });
    }

    function renderTags() {
      const db = window.GAME_DATABASE || [];
      const tagCount = {};

      db.forEach(game => {
        (game.tags || []).forEach(tag => {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        });
      });

      const sorted = Object.entries(tagCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30);

      const hot = ['Free-to-Play', 'Multiplayer', 'Singleplayer', 'Competitive', 'Esports'];

      document.getElementById('tag-cloud').innerHTML = sorted.map(([tag, count]) => {
        const isHot = hot.includes(tag);
        return `<a href="store.html?tag=${encodeURIComponent(tag)}"
                   class="tag-pill${isHot ? ' hot' : ''}"
                   role="listitem"
                   title="${count} games">${tag}</a>`;
      }).join('');
    }

    function renderTopRated() {
      const db = window.GAME_DATABASE || [];
      const top = [...db]
        .sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)
        .slice(0, 20);

      document.getElementById('toprated-scroll').innerHTML = top.map(game => `
        <a href="store.html?id=${game.id}"
           class="toprated-card"
           role="listitem"
           aria-label="${game.title} — rated ${game.rating}">
          <img src="${game.image}"
               alt="${game.title}"
               loading="lazy"
               data-csp-onerror="this.style.background='rgba(139,92,246,0.12)'">
          <div class="toprated-card__body">
            <div class="toprated-card__title">${game.title}</div>
            <div class="toprated-card__genre">${(game.genre || []).slice(0,2).join(' · ')}</div>
            <div class="toprated-card__meta">
              <span class="toprated-card__rating">★ ${game.rating.toFixed(1)}</span>
              <span class="toprated-card__price">${game.freeToPlay ? 'Free' : game.salePrice ? '$' + game.salePrice.toFixed(2) : '$' + game.price.toFixed(2)}</span>
            </div>
          </div>
        </a>`).join('');
    }

    /* Search filter */
    document.getElementById('cat-search-input').addEventListener('input', function () {
      renderCategories(this.value);
    });

    /* Init */
    document.addEventListener('DOMContentLoaded', () => {
      renderCategories();
      renderTags();
      renderTopRated();
    });

    /* Scroll reveal */
    (function () {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.style.opacity = '1';
            e.target.style.transform = 'translateY(0)';
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.06 });

      document.querySelectorAll('[data-reveal]').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(28px)';
        el.style.transition = 'opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1)';
        io.observe(el);
      });
    })();
