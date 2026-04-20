/**
 * GAMEGLITZ — API Client
 *
 * Drop-in replacement for the in-memory GG state.
 * Talks to the Express backend via fetch().
 * Keeps the same event bus so all existing UI code works.
 *
 * Usage (same as before):
 *   GG.Auth.login(email, password)
 *   GG.Cart.add(gameId)
 *   GG.on('cart:update', callback)
 */
(function () {
  'use strict';

  const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

  function trimTrailingSlash(value = '') {
    return String(value).replace(/\/+$/, '');
  }

  function isLoopbackHost(hostname = '') {
    return LOOPBACK_HOSTS.has(String(hostname).toLowerCase());
  }

  function withLeadingSlash(path = '') {
    return String(path).startsWith('/') ? String(path) : `/${path}`;
  }

  function resolveServerOrigin() {
    const metaOrigin = document.querySelector('meta[name="gg-api-origin"]')?.content;
    const override = trimTrailingSlash(window.GG_API_ORIGIN || metaOrigin || '');
    if (override) return override;
    if (window.location.protocol === 'file:') return 'http://localhost:3000';
    if (isLoopbackHost(window.location.hostname) && window.location.port && window.location.port !== '3000') {
      return `${window.location.protocol}//${window.location.hostname}:3000`;
    }
    return trimTrailingSlash(window.location.origin);
  }

  const SERVER_ORIGIN = resolveServerOrigin();
  const API = SERVER_ORIGIN + '/api';

  function apiUrl(path = '') {
    if (/^https?:\/\//i.test(path)) return path;
    const normalized = withLeadingSlash(path);
    return normalized.startsWith('/api/') ? SERVER_ORIGIN + normalized : API + normalized;
  }

  function serverUrl(path = '') {
    if (/^https?:\/\//i.test(path)) return path;
    return SERVER_ORIGIN + withLeadingSlash(path);
  }

  // ── Token management ──────────────────────────────
  function getToken() {
    let localToken = null;
    let sessionToken = null;
    try { localToken = localStorage.getItem('gg_token'); } catch {}
    try { sessionToken = sessionStorage.getItem('gg_token'); } catch {}
    return localToken || sessionToken || null;
  }
  function setToken(t, { rememberMe = true } = {}) {
    clearToken();
    if (!t) return;
    if (rememberMe) {
      try { localStorage.setItem('gg_token', t); } catch {}
      return;
    }
    try { sessionStorage.setItem('gg_token', t); } catch {}
  }
  function clearToken()  { try { localStorage.removeItem('gg_token'); } catch {} try { sessionStorage.removeItem('gg_token'); } catch {} }

  function isRememberedToken() {
    try { return !!localStorage.getItem('gg_token'); } catch { return false; }
  }

  function tokenPayload(token) {
    try {
      const part = String(token || '').split('.')[1];
      if (!part) return null;
      const normalized = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
      return JSON.parse(atob(normalized));
    } catch {
      return null;
    }
  }

  function tokenExpiresWithin(ms) {
    const payload = tokenPayload(getToken());
    if (!payload?.exp) return false;
    return payload.exp * 1000 - Date.now() < ms;
  }

  function headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    const token = getToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }

  async function request(method, path, body) {
    const opts = { method, headers: headers() };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(apiUrl(path), opts);
    } catch (err) {
      throw { status: 0, error: 'Network error. Please check your connection.' };
    }
    let data;
    try {
      data = await res.json();
    } catch {
      data = { error: res.statusText || 'Server error' };
    }
    if (!res.ok) {
      if (res.status === 429) data.retryAfter = res.headers.get('Retry-After');
      throw { status: res.status, ...data };
    }
    return data;
  }

  // ── Event bus ────────────────────────────────────
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

  // ── Auth ──────────────────────────────────────────
  const Auth = {
    _user: null,

    get isLoggedIn() { return !!this._user && !!getToken(); },
    get currentUser() { return this._user; },
    get token() { return getToken(); },
    getToken() { return getToken(); },

    async register(data) {
      const result = await request('POST', '/auth/register', data);
      const rememberMe = Object.prototype.hasOwnProperty.call(data || {}, 'rememberMe')
        ? !!data.rememberMe
        : true;
      setToken(result.token, { rememberMe });
      this._user = result.user;
      emit('auth:login', this._user);
      return { ok: true, user: this._user };
    },

    async login(login, password, { rememberMe = false } = {}) {
      const result = await request('POST', '/auth/login', { login, password, rememberMe });

      // If 2FA is required, return the temp token
      if (result.tfa_required) {
        return { ok: true, tfa_required: true, temp_token: result.temp_token };
      }

      setToken(result.token, { rememberMe });
      this._user = result.user;
      emit('auth:login', this._user);
      return { ok: true, user: this._user };
    },

    async verify2FA(tempToken, code, { rememberMe = false } = {}) {
      const result = await request('POST', '/auth/verify-2fa', { temp_token: tempToken, code });
      setToken(result.token, { rememberMe });
      this._user = result.user;
      emit('auth:login', this._user);
      return { ok: true, user: this._user };
    },

    async refresh() {
      if (!getToken()) return null;
      const rememberMe = isRememberedToken();
      const result = await request('POST', '/auth/refresh');
      if (result.token) setToken(result.token, { rememberMe });
      this._user = result.user || this._user;
      emit('auth:login', this._user);
      return this._user;
    },

    async setup2FA() {
      return await request('POST', '/auth/setup-2fa');
    },

    async confirm2FA(code) {
      return await request('POST', '/auth/confirm-2fa', { code });
    },

    async disable2FA(code) {
      return await request('POST', '/auth/disable-2fa', { code });
    },

    _fetchMePromise: null,

    async fetchMe() {
      if (!getToken()) return null;
      // Deduplicate concurrent calls — return the same in-flight promise
      if (this._fetchMePromise) return this._fetchMePromise;
      this._fetchMePromise = (async () => {
        try {
          if (tokenExpiresWithin(24 * 60 * 60 * 1000)) {
            await this.refresh();
          }
          const result = await request('GET', '/auth/me');
          this._user = result.user;
          emit('auth:login', this._user);
          return this._user;
        } catch (err) {
          // Only clear token on auth failures (401), not network glitches
          if (err.status === 401 || err.status === 403) {
            clearToken();
            this._user = null;
          }
          return null;
        } finally {
          this._fetchMePromise = null;
        }
      })();
      return this._fetchMePromise;
    },

    async updateProfile(updates) {
      const result = await request('PATCH', '/auth/profile', updates);
      this._user = result.user;
      emit('auth:profileUpdate', this._user);
      return { ok: true, user: this._user };
    },

    async changePassword(currentPassword, newPassword) {
      const result = await request('POST', '/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      if (result.token) setToken(result.token, { rememberMe: !!localStorage.getItem('gg_token') });
      return { ok: true };
    },

    async fetchSessions() {
      return await request('GET', '/auth/sessions');
    },

    async fetchLoginHistory() {
      return await request('GET', '/auth/login-history');
    },

    logout() {
      request('POST', '/auth/logout').catch(() => {});
      clearToken();
      this._user = null;
      emit('auth:logout');
    },

    async logoutAll() {
      await request('POST', '/auth/logout-all');
      clearToken();
      this._user = null;
      emit('auth:logout');
    }
  };

  // ── Cart ─────────────────────────────────────────
  const Cart = {
    _items: [],
    _total: 0,
    _savings: 0,

    get items()   { return [...this._items]; },
    get count()   { return this._items.length; },
    get total()   { return this._total; },
    get savings() { return this._savings; },

    async fetch() {
      if (!Auth.isLoggedIn) return;
      const data = await request('GET', '/cart');
      this._items   = data.items;
      this._total   = data.total;
      this._savings = data.savings;
      emit('cart:update', { items: this._items, count: this.count, total: this._total });
    },

    async add(gameOrId) {
      const gameId = typeof gameOrId === 'object' ? gameOrId.id : gameOrId;
      await request('POST', '/cart/add', { game_id: gameId });
      await this.fetch();
      return { ok: true };
    },

    async remove(gameId) {
      await request('DELETE', `/cart/${gameId}`);
      await this.fetch();
    },

    has(gameId) { return this._items.some(i => i.id === gameId); },

    async clear() {
      await request('DELETE', '/cart');
      this._items = []; this._total = 0; this._savings = 0;
      emit('cart:update', { items: [], count: 0, total: 0 });
    },

    async checkout() {
      const result = await request('POST', '/cart/checkout');
      this._items = []; this._total = 0; this._savings = 0;
      emit('cart:update', { items: [], count: 0, total: 0 });
      emit('cart:checkout', result.order);
      if (result.user) { Auth._user = result.user; emit('auth:profileUpdate', result.user); }
      // Refresh dependent data so `Library.owns()` / wishlist / orders reflect the purchase
      try {
        await Promise.all([
          Library.fetch(),
          Wishlist.fetch(),
          Orders.fetch && Orders.fetch()
        ].filter(Boolean));
      } catch (_) { /* non-fatal — UI will still show order confirmation */ }
      return { ok: true, order: result.order };
    }
  };

  // ── Wishlist ─────────────────────────────────────
  const Wishlist = {
    _items: [],

    get items() { return [...this._items]; },
    get count() { return this._items.length; },

    async fetch() {
      if (!Auth.isLoggedIn) return;
      const data = await request('GET', '/wishlist');
      this._items = data.items;
      emit('wishlist:update', { items: this._items, count: this.count });
    },

    has(gameId) { return this._items.some(i => i.id === gameId); },

    async toggle(gameOrId) {
      const gameId = typeof gameOrId === 'object' ? gameOrId.id : gameOrId;
      const result = await request('POST', '/wishlist/toggle', { game_id: gameId });
      await this.fetch();
      return result.added;
    }
  };

  // ── Library ──────────────────────────────────────
  const Library = {
    _items: [],
    get items() { return [...this._items]; },
    get count() { return this._items.length; },

    async fetch() {
      if (!Auth.isLoggedIn) return;
      const data = await request('GET', '/library');
      this._items = data.items;
    },

    owns(gameId) { return this._items.some(i => i.game_id === gameId); },

    async updatePlaytime(gameId, minutes) {
      await request('PATCH', `/library/${gameId}`, { play_time: minutes });
    },

    async toggleInstall(gameId, installed) {
      await request('PATCH', `/library/${gameId}`, { installed });
    }
  };

  // ── Orders ───────────────────────────────────────
  const Orders = {
    _items: [],
    get items() { return [...this._items]; },
    get count() { return this._items.length; },

    async fetch() {
      if (!Auth.isLoggedIn) return [];
      const data = await request('GET', '/orders');
      this._items = data.orders || [];
      return this._items;
    }
  };

  // ── Games ────────────────────────────────────────
  const Games = {
    async list(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return await request('GET', '/games' + (qs ? '?' + qs : ''));
    },
    async get(idOrSlug) {
      return await request('GET', `/games/${encodeURIComponent(idOrSlug)}`);
    }
  };

  // ── Community ────────────────────────────────────
  const Community = {
    async getGroups(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return await request('GET', '/groups' + (qs ? '?' + qs : ''));
    },
    async createGroup(data) { return await request('POST', '/groups', data); },
    async joinGroup(id)     { return await request('POST', `/groups/${id}/join`); },
    async leaveGroup(id)    { return await request('POST', `/groups/${id}/leave`); },

    async getPosts(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return await request('GET', '/posts' + (qs ? '?' + qs : ''));
    },
    async createPost(data) { return await request('POST', '/posts', data); },
    async replyToPost(postId, body) { return await request('POST', `/posts/${postId}/reply`, { body }); },
    async getReplies(postId) { return await request('GET', `/posts/${postId}/replies`); },
  };

  // ── Friends ──────────────────────────────────────
  const Friends = {
    async fetch()            { return await request('GET', '/friends'); },
    async sendRequest(username) { return await request('POST', '/friends/request', { username }); },
    async accept(userId)     { return await request('POST', '/friends/accept', { user_id: userId }); },
  };

  // ── Notifications ────────────────────────────────
  const Notifications = {
    async fetch()         { return await request('GET', '/notifications'); },
    async markRead(ids)   { return await request('POST', '/notifications/read', { ids }); },
    async markAllRead()   { return await request('POST', '/notifications/read', { ids: 'all' }); },
  };

  // ── Reviews ──────────────────────────────────────
  const Reviews = {
    async submit(data)  { return await request('POST', '/reviews', data); },
  };

  // ── Toast (client-side only) ─────────────────────
  const Toast = {
    show(message, type = 'info', duration = 4000) {
      const toast = document.createElement('div');
      const colors = { success: '#10B981', error: '#F43F5E', warning: '#F59E0B', info: '#8B5CF6' };
      toast.className = 'gg-api-toast';
      toast.style.setProperty('--gg-api-toast-bg', colors[type] || colors.info);
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, duration);
    }
  };

  // ── Search (uses Games.list) ─────────────────────
  const Search = {
    async query(q) { return await Games.list({ search: q, limit: 10 }); }
  };

  // ── UI helpers ───────────────────────────────────
  const UI = {
    updateCartBadge() {
      const el = document.getElementById('cart-count');
      if (el) {
        el.textContent = Cart.count;
        el.classList.toggle('is-visible', Cart.count > 0);
      }
    },
    updateNavAuth() {
      // Nav is rebuilt by nav.js which reads GG.Auth.isLoggedIn
      // Force nav re-render if needed
    }
  };

  on('cart:update', () => UI.updateCartBadge());

  // ── Init: restore session on page load ──────────
  async function init() {
    if (getToken()) {
      await Auth.fetchMe();
      if (Auth.isLoggedIn) {
        await Promise.all([Cart.fetch(), Wishlist.fetch(), Library.fetch(), Orders.fetch()]);
      }
    }
    UI.updateCartBadge();
  }

  document.addEventListener('DOMContentLoaded', init);

  // ── Cross-tab auth sync ────────────────────────────
  // When the token is removed/changed in another tab, update this tab's auth state
  // so UI (nav, profile, cart) reflects the change immediately instead of going stale.
  window.addEventListener('storage', (e) => {
    if (e.key !== 'gg_token') return;
    if (!e.newValue && Auth._user) {
      // Another tab logged out
      Auth._user = null;
      emit('auth:logout');
    } else if (e.newValue && !Auth._user) {
      // Another tab logged in
      Auth.fetchMe().then(() => {
        if (Auth.isLoggedIn) {
          Promise.all([Cart.fetch(), Wishlist.fetch(), Library.fetch(), Orders.fetch()]);
        }
      });
    }
  });

  // ── Toast convenience methods (in case state.js Toast is not loaded) ──
  Toast.success = function(m) { Toast.show(m, 'success'); };
  Toast.error   = function(m) { Toast.show(m, 'error'); };
  Toast.info    = function(m) { Toast.show(m, 'info'); };
  Toast.warning = function(m) { Toast.show(m, 'warning'); };

  // ── Expose global API (merge with existing GG from state.js) ──
  const existing = window.GG || {};
  window.GG = Object.assign(existing, {
    Auth, Cart, Wishlist, Library, Orders, Games,
    Community, Friends, Notifications, Reviews,
    // Merge Search: keep state.js's filter() but override query() with the real API version
    Search: Object.assign(existing.Search || {}, Search),
    Toast: existing.Toast || Toast,
    UI: Object.assign(existing.UI || {}, UI),
    apiBase: API,
    apiOrigin: SERVER_ORIGIN,
    apiUrl,
    serverUrl,
    on, off, emit
  });

})();
