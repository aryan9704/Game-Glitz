/**
 * GAME GLITZ — Client-Side State Management & Persistence
 * Auth, Cart, Wishlist, Library, Orders, Profile, Security
 * Uses in-memory store with sessionStorage fallback (no localStorage in sandbox)
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════
     IN-MEMORY STORE (persists within session)
     ═══════════════════════════════════════════════ */
  const STORE_KEY = 'gameglitz_state';
  const _memoryStore = {};

  function _persist(key, val) {
    _memoryStore[key] = JSON.stringify(val);
  }
  function _load(key, fallback) {
    if (_memoryStore[key]) return JSON.parse(_memoryStore[key]);
    return fallback;
  }

  /* ═══════════════════════════════════════════════
     EVENT BUS
     ═══════════════════════════════════════════════ */
  const _listeners = {};
  function on(event, fn) {
    if (typeof fn !== 'function') return () => {};
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
    return () => off(event, fn);
  }
  function off(event, fn) {
    if (!_listeners[event]) return;
    if (!fn) {
      delete _listeners[event];
      return;
    }
    _listeners[event] = _listeners[event].filter(listener => listener !== fn);
    if (!_listeners[event].length) delete _listeners[event];
  }
  function emit(event, data) {
    (_listeners[event] || []).slice().forEach(fn => fn(data));
  }

  /* ═══════════════════════════════════════════════
     SECURITY MODULE
     ═══════════════════════════════════════════════ */
  const Security = {
    sanitize(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },
    validateEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },
    validatePassword(pw) {
      return {
        length: pw.length >= 8,
        upper: /[A-Z]/.test(pw),
        lower: /[a-z]/.test(pw),
        number: /\d/.test(pw),
        special: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(pw),
        get valid() { return this.length && this.upper && this.lower && this.number; }
      };
    },
    async hashPasswordAsync(pw) {
      // Use Web Crypto API for proper SHA-256 hashing
      const encoder = new TextEncoder();
      const data = encoder.encode(pw + '_gg_salt_2026');
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return 'sha256_' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },
    hashPassword(pw) {
      // Synchronous fallback using a stronger mixing function
      // For demo purposes — production should use async hashPasswordAsync
      let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
      for (let i = 0; i < pw.length; i++) {
        const ch = pw.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      return 'hash_' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
    },
    generateToken() {
      return 'gg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    },
    rateLimiter: (function () {
      const attempts = {};
      return {
        check(action, maxAttempts = 100, windowMs = 60000) {
          const now = Date.now();
          if (!attempts[action]) attempts[action] = [];
          attempts[action] = attempts[action].filter(t => now - t < windowMs);
          if (attempts[action].length >= maxAttempts) return false;
          attempts[action].push(now);
          return true;
        },
        remaining(action, maxAttempts = 100, windowMs = 60000) {
          const now = Date.now();
          if (!attempts[action]) return maxAttempts;
          const recent = (attempts[action] || []).filter(t => now - t < windowMs);
          return Math.max(0, maxAttempts - recent.length);
        }
      };
    })(),
  };

  const VALID_PREFERENCE_KEYS = new Set(['notifications', 'newsletter', 'darkMode', 'language']);
  function normalizePreferences(input, current = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const next = { ...current };
    for (const [key, value] of Object.entries(input)) {
      if (!VALID_PREFERENCE_KEYS.has(key)) return null;
      if (key === 'language') {
        if (typeof value !== 'string' || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(value)) return null;
        next[key] = value;
      } else {
        if (typeof value !== 'boolean') return null;
        next[key] = value;
      }
    }
    return next;
  }

  /* ═══════════════════════════════════════════════
     AUTH MODULE
     ═══════════════════════════════════════════════ */
  const Auth = {
    _users: _load('users', []),
    _current: _load('currentUser', null),
    _session: _load('session', null),

    get isLoggedIn() { return !!this._current && !!this._session; },
    get currentUser() { return this._current; },

    async register(data) {
      if (!Security.rateLimiter.check('register', 50, 300000)) {
        return { ok: false, error: 'Too many registration attempts. Please try again later.' };
      }
      const { username, email, password, displayName } = data;
      if (!username || !email || !password) return { ok: false, error: 'All fields are required.' };
      if (String(displayName || username).length > 50) return { ok: false, error: 'Display name must be 50 characters or fewer.' };
      if (!Security.validateEmail(email)) return { ok: false, error: 'Invalid email address.' };
      const pwCheck = Security.validatePassword(password);
      if (!pwCheck.valid) return { ok: false, error: 'Password must be 8+ chars with upper, lower, and number.' };
      if (this._users.find(u => u.email === email)) return { ok: false, error: 'Email already registered.' };
      if (this._users.find(u => u.username === username)) return { ok: false, error: 'Username already taken.' };

      const user = {
        id: 'user_' + Date.now().toString(36),
        username: Security.sanitize(username),
        email: Security.sanitize(email),
        displayName: Security.sanitize(displayName || username),
        passwordHash: await Security.hashPasswordAsync(password),
        avatar: null,
        level: 1,
        xp: 0,
        badges: ['New Gamer'],
        joinDate: new Date().toISOString(),
        twoFactorEnabled: false,
        preferences: { notifications: true, newsletter: false, darkMode: true, language: 'en' }
      };
      this._users.push(user);
      _persist('users', this._users);
      return this._loginUser(user);
    },

    async login(emailOrUsername, password) {
      if (!Security.rateLimiter.check('login', 50, 60000)) {
        const rem = Security.rateLimiter.remaining('login');
        return { ok: false, error: `Too many login attempts. Try again in ${rem > 0 ? '30' : '60'} seconds.` };
      }
      const passwordHash = await Security.hashPasswordAsync(password);
      const legacyHash = Security.hashPassword(password);
      const user = this._users.find(u =>
        (u.email === emailOrUsername || u.username === emailOrUsername) &&
        (u.passwordHash === passwordHash || u.passwordHash === legacyHash)
      );
      if (!user) return { ok: false, error: 'Invalid credentials. Please try again.' };
      return this._loginUser(user);
    },

    _loginUser(user) {
      const session = {
        token: Security.generateToken(),
        userId: user.id,
        loginTime: Date.now(),
        lastActive: Date.now(),
        ip: '127.0.0.1',
        device: navigator.userAgent.slice(0, 50)
      };
      this._current = { ...user };
      delete this._current.passwordHash;
      this._session = session;
      _persist('currentUser', this._current);
      _persist('session', this._session);
      emit('auth:login', this._current);
      return { ok: true, user: this._current };
    },

    logout() {
      this._current = null;
      this._session = null;
      _persist('currentUser', null);
      _persist('session', null);
      emit('auth:logout');
    },

    updateProfile(updates) {
      if (!this.isLoggedIn) return { ok: false, error: 'Not logged in.' };
      const idx = this._users.findIndex(u => u.id === this._current.id);
      if (idx === -1) return { ok: false, error: 'User not found.' };
      const allowed = new Set(['displayName', 'avatar', 'preferences']);
      if (Object.keys(updates || {}).some(key => !allowed.has(key))) return { ok: false, error: 'Invalid profile field.' };
      if (updates.displayName !== undefined) {
        const value = String(updates.displayName).trim();
        if (!value || value.length > 50) return { ok: false, error: 'Display name must be 1-50 characters.' };
        this._users[idx].displayName = Security.sanitize(value);
      }
      if (updates.avatar !== undefined) {
        this._users[idx].avatar = typeof updates.avatar === 'string' ? Security.sanitize(updates.avatar).slice(0, 2048) : null;
      }
      if (updates.preferences !== undefined) {
        const normalized = normalizePreferences(updates.preferences, this._users[idx].preferences);
        if (!normalized) return { ok: false, error: 'Invalid preferences.' };
        this._users[idx].preferences = normalized;
      }
      _persist('users', this._users);
      this._current = { ...this._users[idx] };
      delete this._current.passwordHash;
      _persist('currentUser', this._current);
      emit('auth:profileUpdate', this._current);
      return { ok: true, user: this._current };
    },

    async changePassword(oldPw, newPw) {
      if (!this.isLoggedIn) return { ok: false, error: 'Not logged in.' };
      const idx = this._users.findIndex(u => u.id === this._current.id);
      if (idx === -1) return { ok: false, error: 'User not found.' };
      const oldHash = await Security.hashPasswordAsync(oldPw);
      const legacyOldHash = Security.hashPassword(oldPw);
      if (this._users[idx].passwordHash !== oldHash && this._users[idx].passwordHash !== legacyOldHash) {
        return { ok: false, error: 'Current password is incorrect.' };
      }
      const pwCheck = Security.validatePassword(newPw);
      if (!pwCheck.valid) return { ok: false, error: 'New password must be 8+ chars with upper, lower, and number.' };
      this._users[idx].passwordHash = await Security.hashPasswordAsync(newPw);
      _persist('users', this._users);
      return { ok: true };
    },

    addXP(amount) {
      if (!this.isLoggedIn) return;
      const idx = this._users.findIndex(u => u.id === this._current.id);
      if (idx === -1) return;
      this._users[idx].xp += amount;
      while (this._users[idx].xp >= this._users[idx].level * 100) {
        this._users[idx].xp -= this._users[idx].level * 100;
        this._users[idx].level++;
        emit('auth:levelUp', this._users[idx].level);
      }
      _persist('users', this._users);
      this._current = { ...this._users[idx] };
      delete this._current.passwordHash;
      _persist('currentUser', this._current);
      emit('auth:xpGain', { xp: amount, total: this._current.xp, level: this._current.level });
    }
  };

  /* ═══════════════════════════════════════════════
     CART MODULE
     ═══════════════════════════════════════════════ */
  const Cart = {
    _items: _load('cart', []),

    get items() { return [...this._items]; },
    get count() { return this._items.length; },
    get total() {
      return this._items.reduce((sum, item) => sum + (item.salePrice || item.price), 0);
    },
    get savings() {
      return this._items.reduce((sum, item) => sum + (item.salePrice ? item.price - item.salePrice : 0), 0);
    },

    add(game) {
      if (this._items.find(i => i.id === game.id)) return { ok: false, error: 'Already in cart.' };
      if (Library.owns(game.id)) return { ok: false, error: 'You already own this game.' };
      this._items.push({
        id: game.id,
        title: game.title,
        image: game.image,
        price: game.price,
        salePrice: game.salePrice,
        addedAt: Date.now()
      });
      _persist('cart', this._items);
      emit('cart:update', { items: this._items, count: this.count, total: this.total });
      return { ok: true };
    },

    remove(gameId) {
      this._items = this._items.filter(i => i.id !== gameId);
      _persist('cart', this._items);
      emit('cart:update', { items: this._items, count: this.count, total: this.total });
    },

    has(gameId) { return !!this._items.find(i => i.id === gameId); },

    clear() {
      this._items = [];
      _persist('cart', this._items);
      emit('cart:update', { items: this._items, count: 0, total: 0 });
    },

    checkout() {
      if (this._items.length === 0) return { ok: false, error: 'Cart is empty.' };
      const order = {
        id: 'ORD-' + Date.now().toString(36).toUpperCase(),
        items: [...this._items],
        total: this.total,
        savings: this.savings,
        date: new Date().toISOString(),
        status: 'completed',
        paymentMethod: 'GameGlitz Wallet'
      };
      Orders.add(order);
      this._items.forEach(item => Library.add(item));
      Auth.addXP(Math.floor(this.total * 2));
      this.clear();
      emit('cart:checkout', order);
      return { ok: true, order };
    }
  };

  /* ═══════════════════════════════════════════════
     WISHLIST MODULE
     ═══════════════════════════════════════════════ */
  const Wishlist = {
    _items: _load('wishlist', []),

    get items() { return [...this._items]; },
    get count() { return this._items.length; },

    add(game) {
      if (this._items.find(i => i.id === game.id)) return { ok: false, error: 'Already in wishlist.' };
      this._items.push({
        id: game.id,
        title: game.title,
        image: game.image,
        price: game.price,
        salePrice: game.salePrice,
        addedAt: Date.now()
      });
      _persist('wishlist', this._items);
      emit('wishlist:update', { items: this._items, count: this.count });
      Auth.addXP(5);
      return { ok: true };
    },

    remove(gameId) {
      this._items = this._items.filter(i => i.id !== gameId);
      _persist('wishlist', this._items);
      emit('wishlist:update', { items: this._items, count: this.count });
    },

    has(gameId) { return !!this._items.find(i => i.id === gameId); },

    toggle(game) {
      if (this.has(game.id)) { this.remove(game.id); return false; }
      this.add(game); return true;
    }
  };

  /* ═══════════════════════════════════════════════
     LIBRARY MODULE
     ═══════════════════════════════════════════════ */
  const Library = {
    _games: _load('library', []),

    get items() { return [...this._games]; },
    get count() { return this._games.length; },

    add(game) {
      if (this._games.find(g => g.id === game.id)) return;
      this._games.push({
        id: game.id,
        title: game.title,
        image: game.image,
        acquiredAt: Date.now(),
        playTime: 0,
        lastPlayed: null,
        installed: false
      });
      _persist('library', this._games);
      Wishlist.remove(game.id);
      emit('library:update', { items: this._games, count: this.count });
    },

    owns(gameId) { return !!this._games.find(g => g.id === gameId); },

    updatePlayTime(gameId, minutes) {
      const g = this._games.find(g => g.id === gameId);
      if (!g) return;
      g.playTime += minutes;
      g.lastPlayed = Date.now();
      _persist('library', this._games);
      emit('library:update', { items: this._games, count: this.count });
    },

    toggleInstall(gameId) {
      const g = this._games.find(g => g.id === gameId);
      if (!g) return;
      g.installed = !g.installed;
      _persist('library', this._games);
      emit('library:update', { items: this._games, count: this.count });
      return g.installed;
    }
  };

  /* ═══════════════════════════════════════════════
     ORDERS MODULE
     ═══════════════════════════════════════════════ */
  const Orders = {
    _orders: _load('orders', []),

    get items() { return [...this._orders]; },
    get count() { return this._orders.length; },

    add(order) {
      this._orders.unshift(order);
      _persist('orders', this._orders);
      emit('orders:update', { items: this._orders, count: this.count });
    },

    getById(orderId) { return this._orders.find(o => o.id === orderId); }
  };

  /* ═══════════════════════════════════════════════
     TOAST / NOTIFICATION SYSTEM
     ═══════════════════════════════════════════════ */
  const Toast = {
    _container: null,

    init() {
      if (this._container) return;
      this._container = document.createElement('div');
      this._container.id = 'toast-container';
      this._container.setAttribute('role', 'status');
      this._container.setAttribute('aria-live', 'polite');
      this._container.setAttribute('aria-atomic', 'false');
      this._container.style.cssText = `
        position: fixed; bottom: 24px; right: 24px; z-index: 99999;
        display: flex; flex-direction: column-reverse; gap: 8px;
        pointer-events: none; max-width: 380px; width: calc(100vw - 48px);
      `;
      document.body.appendChild(this._container);
    },

    show(message, type = 'info', duration = 3500) {
      this.init();
      const toast = document.createElement('div');
      const colors = {
        success: ['#10B981', 'rgba(16,185,129,0.12)'],
        error: ['#F43F5E', 'rgba(244,63,94,0.12)'],
        info: ['#8B5CF6', 'rgba(139,92,246,0.12)'],
        warning: ['#F59E0B', 'rgba(245,158,11,0.12)']
      };
      const [accent, bg] = colors[type] || colors.info;
      const icons = {
        success: '✓', error: '✕', info: 'ℹ', warning: '⚠'
      };
      toast.style.cssText = `
        display: flex; align-items: center; gap: 12px;
        padding: 14px 20px; border-radius: 14px;
        background: ${bg}; backdrop-filter: blur(20px);
        border: 1px solid ${accent}33;
        color: #F0ECF9; font-size: 14px; font-weight: 500;
        pointer-events: auto; cursor: pointer;
        transform: translateX(120%); opacity: 0;
        transition: transform 0.4s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        font-family: 'Inter', sans-serif;
      `;
      const iconSpan = document.createElement('span');
      iconSpan.style.cssText = `display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:${accent};color:#fff;font-weight:700;font-size:14px;flex-shrink:0`;
      iconSpan.textContent = icons[type];
      const msgSpan = document.createElement('span');
      msgSpan.textContent = message;
      toast.appendChild(iconSpan);
      toast.appendChild(msgSpan);
      this._container.appendChild(toast);
      requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
      });
      const remove = () => {
        toast.style.transform = 'translateX(120%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
      };
      toast.addEventListener('click', remove);
      setTimeout(remove, duration);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error'); },
    info(msg) { this.show(msg, 'info'); },
    warning(msg) { this.show(msg, 'warning'); }
  };

  /* ═══════════════════════════════════════════════
     SEARCH MODULE
     ═══════════════════════════════════════════════ */
  const Search = {
    query(text, options = {}) {
      const db = window.GAME_DATABASE || [];
      if (!text || text.length < 2) return [];
      const q = text.toLowerCase();
      return db.filter(game => {
        const haystack = [
          game.title, game.developer, game.publisher,
          ...(game.genre || []), ...(game.tags || []),
          game.description
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      }).slice(0, options.limit || 10);
    },

    filter(filters = {}) {
      const db = window.GAME_DATABASE || [];
      let results = [...db];
      if (filters.genres && filters.genres.length) {
        const lc = filters.genres.map(v => v.toLowerCase());
        results = results.filter(g => g.genre.some(x => lc.includes(x.toLowerCase())));
      } else if (filters.genre) {
        results = results.filter(g => g.genre.some(x => x.toLowerCase() === filters.genre.toLowerCase()));
      }
      if (filters.platforms && filters.platforms.length) {
        const lc = filters.platforms.map(v => v.toLowerCase());
        results = results.filter(g => g.platform.some(x => lc.includes(x.toLowerCase())));
      } else if (filters.platform) {
        results = results.filter(g => g.platform.some(x => x.toLowerCase() === filters.platform.toLowerCase()));
      }
      if (filters.priceRange) {
        const [min, max] = filters.priceRange;
        results = results.filter(g => {
          const p = g.salePrice || g.price;
          return p >= min && p <= max;
        });
      }
      if (filters.freeToPlay) results = results.filter(g => g.freeToPlay);
      if (filters.onSale) results = results.filter(g => g.salePrice !== null && g.salePrice !== undefined);
      if (filters.rating) results = results.filter(g => g.rating >= filters.rating);
      if (filters.search) {
        const q = filters.search.toLowerCase();
        results = results.filter(g => g.title.toLowerCase().includes(q) || g.developer.toLowerCase().includes(q));
      }

      // Sort
      switch (filters.sort) {
        case 'price-low': results.sort((a, b) => (a.salePrice || a.price) - (b.salePrice || b.price)); break;
        case 'price-high': results.sort((a, b) => (b.salePrice || b.price) - (a.salePrice || a.price)); break;
        case 'rating': results.sort((a, b) => b.rating - a.rating); break;
        case 'newest': results.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate)); break;
        case 'popular': results.sort((a, b) => b.reviews - a.reviews); break;
        case 'name': results.sort((a, b) => a.title.localeCompare(b.title)); break;
        default: results.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.reviews - a.reviews);
      }

      return results;
    }
  };

  /* ═══════════════════════════════════════════════
     UI HELPERS
     ═══════════════════════════════════════════════ */
  const UI = {
    updateCartBadge() {
      const badge = document.getElementById('cart-count');
      if (!badge) return;
      const count = Cart.count;
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    },

    updateNavAuth() {
      const avatarLink = document.querySelector('.nav-avatar');
      if (!avatarLink) return;
      if (Auth.isLoggedIn) {
        avatarLink.textContent = '';
        const initSpan = document.createElement('span');
        initSpan.style.cssText = 'width:28px;height:28px;border-radius:50%;background:var(--grad-primary);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff';
        initSpan.textContent = Auth.currentUser.displayName.charAt(0).toUpperCase();
        avatarLink.appendChild(initSpan);
        avatarLink.title = Auth.currentUser.displayName;
      }
    },

    renderStars(rating) {
      const full = Math.floor(rating);
      const half = rating % 1 >= 0.5 ? 1 : 0;
      const empty = 5 - full - half;
      return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
    },

    formatPrice(price) {
      if (price === 0) return 'Free';
      return '$' + price.toFixed(2);
    },

    formatDate(dateStr) {
      return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    },

    showModal(id) {
      const modal = document.getElementById(id);
      if (modal) {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        window.GlitzFocusTrap?.trapFocus(modal);
      }
    },

    hideModal(id) {
      const modal = document.getElementById(id);
      if (modal) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        window.GlitzFocusTrap?.releaseFocus();
      }
    }
  };

  // Auto-update cart badge on changes
  on('cart:update', () => UI.updateCartBadge());
  on('auth:login', () => UI.updateNavAuth());

  // Init on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    UI.updateCartBadge();
    UI.updateNavAuth();
    DynamicBg.init();
  });


  /* ═══════════════════════════════════════════════
     DYNAMIC BACKGROUND MODULE
     ═══════════════════════════════════════════════ */
  const DynamicBg = {
    images: [],
    current: 0,
    interval: null,
    init() {
      // Disabled: dynamic-bg.js handles the cinematic background system
      return;
    }
  };

  /* ═══════════════════════════════════════════════
     FOCUS TRAP (for modals / panels)
     ═══════════════════════════════════════════════ */
  window.GlitzFocusTrap = {
    _previous: null,
    _handler: null,

    trapFocus(el) {
      if (!el) return;
      this._previous = document.activeElement;

      const SELECTOR = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const focusable = Array.from(el.querySelectorAll(SELECTOR)).filter(f => f.offsetParent !== null);
      if (!focusable.length) return;

      const first = focusable[0];
      const last  = focusable[focusable.length - 1];

      // Focus the first element (or close button) after a short delay for animation
      requestAnimationFrame(() => {
        const closeBtn = el.querySelector('[aria-label="Close"], .modal-close, .cart-close-btn');
        (closeBtn || first).focus();
      });

      // Trap Tab cycling
      this._handler = (e) => {
        if (e.key === 'Escape') {
          // Let the modal's own Escape handler fire
          return;
        }
        if (e.key !== 'Tab') return;

        // Re-query in case DOM changed
        const current = Array.from(el.querySelectorAll(SELECTOR)).filter(f => f.offsetParent !== null);
        if (!current.length) return;
        const f = current[0];
        const l = current[current.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === f) { e.preventDefault(); l.focus(); }
        } else {
          if (document.activeElement === l) { e.preventDefault(); f.focus(); }
        }
      };

      document.addEventListener('keydown', this._handler, true);
    },

    releaseFocus() {
      if (this._handler) {
        document.removeEventListener('keydown', this._handler, true);
        this._handler = null;
      }
      if (this._previous && typeof this._previous.focus === 'function') {
        this._previous.focus();
        this._previous = null;
      }
    }
  };

  /* ═══════════════════════════════════════════════
     EXPOSE GLOBAL API
     ═══════════════════════════════════════════════ */
  window.GG = {
    Auth, Cart, Wishlist, Library, Orders,
    Search, Security, Toast, UI, DynamicBg,
    on, off, emit
  };

})();
