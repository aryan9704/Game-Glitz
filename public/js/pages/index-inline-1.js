/* ═══════════════════════════════════════════════════════════════
   HOMEPAGE MAIN SCRIPT
   ═══════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasFinePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ─────────────────────────────────────────────
     CUSTOM CURSOR
     ───────────────────────────────────────────── */
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  let mx = window.innerWidth/2, my = window.innerHeight/2;
  let rx = mx, ry = my;

  if (dot && ring && hasFinePointer && !prefersReducedMotion) {
    const onCursorMove = e => {
      if (!dot.isConnected || !ring.isConnected) {
        document.removeEventListener('mousemove', onCursorMove);
        return;
      }
      mx = e.clientX; my = e.clientY;
      dot.style.left = mx + 'px'; dot.style.top = my + 'px';
    };
    document.addEventListener('mousemove', onCursorMove);

    (function animateCursor() {
      if (!dot.isConnected || !ring.isConnected) return;
      rx += (mx - rx) * 0.12;
      ry += (my - ry) * 0.12;
      ring.style.left = rx + 'px'; ring.style.top = ry + 'px';
      requestAnimationFrame(animateCursor);
    })();
  }
  (function initHero() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas || typeof THREE === 'undefined' || prefersReducedMotion) return;

    const scene = new THREE.Scene();
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    const camera = new THREE.PerspectiveCamera(65, w / h, 0.1, 1000);
    camera.position.z = 22;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    // ── GEOMETRY OBJECTS ──────────────────────
    const geoGroup = new THREE.Group();
    scene.add(geoGroup);

    const mats = {
      purple: new THREE.MeshBasicMaterial({ color: 0x8B5CF6, wireframe: true, transparent: true, opacity: 0.45 }),
      cyan:   new THREE.MeshBasicMaterial({ color: 0x06B6D4, wireframe: true, transparent: true, opacity: 0.35 }),
      violet: new THREE.MeshBasicMaterial({ color: 0x6366F1, wireframe: true, transparent: true, opacity: 0.3 }),
      purpleS:new THREE.MeshBasicMaterial({ color: 0xa78bfa, wireframe: true, transparent: true, opacity: 0.25 }),
    };

    const objects = [
      { geo: new THREE.IcosahedronGeometry(3.5, 1), mat: mats.purple, x: 0, y: 0, z: 0, rx: 0.003, ry: 0.005, rz: 0.002 },
      { geo: new THREE.OctahedronGeometry(2.2, 0),  mat: mats.cyan,   x:-9, y: 3, z:-5, rx: 0.006, ry: 0.004, rz: 0.003 },
      { geo: new THREE.BoxGeometry(2.8, 2.8, 2.8),  mat: mats.violet, x: 10, y:-3, z:-6, rx: 0.004, ry: 0.007, rz: 0.002 },
      { geo: new THREE.IcosahedronGeometry(1.8, 0), mat: mats.purpleS,x:-8, y:-5, z:-8, rx: 0.007, ry: 0.003, rz: 0.005 },
      { geo: new THREE.OctahedronGeometry(1.4, 0),  mat: mats.cyan,   x: 8,  y: 6, z:-4, rx: 0.005, ry: 0.006, rz: 0.004 },
      { geo: new THREE.IcosahedronGeometry(1.2, 0), mat: mats.violet, x:-4,  y: 7, z:-10,rx: 0.004, ry: 0.008, rz: 0.003 },
      { geo: new THREE.BoxGeometry(1.5, 1.5, 1.5),  mat: mats.purple, x: 5,  y:-7, z:-9, rx: 0.006, ry: 0.003, rz: 0.007 },
    ];

    const meshes = objects.map(o => {
      const m = new THREE.Mesh(o.geo, o.mat);
      m.position.set(o.x, o.y, o.z);
      m.userData = { rx: o.rx, ry: o.ry, rz: o.rz };
      geoGroup.add(m);
      return m;
    });

    // ── PARTICLES ──────────────────────────────
    const COUNT = 3000;
    const positions = new Float32Array(COUNT * 3);
    const colors    = new Float32Array(COUNT * 3);
    const sizes     = new Float32Array(COUNT);
    const speeds    = new Float32Array(COUNT);
    const origY     = new Float32Array(COUNT);

    const c1 = new THREE.Color(0x8B5CF6);
    const c2 = new THREE.Color(0x06B6D4);
    const c3 = new THREE.Color(0x6366F1);
    const palette = [c1, c2, c3];

    for (let i = 0; i < COUNT; i++) {
      positions[i*3]   = (Math.random() - 0.5) * 80;
      positions[i*3+1] = (Math.random() - 0.5) * 60;
      positions[i*3+2] = (Math.random() - 0.5) * 50 - 10;
      origY[i] = positions[i*3+1];
      sizes[i] = Math.random() * 2.5 + 0.5;
      speeds[i] = Math.random() * 0.02 + 0.005;
      const col = palette[Math.floor(Math.random() * 3)];
      colors[i*3] = col.r; colors[i*3+1] = col.g; colors[i*3+2] = col.b;
    }

    const ptGeo = new THREE.BufferGeometry();
    ptGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    ptGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    ptGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const ptMat = new THREE.PointsMaterial({
      size: 0.1, vertexColors: true, transparent: true, opacity: 0.75,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(ptGeo, ptMat);
    scene.add(particles);

    // ── MOUSE PARALLAX ─────────────────────────
    let targetX = 0, targetY = 0, currX = 0, currY = 0;
    window.addEventListener('mousemove', e => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 3;
      targetY = -(e.clientY / window.innerHeight - 0.5) * 2;
    });

    // ── ANIMATE ────────────────────────────────
    let t = 0;
    function animate() {
      const heroEl = canvas.closest('#main-content') || canvas.parentElement;
      if (heroEl && heroEl.getBoundingClientRect().bottom < -100) {
        requestAnimationFrame(animate); return;
      }
      requestAnimationFrame(animate);
      t += 0.01;

      // rotate geometries
      meshes.forEach(m => {
        m.rotation.x += m.userData.rx;
        m.rotation.y += m.userData.ry;
        m.rotation.z += m.userData.rz;
      });

      // drift particles
      const pos = ptGeo.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        pos[i*3+1] += speeds[i];
        if (pos[i*3+1] > 30) pos[i*3+1] = -30;
      }
      ptGeo.attributes.position.needsUpdate = true;

      // camera parallax
      currX += (targetX - currX) * 0.05;
      currY += (targetY - currY) * 0.05;
      camera.position.x = currX;
      camera.position.y = currY;
      camera.lookAt(0, 0, 0);

      // pulse glow group scale
      const pulse = 1 + Math.sin(t * 1.5) * 0.02;
      geoGroup.scale.set(pulse, pulse, pulse);

      renderer.render(scene, camera);
    }
    animate();

    // ── RESIZE ─────────────────────────────────
    window.addEventListener('resize', () => {
      const w2 = canvas.offsetWidth, h2 = canvas.offsetHeight;
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    });
  })();

  /* ─────────────────────────────────────────────
     NEWSLETTER PARTICLE CANVAS
     ───────────────────────────────────────────── */
  (function initNLParticles() {
    const canvas = document.getElementById('nl-canvas');
    if (!canvas || prefersReducedMotion) return;
    const ctx = canvas.getContext('2d');
    let w, h, dots = [];

    function resize() {
      w = canvas.offsetWidth; h = canvas.offsetHeight;
      canvas.width = w; canvas.height = h;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 80; i++) {
      dots.push({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 1.5 + 0.5,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
        a: Math.random() * 0.6 + 0.2,
        col: Math.random() > 0.5 ? '139,92,246' : '6,182,212'
      });
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      dots.forEach(d => {
        d.x += d.vx; d.y += d.vy;
        if (d.x < 0) d.x = w; if (d.x > w) d.x = 0;
        if (d.y < 0) d.y = h; if (d.y > h) d.y = 0;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${d.col},${d.a})`;
        ctx.fill();
      });
      requestAnimationFrame(draw);
    }
    draw();
  })();

  /* ─────────────────────────────────────────────
     HELPERS
     ───────────────────────────────────────────── */
  function starsHtml(rating) {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  }

  function priceHtml(game) {
    if (game.freeToPlay) return '<span class="price-free">FREE</span>';
    if (game.salePrice) {
      const disc = Math.round((1 - game.salePrice / game.price) * 100);
      return `<span class="badge badge-sale ggs-7ccbee0cb8">-${disc}%</span><span class="price-original">$${game.price}</span><span class="price-sale">$${game.salePrice}</span>`;
    }
    return `<span class="price-full">$${game.price}</span>`;
  }

  function discountPct(game) {
    if (!game.salePrice) return 0;
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

  function safeImg(src) { return src || 'images/gamebg.webp'; }
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

  function genreArr(game) {
    return Array.isArray(game.genre) ? game.genre : [game.genre];
  }

  /* ─────────────────────────────────────────────
     TICKER
     ───────────────────────────────────────────── */
  function buildTicker() {
    const items = GAME_DATABASE.slice(0, 20);
    const el = document.getElementById('ticker-inner');
    if (!el) return;
    let html = '';
    // double for seamless loop
    for (let pass = 0; pass < 2; pass++) {
      items.forEach(g => {
        const p = g.freeToPlay ? 'FREE' : (g.salePrice ? `$${g.salePrice}` : `$${g.price}`);
        html += `<div class="ticker-item"><span>${g.title}</span><span class="ticker-sep">—</span><span>${p}</span></div>`;
      });
    }
    el.innerHTML = html;
  }

  /* ─────────────────────────────────────────────
     2. TRENDING GAMES
     ───────────────────────────────────────────── */
  function buildTrending() {
    const track = document.getElementById('trending-track');
    if (!track) return;
    const games = GAME_DATABASE.filter(g => g.trending);
    track.innerHTML = games.map(g => `
      <div class="game-card" data-tilt="6" data-glow>
        <div class="ggs-6982440012">
          <img src="${safeImg(g.image)}" alt="${g.title}" class="game-card-img" loading="lazy" decoding="async" data-image-reveal="left" />
        </div>
        <div class="game-card-body">
          ${g.trending ? '<span class="badge badge-trending ggs-ae82cd9c35">🔥 Trending</span>' : ''}
          <div class="game-card-title" title="${g.title}">${g.title}</div>
          <div class="game-card-meta">
            <div class="game-card-rating">
              <span class="stars">${starsHtml(g.rating)}</span>
              <span class="rating-count">${(g.reviews/1000).toFixed(1)}k</span>
            </div>
            <div class="game-card-price">${priceHtml(g)}</div>
          </div>
          <div class="game-card-actions">
            <button type="button" class="btn-cart" data-csp-onclick="addToCart(${g.id})">
              <svg class="ggs-7c23fdbfb2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
              Add to Cart
            </button>
            <button type="button" class="btn-wish" data-csp-onclick="toggleWish(this,${g.id})" title="Wishlist">♡</button>
          </div>
        </div>
      </div>
    `).join('');

    // auto-scroll
    let paused = false;
    track.addEventListener('mouseenter', () => paused = true);
    track.addEventListener('mouseleave', () => paused = false);
    setInterval(() => {
      if (!paused) {
        track.scrollLeft += 1;
        if (track.scrollLeft >= track.scrollWidth - track.clientWidth - 10) {
          track.scrollLeft = 0;
        }
      }
    }, 20);
  }

  /* ─────────────────────────────────────────────
     3. FEATURED
     ───────────────────────────────────────────── */
  function buildFeatured() {
    const grid = document.getElementById('featured-grid');
    if (!grid) return;
    const games = GAME_DATABASE.filter(g => g.featured).slice(0, 3);
    grid.innerHTML = games.map((g, i) => `
      <div class="featured-card" data-reveal="${i===0?'':'scale'}" data-featured-delay="${i*0.15}">
        <div class="featured-card-bg" data-featured-bg="${escapeHtml(safeImg(g.image))}" data-parallax="${0.15 + i*0.05}"></div>
        <div class="featured-card-overlay"></div>
        <div class="featured-card-content">
          <span class="featured-card-tag">${genreArr(g).join(' · ')}</span>
          <h3 class="featured-card-title">${g.title}</h3>
          ${i===0 ? `<p class="featured-card-desc">${g.description}</p>` : ''}
          <div class="featured-card-meta">
            <div>
              <span class="stars ggs-433de30b36">${starsHtml(g.rating)}</span>
              <span class="rating-count">(${(g.reviews/1000).toFixed(0)}k reviews)</span>
            </div>
            <div class="game-card-price ggs-80b90e3a0a">${priceHtml(g)}</div>
            <button type="button" class="btn btn-primary btn-sm" data-csp-onclick="addToCart(${g.id})" data-magnetic>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
              Add to Cart
            </button>
            <a href="store.html?game=${g.slug}" class="btn btn-secondary btn-sm">View Details</a>
          </div>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('[data-featured-delay]').forEach((el) => {
      el.style.transitionDelay = `${el.dataset.featuredDelay}s`;
    });
    grid.querySelectorAll('[data-featured-bg]').forEach((el) => {
      setBackgroundImage(el, el.dataset.featuredBg);
    });
  }

  /* ─────────────────────────────────────────────
     4. NEW RELEASES
     ───────────────────────────────────────────── */
  function buildNewReleases() {
    const grid = document.getElementById('new-releases-grid');
    if (!grid) return;
    const games = GAME_DATABASE.filter(g => g.newRelease).slice(0, 8);
    grid.innerHTML = games.map(g => `
      <div class="new-card" data-tilt="6" data-glow data-gradient-border>
        <div class="ggs-6982440012">
          <img src="${safeImg(g.image)}" alt="${g.title}" class="new-card-img" loading="lazy" decoding="async" data-image-reveal="center" />
        </div>
        <div class="new-badge-wrap">
          <span class="badge badge-new">✦ New</span>
        </div>
        <div class="new-card-body">
          <div class="new-card-title">${g.title}</div>
          <div class="new-card-genres">
            ${genreArr(g).slice(0,2).map(genre => `<span class="genre-tag">${genre}</span>`).join('')}
          </div>
          <div class="new-card-footer">
            <div class="game-card-price">${priceHtml(g)}</div>
            <div class="new-card-actions">
              <button type="button" class="btn-cart btn-sm ggs-f8b06c1791" data-csp-onclick="addToCart(${g.id})">+ Cart</button>
              <button type="button" class="btn-wish" data-csp-onclick="toggleWish(this,${g.id})" title="Wishlist">♡</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  /* ─────────────────────────────────────────────
     5. CATEGORIES
     ───────────────────────────────────────────── */
  function buildCategories() {
    const grid = document.getElementById('categories-grid');
    if (!grid) return;
    const cats = [
      { name:'RPG', icon:'⚔️', cls:'cat-rpg', count: 18 },
      { name:'Action', icon:'💥', cls:'cat-action', count: 22 },
      { name:'Shooter', icon:'🎯', cls:'cat-shooter', count: 15 },
      { name:'Horror', icon:'👻', cls:'cat-horror', count: 8 },
      { name:'Racing', icon:'🏎️', cls:'cat-racing', count: 6 },
      { name:'Strategy', icon:'🧠', cls:'cat-strategy', count: 10 },
      { name:'Sports', icon:'⚽', cls:'cat-sports', count: 7 },
      { name:'Indie', icon:'🎨', cls:'cat-indie', count: 12 },
      { name:'Survival', icon:'🌿', cls:'cat-survival', count: 9 },
      { name:'Puzzle', icon:'🧩', cls:'cat-puzzle', count: 5 },
      { name:'Fighting', icon:'🥊', cls:'cat-fighting', count: 4 },
      { name:'Adventure', icon:'🗺️', cls:'cat-adventure', count: 14 },
    ];
    grid.innerHTML = cats.map(c => `
      <a href="store.html?genre=${encodeURIComponent(c.name)}" class="cat-card ${c.cls}" data-tilt data-gradient-border>
        <span class="cat-icon" data-float="small" data-float-rotate>${c.icon}</span>
        <div class="cat-name">${c.name}</div>
        <div class="cat-count">${c.count} games</div>
      </a>
    `).join('');
  }

  /* ─────────────────────────────────────────────
     8. DEALS
     ───────────────────────────────────────────── */
  function buildDeals() {
    const grid = document.getElementById('deals-grid');
    if (!grid) return;
    const games = GAME_DATABASE.filter(g => g.salePrice).slice(0, 8);
    grid.innerHTML = games.map(g => {
      const disc = discountPct(g);
      return `
      <div class="deal-card" data-reveal="scale" data-tilt>
        <div class="ggs-6982440012">
          <img src="${safeImg(g.image)}" alt="${g.title}" class="deal-card-img" loading="lazy" decoding="async" />
        </div>
        <span class="deal-discount-badge">-${disc}%</span>
        <div class="deal-card-body">
          <div class="deal-card-title">${g.title}</div>
          <div class="deal-prices">
            <span class="deal-price-old">$${g.price}</span>
            <span class="deal-price-new">$${g.salePrice}</span>
          </div>
          <button type="button" class="btn-cart ggs-628cb660a5" data-csp-onclick="addToCart(${g.id})">
            🛒 Grab Deal
          </button>
        </div>
      </div>`;
    }).join('');
  }

  /* ─────────────────────────────────────────────
     COUNTDOWN TIMER
     ───────────────────────────────────────────── */
  function startCountdown() {
    // find next Monday midnight
    const now = new Date();
    const days = (8 - now.getDay()) % 7 || 7;
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 0, 0, 0);

    function update() {
      const diff = end - Date.now();
      if (diff <= 0) return;
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      document.getElementById('cd-days').textContent  = String(d).padStart(2,'0');
      document.getElementById('cd-hours').textContent = String(h).padStart(2,'0');
      document.getElementById('cd-mins').textContent  = String(m).padStart(2,'0');
      document.getElementById('cd-secs').textContent  = String(s).padStart(2,'0');
    }
    update();
    setInterval(update, 1000);
  }

  /* ─────────────────────────────────────────────
     STATS COUNTER
     ───────────────────────────────────────────── */
  function animateCount(el) {
    const target = parseInt(el.dataset.count, 10);
    const isDecimal = el.dataset.decimal === '1';
    const duration = 2000;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const value = Math.floor(ease * target);
      el.textContent = isDecimal
        ? (value / 10).toFixed(1)
        : value >= 1000 ? (value / 1000).toFixed(0) + 'K' : value;
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = isDecimal ? (target / 10).toFixed(1) : target >= 1000 ? (target/1000).toFixed(0)+'K' : target;
    }
    requestAnimationFrame(tick);
  }

  /* ─────────────────────────────────────────────
     SCROLL REVEAL / TILT / PARALLAX
     Handled by engine.js — no duplicates needed
     ───────────────────────────────────────────── */

  /* ─────────────────────────────────────────────
     CART / WISHLIST ACTIONS
     ───────────────────────────────────────────── */
  window.addToCart = async function(id) {
    const game = GAME_DATABASE.find(g => g.id === id);
    if (!game) return;
    if (window.GG && GG.Cart) {
      try {
        await GG.Cart.add(game);
        GG.Toast.success(`🎮 ${game.title} added to cart!`);
      } catch (e) {
        GG.Toast.info(e.error || 'Already in cart');
      }
    }
  };

  window.toggleWish = async function(btn, id) {
    const game = GAME_DATABASE.find(g => g.id === id);
    if (!game) return;
    if (window.GG && GG.Wishlist) {
      try {
        const added = await GG.Wishlist.toggle(game);
        btn.textContent = added ? '♥' : '♡';
        btn.classList.toggle('wishlisted', added);
        GG.Toast[added ? 'success' : 'info'](added ? `♥ ${game.title} wishlisted!` : `Removed from wishlist`);
      } catch (e) {
        GG.Toast.error(e.error || 'Please sign in first');
      }
    }
  };

  /* ─────────────────────────────────────────────
     NEWSLETTER
     ───────────────────────────────────────────── */
  window.handleNewsletter = function(e) {
    e.preventDefault();
    const emailInput = document.getElementById('nl-email');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (window.GG && GG.Toast) GG.Toast.error('Please enter a valid email address.');
      return false;
    }
    if (window.GG && GG.Toast) {
      GG.Toast.success(`🎮 Subscribed! Check ${email} for your 10% discount code.`);
    }
    e.target.reset();
    return false;
  };

  /* ─────────────────────────────────────────────
     INIT
     ───────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    buildTicker();
    buildTrending();
    buildFeatured();
    buildNewReleases();
    buildCategories();
    buildDeals();
    startCountdown();
    // Reveal, tilt, parallax handled by engine.js
  });

})();
