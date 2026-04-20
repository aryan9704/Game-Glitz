/**
 * Game Glitz global navigation and shared UI.
 * Adds page-aware search, quick navigation, and long-page section rails.
 */
(function () {
  'use strict';

  const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const LONG_PAGE_MIN_SECTIONS = 3;

  const PAGE_CONTEXTS = {
    'index.html': {
      title: 'Launch into GameGlitz',
      description: 'Jump into featured drops, premium perks, deals, community, and the biggest new releases.',
      sections: [
        { id: 'featured', label: 'Spotlight' },
        { id: 'stats', label: 'Stats' },
        { id: 'deals', label: 'Deals' },
        { id: 'newsletter', label: 'Newsletter' }
      ],
      routes: [
        { href: 'store.html', label: 'Browse Store', meta: 'Explore the catalog', icon: '🛒' },
        { href: 'categories.html', label: 'Browse Genres', meta: 'Jump by category', icon: '🧭' },
        { href: 'community.html', label: 'Join Community', meta: 'Find players and groups', icon: '💬' },
        { href: 'esports.html', label: 'Watch Esports', meta: 'Tournaments and live action', icon: '🏆' }
      ]
    },
    'store.html': {
      title: 'Find your next obsession',
      description: 'Move between featured launches, hot deals, subscription perks, and your full game discovery flow.',
      sections: [
        { id: 'main-content', label: 'Featured' },
        { id: 'deals', label: 'Deals' },
        { id: 'giftcards', label: 'Gift Cards' },
        { id: 'subscriptions', label: 'Plans' },
        { id: 'gridHeading', label: 'Browse Games' }
      ],
      routes: [
        { href: 'categories.html', label: 'Genre Explorer', meta: 'Curated category browsing', icon: '🎮' },
        { href: 'pricing.html', label: 'See Plans', meta: 'Membership perks', icon: '✨' },
        { href: 'support.html', label: 'Buying Help', meta: 'Payments and support', icon: '🛟' },
        { href: 'community.html', label: 'Community Picks', meta: 'See what others love', icon: '🔥' }
      ]
    },
    'categories.html': {
      title: 'Map the genre universe',
      description: 'Hop between genre clusters, top-rated picks, and curated paths without losing momentum.',
      sections: [
        { id: 'main-content', label: 'Explore' },
        { id: 'category-grid', label: 'Genre Grid' },
        { id: 'toprated-scroll', label: 'Top Rated' }
      ],
      routes: [
        { href: 'store.html', label: 'Open Store', meta: 'Filter the full catalog', icon: '🛒' },
        { href: 'community.html', label: 'See Communities', meta: 'Find people by play style', icon: '👥' },
        { href: 'news.html', label: 'Genre News', meta: 'Release coverage and trends', icon: '📰' },
        { href: 'developers.html', label: 'Partner Portal', meta: 'For studios and publishers', icon: '🧪' }
      ]
    },
    'community.html': {
      title: 'Drop into the conversation',
      description: 'Navigate threads, groups, LFG, events, and creator activity from one fast social hub.',
      routes: [
        { href: 'esports.html', label: 'Tournament Hub', meta: 'Live competition and rankings', icon: '🏅' },
        { href: 'support.html', label: 'Trust & Safety', meta: 'Reports and help', icon: '🛡️' },
        { href: 'news.html', label: 'Latest News', meta: 'Updates and announcements', icon: '⚡' },
        { href: 'profile.html', label: 'My Profile', meta: 'Identity and achievements', icon: '🪪' }
      ]
    },
    'esports.html': {
      title: 'Arena control center',
      description: 'Move between live matches, rankings, VODs, and notifications with a clearer tournament flow.',
      routes: [
        { href: 'community.html', label: 'Community Feed', meta: 'Find squads and event chatter', icon: '🎤' },
        { href: 'news.html', label: 'Esports News', meta: 'Coverage and results', icon: '📰' },
        { href: 'pricing.html', label: 'Premium Perks', meta: 'Unlock better access', icon: '✨' },
        { href: 'support.html', label: 'Event Support', meta: 'Issues and registration help', icon: '🛟' }
      ]
    },
    'developers.html': {
      title: 'Build with GameGlitz',
      description: 'Jump between platform capabilities, revenue models, tools, and partner proof points.',
      routes: [
        { href: 'about.html', label: 'Company Vision', meta: 'See the platform direction', icon: '🚀' },
        { href: 'pricing.html', label: 'Commercial Plans', meta: 'Membership economics', icon: '💠' },
        { href: 'support.html', label: 'Developer Support', meta: 'Talk to the team', icon: '🧠' },
        { href: 'news.html', label: 'Platform Updates', meta: 'Announcements and launches', icon: '🛰️' }
      ]
    },
    'about.html': {
      title: 'Inside the brand',
      description: 'Move through the company story, culture, milestones, and what powers the GameGlitz experience.',
      routes: [
        { href: 'developers.html', label: 'Partner with Us', meta: 'Studio and publisher tools', icon: '🧪' },
        { href: 'community.html', label: 'Join Community', meta: 'See the player ecosystem', icon: '💬' },
        { href: 'news.html', label: 'Latest Updates', meta: 'Announcements and releases', icon: '📡' },
        { href: 'support.html', label: 'Need Help', meta: 'Support and status', icon: '🛟' }
      ]
    },
    'support.html': {
      title: 'Fast help, less friction',
      description: 'Jump directly to contact, status, response times, and self-serve answers.',
      routes: [
        { href: 'faq.html', label: 'Open FAQ', meta: 'Quick answers', icon: '❓' },
        { href: 'legal.html', label: 'Policy Center', meta: 'Refunds, privacy, and terms', icon: '📘' },
        { href: 'account.html', label: 'Account Center', meta: 'Security and settings', icon: '🔐' },
        { href: 'store.html', label: 'Back to Store', meta: 'Keep browsing', icon: '🛒' }
      ]
    },
    'account.html': {
      title: 'Control your account',
      description: 'Move faster between auth, library, wishlist, orders, settings, and security.',
      routes: [
        { href: 'profile.html', label: 'View Profile', meta: 'Public identity and achievements', icon: '🪪' },
        { href: 'store.html', label: 'Back to Store', meta: 'Return to browsing', icon: '🛒' },
        { href: 'support.html', label: 'Account Help', meta: 'Get support fast', icon: '🛟' },
        { href: 'pricing.html', label: 'Upgrade Plan', meta: 'Membership benefits', icon: '💎' }
      ]
    },
    'pricing.html': {
      title: 'Choose your access level',
      description: 'Compare plans, billing, FAQs, and premium value without losing your place.',
      routes: [
        { href: 'store.html', label: 'Store Benefits', meta: 'See the catalog impact', icon: '🛒' },
        { href: 'account.html', label: 'Manage Account', meta: 'Billing and profile', icon: '⚙️' },
        { href: 'faq.html', label: 'Plan FAQ', meta: 'Billing and subscription answers', icon: '❓' },
        { href: 'support.html', label: 'Talk to Support', meta: 'Help with plans', icon: '🛟' }
      ]
    },
    'news.html': {
      title: 'What is moving in gaming',
      description: 'Jump through platform updates, community highlights, new releases, and esports coverage.',
      routes: [
        { href: 'store.html', label: 'Shop the Story', meta: 'Browse games behind the headlines', icon: '🛒' },
        { href: 'community.html', label: 'Community Pulse', meta: 'Player conversations', icon: '💬' },
        { href: 'esports.html', label: 'Competitive Scene', meta: 'Live tournament hub', icon: '🏆' },
        { href: 'developers.html', label: 'Developer Portal', meta: 'Studio-side updates', icon: '🧪' }
      ]
    },
    'faq.html': {
      title: 'Find the answer faster',
      description: 'Jump across support topics, account questions, refunds, and technical help.',
      routes: [
        { href: 'support.html', label: 'Contact Support', meta: 'Open a ticket', icon: '🛟' },
        { href: 'legal.html', label: 'Policy Details', meta: 'Refund and legal terms', icon: '📘' },
        { href: 'account.html', label: 'Account Center', meta: 'Security and login', icon: '🔐' },
        { href: 'store.html', label: 'Return to Store', meta: 'Keep shopping', icon: '🛒' }
      ]
    },
    'legal.html': {
      title: 'Policy navigator',
      description: 'Move between terms, privacy, refunds, cookies, and community standards with less scanning.',
      routes: [
        { href: 'support.html', label: 'Support Center', meta: 'Questions and help', icon: '🛟' },
        { href: 'faq.html', label: 'FAQ', meta: 'Plain-language answers', icon: '❓' },
        { href: 'about.html', label: 'About GameGlitz', meta: 'Company context', icon: '🚀' },
        { href: 'account.html', label: 'Account & Privacy', meta: 'Your settings', icon: '🔐' }
      ]
    }
  };

  let railObserver = null;

  function getCurrentPage() {
    return location.pathname.split('/').pop() || 'index.html';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function trimText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function formatPrice(game) {
    if (!game) return '';
    const price = game.salePrice != null ? game.salePrice : game.price;
    if (price === 0) return 'Free';
    return '$' + Number(price || 0).toFixed(2);
  }

  function getAuthState() {
    const gg = window.GG;
    const isLoggedIn = !!(gg && gg.Auth && gg.Auth.isLoggedIn);
    const user = isLoggedIn ? gg.Auth.currentUser : null;
    const cartCount = gg && gg.Cart ? gg.Cart.count : 0;
    return { isLoggedIn, user, cartCount };
  }

  function getPageContext(currentPage) {
    const base = PAGE_CONTEXTS[currentPage] || {
      title: 'Explore GameGlitz',
      description: 'Jump between the store, community, support, and platform destinations faster.',
      routes: [
        { href: 'store.html', label: 'Browse Store', meta: 'Games, deals, and releases', icon: '🛒' },
        { href: 'categories.html', label: 'Categories', meta: 'Browse by genre', icon: '🧭' },
        { href: 'community.html', label: 'Community', meta: 'Groups and discussions', icon: '💬' },
        { href: 'support.html', label: 'Support', meta: 'Get help fast', icon: '🛟' }
      ],
      sections: []
    };
    return {
      title: base.title,
      description: base.description,
      routes: Array.isArray(base.routes) ? base.routes.slice() : [],
      sections: Array.isArray(base.sections) ? base.sections.slice() : []
    };
  }

  function dedupeBy(list, getKey) {
    const seen = new Set();
    return list.filter(item => {
      const key = getKey(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function collectSectionTargets(context) {
    const collected = [];

    context.sections.forEach(section => {
      const target = document.getElementById(section.id);
      if (target) {
        collected.push({ id: section.id, label: section.label });
      }
    });

    const dynamicSections = Array.from(document.querySelectorAll('main section[id], section[id], [data-nav-section][id], .section[id]'))
      .map(section => {
        const heading = section.querySelector('h2, h3, .section-title, [data-nav-title]');
        const label = trimText(section.getAttribute('data-nav-title') || (heading && heading.textContent));
        return label ? { id: section.id, label } : null;
      })
      .filter(Boolean);

    return dedupeBy(collected.concat(dynamicSections), item => item.id).slice(0, 8);
  }

  function getSearchQuickLinks(context, sectionTargets) {
    const pageShortcuts = context.routes.map(route => ({
      href: route.href,
      label: route.label,
      meta: route.meta,
      icon: route.icon,
      type: 'route'
    }));

    const sectionShortcuts = sectionTargets.slice(0, 4).map(section => ({
      href: `#${section.id}`,
      label: section.label,
      meta: 'Jump on this page',
      icon: '↘',
      type: 'section'
    }));

    const defaults = [
      { href: 'store.html', label: 'Store', meta: 'Games and deals', icon: '🛒', type: 'route' },
      { href: 'categories.html', label: 'Categories', meta: 'Genre map', icon: '🧭', type: 'route' },
      { href: 'community.html', label: 'Community', meta: 'Groups and posts', icon: '💬', type: 'route' },
      { href: 'esports.html', label: 'Esports', meta: 'Live competition', icon: '🏆', type: 'route' },
      { href: 'support.html', label: 'Support', meta: 'Help and status', icon: '🛟', type: 'route' },
      { href: 'developers.html', label: 'Developers', meta: 'Partner portal', icon: '🧪', type: 'route' }
    ];

    return dedupeBy(pageShortcuts.concat(sectionShortcuts).concat(defaults), item => `${item.type}:${item.href}`).slice(0, 8);
  }

  function getRouteMatches(query, links) {
    const normalized = trimText(query).toLowerCase();
    if (!normalized) return [];
    return links.filter(link => {
      const haystack = `${link.label} ${link.meta}`.toLowerCase();
      return haystack.includes(normalized);
    }).slice(0, 4);
  }

  function getGameMatches(query) {
    const db = window.GAME_DATABASE || [];
    const normalized = trimText(query).toLowerCase();
    if (!normalized || normalized.length < 2) return [];
    return db.filter(game => {
      const haystack = [
        game.title,
        game.developer,
        game.publisher,
        ...(game.genre || []),
        ...(game.tags || [])
      ].join(' ').toLowerCase();
      return haystack.includes(normalized);
    }).slice(0, 6);
  }

  function createFloatingSearch() {
    if (document.getElementById('floating-search-btn')) return;

    const button = document.createElement('button');
    button.id = 'floating-search-btn';
    button.setAttribute('aria-label', 'Search');
    button.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.3-4.3"></path>
      </svg>
    `;
    button.addEventListener('click', () => toggleSearch());
    document.body.appendChild(button);
  }

  function renderQuickSearch(context, sectionTargets) {
    const quickGrid = document.getElementById('search-quick-grid');
    const contextTitle = document.getElementById('search-context-title');
    const contextDesc = document.getElementById('search-context-desc');
    const contextActions = document.getElementById('search-context-actions');
    if (!quickGrid || !contextTitle || !contextDesc || !contextActions) return [];

    const links = getSearchQuickLinks(context, sectionTargets);
    const sectionLinks = sectionTargets.slice(0, 5);

    contextTitle.textContent = context.title;
    contextDesc.textContent = context.description;
    contextActions.innerHTML = sectionLinks.map(section => {
      return `<a class="search-context-chip" href="#${section.id}">${escapeHtml(section.label)}</a>`;
    }).join('');

    quickGrid.innerHTML = links.map(link => `
      <a href="${escapeHtml(link.href)}" class="search-quick-card" data-search-kind="${escapeHtml(link.type)}">
        <span class="search-quick-card__icon">${escapeHtml(link.icon)}</span>
        <div class="search-quick-card__body">
          <div class="search-quick-card__title">${escapeHtml(link.label)}</div>
          <div class="search-quick-card__meta">${escapeHtml(link.meta)}</div>
        </div>
      </a>
    `).join('');

    return links;
  }

  function renderSearchResults(query, context, sectionTargets) {
    const results = document.getElementById('search-results');
    const quickGrid = document.getElementById('search-quick-grid');
    if (!results || !quickGrid) return;

    const normalized = trimText(query);
    if (normalized.length < 2) {
      results.innerHTML = '';
      quickGrid.classList.remove('is-searching');
      renderQuickSearch(context, sectionTargets);
      return;
    }

    const links = getSearchQuickLinks(context, sectionTargets);
    const routeMatches = getRouteMatches(normalized, links);
    const gameMatches = getGameMatches(normalized);

    quickGrid.classList.add('is-searching');

    if (!routeMatches.length && !gameMatches.length) {
      results.innerHTML = '<div class="search-no-results">No routes or games matched that search.</div>';
      return;
    }

    const routeHtml = routeMatches.length ? `
      <div class="search-result-group">
        <div class="search-result-group__label">Quick Routes</div>
        <div class="search-result-route-row">
          ${routeMatches.map(link => `
            <a href="${escapeHtml(link.href)}" class="search-route-pill">
              <span>${escapeHtml(link.icon)}</span>
              <span>${escapeHtml(link.label)}</span>
            </a>
          `).join('')}
        </div>
      </div>
    ` : '';

    const gameHtml = gameMatches.map(game => `
      <a href="game.html?slug=${encodeURIComponent(game.slug || game.id)}" class="search-result-item">
        <img src="${escapeHtml(game.image || 'images/bg.webp')}" alt="${escapeHtml(game.title)}" loading="lazy" decoding="async">
        <div class="search-result-copy">
          <div class="search-result-title">${escapeHtml(game.title)}</div>
          <div class="search-result-meta">${escapeHtml(game.developer || 'GameGlitz')} • ${escapeHtml(formatPrice(game))}</div>
        </div>
      </a>
    `).join('');

    results.innerHTML = `${routeHtml}${gameHtml}`;
  }

  function closeSearch() {
    const overlay = document.getElementById('search-overlay');
    if (!overlay) return;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('gg-search-open');
    // Clear the search input so stale queries don't appear on next open
    const input = document.getElementById('global-search');
    if (input) input.value = '';
  }

  function openSearch(context, sectionTargets) {
    const overlay = document.getElementById('search-overlay');
    const input = document.getElementById('global-search');
    if (!overlay || !input) return;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('gg-search-open');
    renderQuickSearch(context, sectionTargets);
    renderSearchResults('', context, sectionTargets);
    window.requestAnimationFrame(() => input.focus());
  }

  function attachSearchBehavior(context, sectionTargets) {
    const overlay = document.getElementById('search-overlay');
    const input = document.getElementById('global-search');
    if (!overlay || !input) return;

    let debounce = null;
    input.addEventListener('input', () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        renderSearchResults(input.value, context, sectionTargets);
      }, 120);
    });

    input.addEventListener('focus', () => {
      if (trimText(input.value).length < 2) {
        renderQuickSearch(context, sectionTargets);
      }
    });

    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        closeSearch();
      }
    });

    overlay.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (!link) return;
      closeSearch();
    });
  }

  function attachNavScroll(nav, rail) {
    if (window._navScrollHandler) {
      window.removeEventListener('scroll', window._navScrollHandler);
    }

    let lastScrollY = window.scrollY;

    window._navScrollHandler = () => {
      const currentY = window.scrollY;
      const scrollingDown = currentY > lastScrollY;
      nav.classList.toggle('scrolled', currentY > 20);
      nav.classList.toggle('hidden', scrollingDown && currentY > 100);

      const floatingSearch = document.getElementById('floating-search-btn');
      const navSearch = document.getElementById('nav-search-btn-main');
      const shouldFloat = currentY > 150;

      if (navSearch) {
        navSearch.style.opacity = shouldFloat ? '0' : '1';
        navSearch.style.pointerEvents = shouldFloat ? 'none' : 'auto';
      }

      if (floatingSearch) {
        floatingSearch.classList.toggle('visible', shouldFloat);
      }

      if (rail && !rail.hasAttribute('hidden')) rail.classList.toggle('visible', currentY > 260);

      lastScrollY = currentY;
    };

    window.addEventListener('scroll', window._navScrollHandler, { passive: true });
    window._navScrollHandler();
  }

  function injectPageRail(sectionTargets) {
    let rail = document.getElementById('page-rail');
    if (railObserver) {
      railObserver.disconnect();
      railObserver = null;
    }

    if (!rail) {
      rail = document.createElement('nav');
      rail.id = 'page-rail';
      rail.className = 'page-rail';
      rail.setAttribute('aria-label', 'On this page');
      document.body.appendChild(rail);
    }

    if (!sectionTargets || sectionTargets.length < LONG_PAGE_MIN_SECTIONS) {
      rail.setAttribute('hidden', 'hidden');
      rail.innerHTML = '';
      return rail;
    }

    rail.removeAttribute('hidden');
    rail.innerHTML = `
      <div class="page-rail__label">On This Page</div>
      <div class="page-rail__items">
        ${sectionTargets.map(section => `
          <a href="#${escapeHtml(section.id)}" class="page-rail__item" data-rail-target="${escapeHtml(section.id)}">
            <span class="page-rail__dot"></span>
            <span>${escapeHtml(section.label)}</span>
          </a>
        `).join('')}
      </div>
    `;

    railObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        rail.querySelectorAll('.page-rail__item').forEach(item => {
          item.classList.toggle('active', item.getAttribute('data-rail-target') === entry.target.id);
        });
      });
    }, { rootMargin: '-28% 0px -55% 0px', threshold: 0.05 });

    sectionTargets.forEach(section => {
      const el = document.getElementById(section.id);
      if (el) railObserver.observe(el);
    });

    rail.classList.toggle('visible', window.scrollY > 260);
    return rail;
  }

  function injectNav() {
    const nav = document.getElementById('glitz-nav');
    if (!nav) return;

    const currentPage = getCurrentPage();
    const context = getPageContext(currentPage);
    const sectionTargets = collectSectionTargets(context);
    const auth = getAuthState();
    const isActive = page => currentPage === page ? 'active' : '';
    const userName = auth.user ? (auth.user.display_name || auth.user.displayName || auth.user.username || '?') : '';
    const avatarInitial = userName.charAt(0).toUpperCase() || '?';

    const avatarContent = auth.isLoggedIn
      ? `<span class="nav-avatar__initial">${escapeHtml(avatarInitial)}</span>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

    nav.innerHTML = `
      <div class="nav-inner">
        <a href="index.html" class="nav-logo" aria-label="Game Glitz Home">
          <svg class="logo-icon" width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <rect x="2" y="2" width="32" height="32" rx="8" stroke="url(#logo-grad)" stroke-width="2.5"></rect>
            <path d="M12 11h8l-3 6h5l-10 10 3-7h-5l2-9z" fill="url(#logo-grad)"></path>
            <defs>
              <linearGradient id="logo-grad" x1="0" y1="0" x2="36" y2="36">
                <stop stop-color="#8B5CF6"></stop>
                <stop offset="0.5" stop-color="#6366F1"></stop>
                <stop offset="1" stop-color="#06B6D4"></stop>
              </linearGradient>
            </defs>
          </svg>
          <span class="logo-text">Game<span class="logo-accent">Glitz</span></span>
        </a>

        <nav class="nav-links hide-mobile" aria-label="Main navigation">
          <a href="index.html" class="nav-link ${isActive('index.html')}">Home</a>
          <a href="store.html" class="nav-link ${isActive('store.html')}">Store</a>
          <a href="categories.html" class="nav-link ${isActive('categories.html')}">Categories</a>
          <a href="community.html" class="nav-link ${isActive('community.html')}">Community</a>
          <a href="esports.html" class="nav-link ${isActive('esports.html')}">Esports</a>
          <a href="news.html" class="nav-link ${isActive('news.html')}">News</a>
          <a href="support.html" class="nav-link ${isActive('support.html')}">Support</a>
        </nav>

        <div class="nav-actions">
          <button class="nav-search-btn btn-icon" id="nav-search-btn-main" aria-label="Open smart search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.3-4.3"></path>
            </svg>
          </button>
          <button class="nav-cart btn-icon" aria-label="Cart" data-csp-onclick="openCartPanel()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="21" r="1"></circle><circle cx="19" cy="21" r="1"></circle><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path></svg>
            <span class="cart-count${auth.cartCount > 0 ? ' is-visible' : ''}" id="cart-count">${auth.cartCount}</span>
          </button>
          <a href="account.html" class="nav-avatar btn-icon" aria-label="${auth.isLoggedIn ? escapeHtml(userName) : 'Account'}" title="${auth.isLoggedIn ? escapeHtml(userName) : 'Sign In'}">
            ${avatarContent}
          </a>
          <button class="nav-menu-btn btn-icon hide-desktop" aria-label="Open mobile menu" data-csp-onclick="toggleMobileMenu()">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
          </button>
        </div>
      </div>

      <div class="mobile-menu" id="mobile-menu" aria-hidden="true">
        <a href="index.html" class="mobile-link ${isActive('index.html')}">Home</a>
        <a href="store.html" class="mobile-link ${isActive('store.html')}">Store</a>
        <a href="categories.html" class="mobile-link ${isActive('categories.html')}">Categories</a>
        <a href="community.html" class="mobile-link ${isActive('community.html')}">Community</a>
        <a href="esports.html" class="mobile-link ${isActive('esports.html')}">Esports</a>
        <a href="news.html" class="mobile-link ${isActive('news.html')}">News</a>
        <a href="about.html" class="mobile-link ${isActive('about.html')}">About</a>
        <a href="support.html" class="mobile-link ${isActive('support.html')}">Support</a>
        <a href="faq.html" class="mobile-link ${isActive('faq.html')}">FAQ</a>
        <a href="pricing.html" class="mobile-link ${isActive('pricing.html')}">Pricing</a>
        <a href="developers.html" class="mobile-link ${isActive('developers.html')}">Developers</a>
        <a href="legal.html" class="mobile-link ${isActive('legal.html')}">Legal</a>
        <div class="mobile-divider"></div>
        <a href="account.html" class="mobile-link">${auth.isLoggedIn ? 'My Account' : 'Sign In'}</a>
        ${auth.isLoggedIn ? '<a href="profile.html" class="mobile-link">Profile</a>' : ''}
        ${auth.isLoggedIn ? '<a href="#" class="mobile-link" id="mobile-logout-link">Log Out</a>' : ''}
      </div>

      <div class="search-overlay" id="search-overlay" aria-hidden="true">
        <div class="search-atmosphere" aria-hidden="true">
          <div class="search-orb search-orb--violet"></div>
          <div class="search-orb search-orb--cyan"></div>
          <div class="search-grid"></div>
        </div>
        <div class="search-panel">
          <div class="search-context glass">
            <div class="search-context-copy">
              <span class="search-context-label">Smart Navigation</span>
              <h2 class="search-context-title" id="search-context-title"></h2>
              <p class="search-context-desc" id="search-context-desc"></p>
            </div>
            <div class="search-context-actions" id="search-context-actions"></div>
          </div>

          <div class="search-container glass-heavy">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
            <input type="search" class="search-input" placeholder="Search games, pages, or sections..." id="global-search" autocomplete="off">
            <kbd class="search-kbd">ESC</kbd>
          </div>

          <div class="search-suggestion-shell">
            <div class="search-quick-grid" id="search-quick-grid"></div>
            <div class="search-results" id="search-results"></div>
          </div>
        </div>
      </div>
    `;

    createFloatingSearch();
    attachSearchBehavior(context, sectionTargets);
    const rail = injectPageRail(sectionTargets);
    attachNavScroll(nav, rail);

    const navSearchBtn = document.getElementById('nav-search-btn-main');
    if (navSearchBtn) {
      navSearchBtn.addEventListener('click', () => toggleSearch());
    }

    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) {
      mobileMenu.addEventListener('click', event => {
        const link = event.target.closest('a');
        if (link) {
          mobileMenu.setAttribute('aria-hidden', 'true');
        }
      });
    }

    const mobileLogout = document.getElementById('mobile-logout-link');
    if (mobileLogout) {
      mobileLogout.addEventListener('click', event => {
        event.preventDefault();
        if (window.GG && GG.Auth) {
          GG.Auth.logout();
          location.reload();
        }
      });
    }
  }

  window.toggleSearch = function toggleSearch() {
    const overlay = document.getElementById('search-overlay');
    if (!overlay) return;
    const currentPage = getCurrentPage();
    const context = getPageContext(currentPage);
    const sectionTargets = collectSectionTargets(context);
    const isOpen = overlay.getAttribute('aria-hidden') === 'false';
    if (isOpen) {
      closeSearch();
    } else {
      openSearch(context, sectionTargets);
    }
  };

  window.toggleMobileMenu = function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    if (!menu) return;
    const isOpen = menu.getAttribute('aria-hidden') === 'false';
    menu.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
  };

  window.openCartPanel = function openCartPanel() {
    window.dispatchEvent(new CustomEvent('openCart'));
    if (!document.getElementById('cartPanel') && !document.getElementById('cart-panel')) {
      window.location.href = 'store.html';
    }
  };

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeSearch();
      const menu = document.getElementById('mobile-menu');
      if (menu) menu.setAttribute('aria-hidden', 'true');
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      toggleSearch();
    }
  });

  function injectFooter() {
    const footer = document.getElementById('glitz-footer');
    if (!footer) return;

    footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-top">
          <div class="footer-brand">
            <a href="index.html" class="nav-logo">
              <svg class="logo-icon" width="32" height="32" viewBox="0 0 36 36" fill="none">
                <rect x="2" y="2" width="32" height="32" rx="8" stroke="url(#flogo-grad)" stroke-width="2.5"></rect>
                <path d="M12 11h8l-3 6h5l-10 10 3-7h-5l2-9z" fill="url(#flogo-grad)"></path>
                <defs><linearGradient id="flogo-grad" x1="0" y1="0" x2="36" y2="36"><stop stop-color="#8B5CF6"></stop><stop offset="1" stop-color="#06B6D4"></stop></linearGradient></defs>
              </svg>
              <span class="logo-text">Game<span class="logo-accent">Glitz</span></span>
            </a>
            <p class="footer-tagline">The ultimate gaming platform. Discover, play, connect.</p>
            <div class="footer-security-badges">
              <span class="badge badge-success">🔒 SSL Secured</span>
              <span class="badge badge-primary">🛡️ DDoS Protected</span>
              <span class="badge badge-warning">✓ PCI Compliant</span>
            </div>
          </div>

          <div class="footer-links-group">
            <div class="footer-col">
              <h4>Platform</h4>
              <a href="store.html">Store</a>
              <a href="categories.html">Categories</a>
              <a href="store.html#deals">Deals</a>
              <a href="pricing.html">Subscriptions</a>
            </div>
            <div class="footer-col">
              <h4>Community</h4>
              <a href="community.html">Forums</a>
              <a href="community.html#groups">Groups</a>
              <a href="esports.html">Esports</a>
              <a href="news.html">News</a>
            </div>
            <div class="footer-col">
              <h4>Company</h4>
              <a href="about.html">About Us</a>
              <a href="about.html#careers">Careers</a>
              <a href="developers.html">Developers</a>
              <a href="sitemap.html">Sitemap</a>
            </div>
            <div class="footer-col">
              <h4>Support</h4>
              <a href="support.html">Help Center</a>
              <a href="faq.html">FAQ</a>
              <a href="support.html#contact">Contact</a>
              <a href="support.html#status">Status</a>
            </div>
          </div>
        </div>

        <div class="footer-divider"></div>

        <div class="footer-bottom">
          <p>&copy; 2026 Game Glitz. All rights reserved.</p>
          <div class="footer-legal">
            <a href="legal.html#terms">Terms</a>
            <a href="legal.html#privacy">Privacy</a>
            <a href="legal.html#cookies">Cookies</a>
            <a href="legal.html#refund">Refund Policy</a>
            <a href="offline.html">Offline</a>
          </div>
          <div class="footer-social">
            <a href="https://discord.gg/gameglitz" target="_blank" rel="noopener" aria-label="Discord" class="social-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"></path></svg></a>
            <a href="https://x.com/gameglitz" target="_blank" rel="noopener" aria-label="Twitter / X" class="social-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg></a>
            <a href="https://youtube.com/@gameglitz" target="_blank" rel="noopener" aria-label="YouTube" class="social-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"></path></svg></a>
            <a href="https://twitch.tv/gameglitz" target="_blank" rel="noopener" aria-label="Twitch" class="social-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"></path></svg></a>
          </div>
        </div>
      </div>
    `;
  }

  // ── Cookie consent banner (GDPR K20) ───────────────────
  function initCookieConsent() {
    const STORAGE_KEY = 'gg_cookie_consent';
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {}

    const banner = document.createElement('div');
    banner.id = 'gg-cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.style.cssText = [
      'position:fixed', 'bottom:0', 'left:0', 'right:0', 'z-index:99998',
      'background:rgba(13,10,26,0.97)', 'border-top:1px solid rgba(139,92,246,0.35)',
      'padding:16px 24px', 'display:flex', 'align-items:center', 'justify-content:space-between',
      'flex-wrap:wrap', 'gap:12px', 'font-family:system-ui,sans-serif', 'font-size:14px',
      'color:#c4b5fd', 'box-shadow:0 -8px 32px rgba(0,0,0,0.5)',
      'transform:translateY(100%)', 'transition:transform 0.3s cubic-bezier(0.16,1,0.3,1)'
    ].join(';');

    const msgEl = document.createElement('p');
    msgEl.style.cssText = 'margin:0;flex:1;min-width:200px;color:#c4b5fd;line-height:1.5';
    msgEl.textContent = 'We use cookies for authentication and analytics. By continuing, you agree to our ';
    const link = document.createElement('a');
    link.href = '/legal.html';
    link.textContent = 'Privacy Policy';
    link.style.cssText = 'color:#a78bfa;text-decoration:underline';
    msgEl.appendChild(link);
    msgEl.appendChild(document.createTextNode('.'));

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;flex-shrink:0';

    function dismiss(choice) {
      try { localStorage.setItem(STORAGE_KEY, choice); } catch {}
      banner.style.transform = 'translateY(100%)';
      setTimeout(() => banner.remove(), 400);
    }

    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.textContent = 'Accept All';
    acceptBtn.style.cssText = 'padding:8px 18px;border-radius:8px;border:none;background:linear-gradient(135deg,#8b5cf6,#06b6d4);color:#fff;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit';
    acceptBtn.addEventListener('click', () => dismiss('accepted'));

    const declineBtn = document.createElement('button');
    declineBtn.type = 'button';
    declineBtn.textContent = 'Decline';
    declineBtn.style.cssText = 'padding:8px 18px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#c4b5fd;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit';
    declineBtn.addEventListener('click', () => dismiss('declined'));

    btnRow.appendChild(acceptBtn);
    btnRow.appendChild(declineBtn);
    banner.appendChild(msgEl);
    banner.appendChild(btnRow);
    document.body.appendChild(banner);
    requestAnimationFrame(() => { banner.style.transform = 'translateY(0)'; });
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectNav();
    injectFooter();
    initCookieConsent();

    if (window.GG && GG.on) {
      GG.on('auth:login', () => injectNav());
      GG.on('auth:logout', () => injectNav());
    }
  });
})();
