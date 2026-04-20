(function () {
  'use strict';

  /* ═══════════════════════════════════════
     STATE & INIT
  ═══════════════════════════════════════ */
  let _tfaEnabled = false;
  let _librarySortMode = 'recent';
  let _librarySearchQuery = '';
  let _libraryCached = [];
  let _justRegistered = false;

  let _dashboardShown = false;

  async function init() {
    // ── Register event listeners FIRST so we never miss events ──
    GG.on('auth:login', async () => {
      if (!_dashboardShown) {
        _dashboardShown = true;
        await showDashboard();
      }
      const u = GG.Auth.currentUser;
      const name = u?.display_name || u?.username || 'Gamer';
      if (_justRegistered) {
        _justRegistered = false;
        GG.Toast.success('Welcome to GameGlitz, ' + name + '!');
      } else if (sessionStorage.getItem('gg_fresh_login')) {
        sessionStorage.removeItem('gg_fresh_login');
        GG.Toast.success('Welcome back, ' + name + '!');
      }
    });
    GG.on('auth:logout', () => { _dashboardShown = false; showAuth(); });
    GG.on('auth:profileUpdate', () => { refreshProfileCard(); refreshSettingsTab(); });
    GG.on('wishlist:update', () => { refreshWishlistTab(); updateProfileStats(); });
    GG.on('library:update', () => { refreshLibraryTab(); updateProfileStats(); });
    GG.on('orders:update', () => { refreshOrdersTab(); updateProfileStats(); });
    GG.on('cart:checkout', (order) => { showCheckoutSuccess(order); });

    // ── Handle OAuth callback from social login redirects ──
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const getCallbackParam = (name) => hashParams.get(name) || urlParams.get(name);
    const oauthToken = getCallbackParam('oauth_token');
    const oauthError = getCallbackParam('error');
    const oauthProvider = getCallbackParam('provider');
    const tfaRequired = getCallbackParam('tfa_required');
    const tempToken = getCallbackParam('temp_token');
    const emailVerified = getCallbackParam('verified') === '1';

    // Clean URL params so they don't persist on refresh
    if (oauthToken || oauthError || tfaRequired || tempToken || emailVerified || window.location.hash) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (oauthToken) {
      try { sessionStorage.removeItem('gg_token'); } catch {}
      localStorage.setItem('gg_token', oauthToken);
      await GG.Auth.fetchMe();
      const created = getCallbackParam('created') === 'true';
      const msg = created
        ? `Welcome to GameGlitz! Signed in via ${oauthProvider || 'social login'}.`
        : `Signed in via ${oauthProvider || 'social login'}.`;
      setTimeout(() => GG.Toast.success(msg), 300);
    } else if (tfaRequired && tempToken) {
      _tfaTempToken = tempToken;
      _tfaRememberMe = true;
      showTFAPanel('', oauthProvider);
    } else if (oauthError) {
      const errorMessages = {
        oauth_not_configured: `${oauthProvider || 'Social'} login is not configured on this server. Please sign in with email/password.`,
        google_no_code: 'Google login was cancelled or failed.',
        google_auth_failed: 'Google authentication failed. Please try again.',
        discord_no_code: 'Discord login was cancelled or failed.',
        discord_no_email: 'Discord account does not have a verified email.',
        discord_auth_failed: 'Discord authentication failed. Please try again.',
        steam_invalid: 'Steam login verification failed.',
        steam_no_id: 'Could not retrieve Steam ID.',
        steam_no_player: 'Could not fetch Steam profile.',
        steam_auth_failed: 'Steam authentication failed. Please try again.'
      };
      setTimeout(() => GG.Toast.error(errorMessages[oauthError] || 'Social login failed.'), 300);
    }

    // ── Resolve auth state — no blank page ──
    const hasToken = !!localStorage.getItem('gg_token') || !!sessionStorage.getItem('gg_token');
    if (GG.Auth.isLoggedIn) {
      // api-client.js already resolved fetchMe
      if (!_dashboardShown) { _dashboardShown = true; showDashboard(); }
    } else if (hasToken) {
      // Token exists but fetchMe() is in-flight from api-client.js — await it.
      // fetchMe() deduplicates so this won't double-request.
      const user = await GG.Auth.fetchMe();
      if (!user && !_dashboardShown) {
        // Token was invalid / expired — show login form
        showAuth();
      }
      // If user is valid, auth:login already fired → listener handled showDashboard
    } else {
      showAuth();
    }

    if (emailVerified) {
      if (hasToken) await GG.Auth.fetchMe();
      setTimeout(() => GG.Toast.success('Email verified successfully.'), 300);
    }

    // Init 2FA digit inputs
    initTFADigits();
  }

  /* ═══════════════════════════════════════
     VIEW SWITCHING
  ═══════════════════════════════════════ */
  function showAuth() {
    document.getElementById('auth-section').classList.add('visible');
    document.getElementById('dashboard-section').classList.remove('visible');
    switchAuthTab(getRequestedAuthTab());
  }

  async function showDashboard() {
    document.getElementById('auth-section').classList.remove('visible');
    document.getElementById('dashboard-section').classList.add('visible');
    refreshProfileCard();
    refreshSettingsTab();
    await refreshSecurityTab();
    // Fetch fresh data once, then render — prevents infinite re-fetch loops
    try {
      await Promise.all([GG.Library.fetch(), GG.Wishlist.fetch(), GG.Orders.fetch()]);
    } catch (_) {}
    refreshLibraryTab();
    refreshWishlistTab();
    refreshOrdersTab();
  }

  /* ═══════════════════════════════════════
     AUTH TAB SWITCHING
  ═══════════════════════════════════════ */
  window.switchAuthTab = function (tab) {
    document.querySelectorAll('.auth-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
    // Also hide 2FA and forgot panels when switching tabs
    const tfaPanel = document.getElementById('tfa-panel');
    if (tfaPanel) tfaPanel.classList.remove('active');
    const forgotPanel = document.getElementById('forgot-panel');
    if (forgotPanel) forgotPanel.classList.remove('active');
    document.getElementById(tab + '-tab').classList.add('active');
    document.getElementById(tab + '-tab').setAttribute('aria-selected', 'true');
    document.getElementById(tab + '-panel').classList.add('active');
    clearErrors();
  };

  /* ═══════════════════════════════════════
     FORM HELPERS
  ═══════════════════════════════════════ */
  function showError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    const input = el.previousElementSibling;
    if (input && input.classList.contains('input-wrapper')) {
      const inp = input.querySelector('.form-input');
      if (inp) { inp.classList.add('is-error'); inp.classList.remove('is-ok'); }
    }
  }
  function clearError(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = '';
    el.classList.remove('visible');
  }
  function clearErrors() {
    document.querySelectorAll('.form-error, .form-general-error').forEach(e => { e.textContent = ''; e.classList.remove('visible'); });
    document.querySelectorAll('.form-input').forEach(i => i.classList.remove('is-error', 'is-ok', 'error'));
    const rateBanner = document.getElementById('rate-limit-banner');
    if (rateBanner) rateBanner.classList.remove('visible');
  }

  function apiUrl(path) {
    return (window.GG && typeof GG.apiUrl === 'function')
      ? GG.apiUrl(path)
      : ((String(path).startsWith('/api/') ? '' : '/api') + (String(path).startsWith('/') ? String(path) : `/${path}`));
  }

  function getRequestedAuthTab() {
    return window.location.hash.toLowerCase() === '#register' ? 'register' : 'signin';
  }

  function setButtonLoading(id, loading, text) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = loading;
    const labelEl = btn.querySelector('.btn-label');
    if (labelEl) {
      labelEl.textContent = loading ? 'Please wait…' : text;
      btn.classList.toggle('loading', loading);
    } else {
      btn.textContent = loading ? 'Please wait…' : text;
    }
  }

  window.togglePasswordVisibility = function (inputId, btn) {
    const input = document.getElementById(inputId);
    const isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    btn.innerHTML = isText
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  };

  /* ═══════════════════════════════════════
     PASSWORD STRENGTH
  ═══════════════════════════════════════ */
  window.updatePasswordStrength = function (inputId, fillId, checksId) {
    const pw = document.getElementById(inputId).value;
    const fill = document.getElementById(fillId);
    const checksEl = document.getElementById(checksId);
    if (!fill || !checksEl) return;

    const checks = GG.Security.validatePassword(pw);
    const metCount = [checks.length, checks.upper, checks.lower, checks.number, checks.special].filter(Boolean).length;
    const pct = (metCount / 5) * 100;
    const colors = ['#F43F5E', '#F59E0B', '#F59E0B', '#10B981', '#10B981'];
    fill.style.width = pct + '%';
    fill.style.background = colors[metCount - 1] || 'rgba(255,255,255,0.1)';
    const progress = fill.closest('[role="progressbar"]');
    if (progress) {
      progress.setAttribute('aria-valuenow', String(Math.round(pct)));
      progress.setAttribute('aria-valuetext', `${metCount} of 5 password strength checks met`);
    }

    checksEl.querySelectorAll('.pw-check').forEach(item => {
      const checkKey = item.dataset.check;
      if (checks[checkKey]) {
        item.classList.add('met');
      } else {
        item.classList.remove('met');
      }
    });
  };

  /* ═══════════════════════════════════════
     SIGN IN
  ═══════════════════════════════════════ */
  /* 2FA state */
  let _tfaPendingEmail = '';
  let _tfaPendingProvider = null; // null = email login, string = social provider
  let _tfaResendInterval = null;
  let _tfaResendSeconds = 0;
  let _tfaAutoFillTimeout = null; // unused, kept for compatibility
  let _tfaTempToken = null;
  let _tfaRememberMe = false;
  let _tfaCountdownSeconds = 300;
  let _tfaCountdownInterval = null;

  function tfaStartCountdown() {
    _tfaCountdownSeconds = 300;
    const countdownEl = document.getElementById('tfa-countdown');
    const countdownVal = document.getElementById('tfa-countdown-val');
    if (!countdownEl || !countdownVal) return;
    countdownEl.classList.remove('urgent');
    countdownVal.textContent = '5:00';
    if (_tfaCountdownInterval) clearInterval(_tfaCountdownInterval);
    _tfaCountdownInterval = setInterval(() => {
      _tfaCountdownSeconds--;
      const m = Math.floor(_tfaCountdownSeconds / 60);
      const s = _tfaCountdownSeconds % 60;
      countdownVal.textContent = m + ':' + String(s).padStart(2, '0');
      if (_tfaCountdownSeconds <= 30) countdownEl.classList.add('urgent');
      if (_tfaCountdownSeconds <= 0) {
        clearInterval(_tfaCountdownInterval);
        _tfaCountdownInterval = null;
        _tfaTempToken = null;
        _tfaRememberMe = false;
        tfaBack();
        GG.Toast.error('Verification session expired. Please sign in again.');
      }
    }, 1000);
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* Mask email: a***n@gmail.com */
  function maskEmail(email) {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const first = local[0] || '';
    const last  = local.length > 1 ? local[local.length - 1] : '';
    const stars = local.length > 2 ? '***' : '**';
    return first + stars + last + '@' + domain;
  }

  /* Show 2FA panel — email login or social provider */
  function showTFAPanel(email, provider) {
    _tfaPendingEmail = email;
    _tfaPendingProvider = provider || null;

    // Update title/subtitle/icon based on context
    const titleEl    = document.getElementById('tfa-title');
    const subtitleEl = document.getElementById('tfa-subtitle');
    const iconEmail  = document.getElementById('tfa-icon-email');
    const iconSocial = document.getElementById('tfa-icon-social');

    if (provider) {
      titleEl.textContent = 'Two-Factor Authentication';
      iconEmail.style.display  = 'none';
      iconSocial.style.display = '';
      subtitleEl.innerHTML = 'Connected via <strong class="ggs-f173677dd7">' + escHtml(provider) + '</strong>.<br>Enter the 6-digit code from your authenticator app (e.g. Google Authenticator, Authy).';
    } else {
      titleEl.textContent = 'Two-Factor Authentication';
      iconEmail.style.display  = '';
      iconSocial.style.display = 'none';
      subtitleEl.innerHTML = 'Enter the current 6-digit code from your authenticator app for<br><span class="tfa-email-mask">' + escHtml(maskEmail(email)) + '</span>';
    }

    // Hide signin panel, show tfa panel
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tfa-panel').classList.add('active');
    // Clear digits
    document.querySelectorAll('.tfa-digit').forEach(d => { d.value = ''; d.classList.remove('filled','valid','invalid'); });
    document.getElementById('tfa-error')?.classList.remove('visible');
    document.getElementById('tfa-sms-note')?.classList.remove('visible');
    // Focus first digit
    setTimeout(() => { document.querySelector('.tfa-digit[data-index="0"]')?.focus(); }, 60);
    // Start resend cooldown and expiry countdown
    tfaStartResendTimer();
    tfaStartCountdown();
  }

  function tfaStartResendTimer() {
    _tfaResendSeconds = 30;
    const btn   = document.getElementById('tfa-resend-btn');
    const timer = document.getElementById('tfa-resend-timer');
    btn.disabled = true;
    timer.textContent = ' (30s)';
    if (_tfaResendInterval) clearInterval(_tfaResendInterval);
    _tfaResendInterval = setInterval(() => {
      _tfaResendSeconds--;
      if (_tfaResendSeconds <= 0) {
        clearInterval(_tfaResendInterval);
        btn.disabled = false;
        timer.textContent = '';
      } else {
        timer.textContent = ' (' + _tfaResendSeconds + 's)';
      }
    }, 1000);
  }

  window.tfaResendCode = function () {
    GG.Toast.info('TOTP codes refresh every 30 seconds. Open your authenticator app for the current code.');
    tfaStartResendTimer();
  };

  window.tfaBack = function () {
    if (_tfaResendInterval) clearInterval(_tfaResendInterval);
    if (_tfaCountdownInterval) { clearInterval(_tfaCountdownInterval); _tfaCountdownInterval = null; }
    if (_tfaAutoFillTimeout) { clearTimeout(_tfaAutoFillTimeout); _tfaAutoFillTimeout = null; }
    // Re-enable any social buttons that were in connecting state
    document.querySelectorAll('.social-btn.connecting').forEach(b => {
      b.classList.remove('connecting');
      const lbl = b.querySelector('.social-btn-label');
      if (lbl && b._originalLabel) { lbl.textContent = b._originalLabel; }
    });
    _tfaPendingProvider = null;
    _tfaRememberMe = false;
    document.getElementById('tfa-panel').classList.remove('active');
    document.querySelectorAll('.tfa-digit').forEach(d => { d.value = ''; d.classList.remove('filled','valid','invalid'); });
    switchAuthTab('signin');
  };

  /* Wire up 6-digit input behavior */
  function initTFADigits() {
    const digits = Array.from(document.querySelectorAll('.tfa-digit'));
    digits.forEach((input, idx) => {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace') {
          if (!this.value && idx > 0) {
            digits[idx - 1].value = '';
            digits[idx - 1].classList.remove('filled');
            digits[idx - 1].focus();
          } else {
            this.value = '';
            this.classList.remove('filled');
          }
          e.preventDefault();
        } else if (e.key === 'ArrowLeft' && idx > 0) {
          digits[idx - 1].focus();
        } else if (e.key === 'ArrowRight' && idx < 5) {
          digits[idx + 1].focus();
        }
      });
      input.addEventListener('input', function (e) {
        // Only allow digits
        const raw = this.value.replace(/\D/g, '');
        // Handle paste of full code
        if (raw.length > 1) {
          const chars = raw.slice(0, 6).split('');
          chars.forEach((ch, i) => {
            if (digits[i]) { digits[i].value = ch; digits[i].classList.add('filled'); }
          });
          const nextFocus = Math.min(chars.length, 5);
          digits[nextFocus].focus();
          checkTFAComplete(digits);
          return;
        }
        if (raw) {
          this.value = raw;
          this.classList.add('filled');
          if (idx < 5) digits[idx + 1].focus();
        } else {
          this.classList.remove('filled');
        }
        checkTFAComplete(digits);
      });
      input.addEventListener('paste', function (e) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
        const chars = text.slice(0, 6).split('');
        chars.forEach((ch, i) => { if (digits[i]) { digits[i].value = ch; digits[i].classList.add('filled'); } });
        const nextFocus = Math.min(chars.length, 5);
        digits[nextFocus].focus();
        checkTFAComplete(digits);
      });
      input.addEventListener('focus', function () {
        this.select();
      });
    });
  }

  function checkTFAComplete(digits) {
    const code = digits.map(d => d.value).join('');
    if (code.length === 6) {
      validateTFACode(code, digits);
    }
  }

  function announceTFA(msg) {
    const live = document.getElementById('tfa-live');
    if (!live) return;
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = msg; });
  }

  async function validateTFACode(code, digits) {
    const errEl = document.getElementById('tfa-error');
    errEl.classList.remove('visible');
    digits.forEach(d => { d.classList.remove('valid', 'invalid'); });
    announceTFA('Verifying code…');

    try {
      sessionStorage.setItem('gg_fresh_login', '1');
      await GG.Auth.verify2FA(_tfaTempToken, code, { rememberMe: _tfaRememberMe });
      // Valid — green flash then login
      digits.forEach(d => d.classList.add('valid'));
      announceTFA('Code accepted. Signing in…');
      if (_tfaResendInterval) clearInterval(_tfaResendInterval);
      if (_tfaCountdownInterval) { clearInterval(_tfaCountdownInterval); _tfaCountdownInterval = null; }
      _tfaTempToken = null;
      _tfaRememberMe = false;
      // Re-enable social buttons
      document.querySelectorAll('.social-btn.connecting').forEach(b => {
        b.classList.remove('connecting');
        const lbl = b.querySelector('.social-btn-label');
        if (lbl && b._originalLabel) { lbl.textContent = b._originalLabel; }
      });
      _tfaPendingProvider = null;
      // auth:login event already fired by verify2FA — dashboard shows automatically
    } catch (err) {
      sessionStorage.removeItem('gg_fresh_login');
      // Invalid — red shake
      digits.forEach(d => d.classList.add('invalid'));
      const msg = err.error || 'Invalid 2FA code.';
      errEl.textContent = msg;
      errEl.classList.add('visible');
      announceTFA(msg);
      setTimeout(() => {
        digits.forEach(d => { d.value = ''; d.classList.remove('filled','invalid'); });
        digits[0].focus();
      }, 600);
    }
  }

  window.handleSignIn = async function (e) {
    e.preventDefault();
    clearErrors();
    const email = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value;

    if (!email) { showError('signin-email-error', 'Please enter your email, username, or phone.'); return; }
    if (!password) { showError('signin-password-error', 'Please enter your password.'); return; }

    setButtonLoading('signin-btn', true, 'Sign In');

    const rememberMe = document.getElementById('remember-me').checked;

    try {
      sessionStorage.setItem('gg_fresh_login', '1');
      const result = await GG.Auth.login(email, password, { rememberMe });
      setButtonLoading('signin-btn', false, 'Sign In');
      if (result.tfa_required) {
        sessionStorage.removeItem('gg_fresh_login'); // 2FA pending — flag is premature
        _tfaTempToken = result.temp_token;
        _tfaRememberMe = rememberMe;
        showTFAPanel(email);
      }
      // If no 2FA, auth:login event fires automatically and shows dashboard
    } catch (err) {
      sessionStorage.removeItem('gg_fresh_login');
      setButtonLoading('signin-btn', false, 'Sign In');
      if (err.status === 429) {
        const rateBanner = document.getElementById('rate-limit-banner');
        if (rateBanner) {
          const retryAfter = err.retry_after || err.retryAfter;
          rateBanner.textContent = retryAfter
            ? '⚠ Too many attempts. Please wait ' + retryAfter + ' seconds before trying again.'
            : '⚠ Too many attempts. Please wait before trying again.';
          rateBanner.classList.add('visible');
        }
      } else {
        const errMsg = err.error || err.message || 'Invalid credentials.';
        showError('signin-general-error', errMsg);
      }
    }
  };

  /* ═══════════════════════════════════════
     SOCIAL LOGIN — Real OAuth Redirects
  ═══════════════════════════════════════ */

  const SOCIAL_ENDPOINTS = {
    Google: '/api/auth/google',
    Discord: '/api/auth/discord',
    Steam: '/api/auth/steam'
  };

  window.handleSocialLogin = function (btn) {
    const provider = btn.dataset.provider;
    if (!provider || !SOCIAL_ENDPOINTS[provider]) return;

    // Show connecting state on the button
    const lbl = btn.querySelector('.social-btn-label');
    if (lbl) {
      btn._originalLabel = lbl.textContent;
      lbl.textContent = 'Redirecting...';
    }
    btn.classList.add('connecting');
    btn.disabled = true;

    // Redirect to the OAuth provider
    window.location.href = apiUrl(SOCIAL_ENDPOINTS[provider]);
  };

  /* ═══════════════════════════════════════
     REGISTER
  ═══════════════════════════════════════ */
  window.handleRegister = async function (e) {
    e.preventDefault();
    clearErrors();

    const username = document.getElementById('reg-username').value.trim();
    const displayName = document.getElementById('reg-display').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const phonePrefix = document.getElementById('reg-phone-prefix')?.value || '+1';
    const phoneRaw = document.getElementById('reg-phone')?.value.trim() || '';
    const phone = phoneRaw ? phonePrefix + phoneRaw.replace(/\D/g, '') : null;
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const terms = document.getElementById('reg-terms').checked;

    let hasError = false;
    if (!username) { showError('reg-username-error', 'Username is required.'); hasError = true; }
    else if (username.length < 3 || username.length > 30) { showError('reg-username-error', 'Username must be 3–30 characters.'); hasError = true; }
    else if (!/^[a-zA-Z0-9_-]+$/.test(username)) { showError('reg-username-error', 'Letters, numbers, _ and - only.'); hasError = true; }
    if (!email) { showError('reg-email-error', 'Email is required.'); hasError = true; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('reg-email-error', 'Enter a valid email address.'); hasError = true; }
    if (phone && !/^\+\d{7,15}$/.test(phone)) { showError('reg-phone-error', 'Enter a valid phone number.'); hasError = true; }
    if (password.length < 8) { showError('reg-password-error', 'Password must be at least 8 characters.'); hasError = true; }
    else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      showError('reg-password-error', 'Password must contain uppercase, lowercase, and a number.'); hasError = true;
    }
    if (password !== confirm) { showError('reg-confirm-error', 'Passwords do not match.'); hasError = true; }
    if (!terms) { showError('reg-terms-error', 'You must accept the terms to continue.'); hasError = true; }
    if (hasError) return;

    setButtonLoading('register-btn', true, 'Create Account');

    try {
      _justRegistered = true;
      await GG.Auth.register({ username, displayName: displayName || username, email, phone, password });
      setButtonLoading('register-btn', false, 'Create Account');
      // auth:login event fires automatically → shows welcome toast and dashboard
    } catch (err) {
      _justRegistered = false;
      setButtonLoading('register-btn', false, 'Create Account');
      console.error('Registration error:', err);
      if (err.status === 429) {
        const rateBanner = document.getElementById('rate-limit-banner');
        if (rateBanner) {
          const retryAfter = err.retry_after || err.retryAfter;
          rateBanner.textContent = retryAfter
            ? '⚠ Too many attempts. Please wait ' + retryAfter + ' seconds before trying again.'
            : '⚠ Too many attempts. Please wait before trying again.';
          rateBanner.classList.add('visible');
        }
      } else {
        const msg = (typeof err === 'object' && err !== null && err.error) ? err.error
                  : (typeof err === 'object' && err !== null && err.message) ? err.message
                  : String(err) || 'Registration failed.';
        showError('reg-general-error', msg);
      }
    }
  };

  /* ═══════════════════════════════════════
     FORGOT PASSWORD
  ═══════════════════════════════════════ */
  window.showForgotPanel = function () {
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tfa-panel').classList.remove('active');
    document.getElementById('forgot-panel').classList.add('active');
  };

  window.hideForgotPanel = function () {
    document.getElementById('forgot-panel').classList.remove('active');
    switchAuthTab('signin');
  };

  function getForgotPasswordElements(source) {
    if (source === 'modal') {
      return {
        emailEl: document.getElementById('forgot-email-modal'),
        close: () => GG.UI.hideModal('forgot-password-modal'),
      };
    }
    return {
      emailEl: document.getElementById('forgot-email-panel'),
      close: () => hideForgotPanel(),
    };
  }

  function clearForgotPasswordInputs() {
    const panelInput = document.getElementById('forgot-email-panel');
    const modalInput = document.getElementById('forgot-email-modal');
    if (panelInput) panelInput.value = '';
    if (modalInput) modalInput.value = '';
  }

  window.handleForgotPassword = async function (source = 'panel') {
    const { emailEl, close } = getForgotPasswordElements(source);
    const email = emailEl ? emailEl.value.trim() : '';
    if (!email) {
      GG.Toast.error('Please enter your email address.');
      if (emailEl) emailEl.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      GG.Toast.error('Please enter a valid email address.');
      if (emailEl) emailEl.focus();
      return;
    }
    try {
      const r = await fetch(apiUrl('/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw { status: r.status, ...data };
      // Always show generic success to avoid email enumeration
      GG.Toast.success('If that email is registered, a reset link has been sent. Check your inbox (and spam).');
      clearForgotPasswordInputs();
      close();
    } catch (e) {
      GG.Toast.error(e.error || 'Could not reach the server. Please try again.');
    }
  };

  /* ═══════════════════════════════════════
     LOGOUT
  ═══════════════════════════════════════ */
  window.handleLogout = function () {
    GG.Auth.logout();
    GG.Toast.info('You\'ve been signed out.');
  };

  /* ═══════════════════════════════════════
     MODAL HELPERS
  ═══════════════════════════════════════ */
  window.closeModalOnBackdrop = function (e, id) {
    if (e.target === e.currentTarget) GG.UI.hideModal(id);
  };

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
      document.body.style.overflow = '';
    }
  });

  /* ═══════════════════════════════════════
     DASHBOARD TAB SWITCHING
  ═══════════════════════════════════════ */
  window.switchDashTab = function (tabName) {
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-tab="' + tabName + '"]').classList.add('active');
    document.getElementById('tab-' + tabName).classList.add('active');
  };

  /* ═══════════════════════════════════════
     PROFILE CARD
  ═══════════════════════════════════════ */
  function refreshProfileCard() {
    const u = GG.Auth.currentUser;
    if (!u) return;

    const dn = u.display_name || u.displayName || u.username || 'G';
    const letter = dn.charAt(0).toUpperCase();
    document.getElementById('profile-avatar-letter').textContent = letter;
    document.getElementById('profile-level-badge').textContent = u.level || 1;
    document.getElementById('profile-display-name').textContent = dn;
    document.getElementById('profile-username').textContent = '@' + u.username;
    document.getElementById('profile-meta').textContent = 'Joined ' + GG.UI.formatDate(u.created_at || u.joinDate);

    // Badges
    const badgeWrap = document.getElementById('profile-badges');
    const badges = u.badges || [];
    badgeWrap.innerHTML = (typeof badges === 'string' ? JSON.parse(badges || '[]') : badges).map(b =>
      `<span class="badge badge-primary">${b}</span>`
    ).join('');

    // XP
    const level = u.level || 1;
    const xp = u.xp || 0;
    const xpNeeded = level * 100;
    const pct = Math.min(100, (xp / xpNeeded) * 100);
    document.getElementById('xp-fill').style.width = pct + '%';
    document.getElementById('xp-label-text').textContent = 'Level ' + level + ' · XP Progress';
    document.getElementById('xp-label-value').textContent = xp + ' / ' + xpNeeded + ' XP';

    updateProfileStats();
  }

  function updateProfileStats() {
    animateStatValue('stat-library',  GG.Library.count);
    animateStatValue('stat-wishlist', GG.Wishlist.count);
    animateStatValue('stat-orders',   GG.Orders.count);
  }

  function animateStatValue(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const from = parseInt(el.textContent, 10) || 0;
    if (from === target) return;
    const dur = 600, start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (target - from) * eased);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ═══════════════════════════════════════
     LIBRARY TAB
  ═══════════════════════════════════════ */
  function refreshLibraryTab() {
    _libraryCached = GG.Library.items;
    renderLibrary();
  }

  function renderLibrary() {
    const grid = document.getElementById('library-grid');
    if (!grid) return;

    let items = [..._libraryCached];

    // Filter
    if (_librarySearchQuery) {
      const q = _librarySearchQuery.toLowerCase();
      items = items.filter(g => g.title.toLowerCase().includes(q));
    }

    // Sort
    switch (_librarySortMode) {
      case 'name': items.sort((a, b) => a.title.localeCompare(b.title)); break;
      case 'playtime': items.sort((a, b) => (b.playTime || 0) - (a.playTime || 0)); break;
      case 'installed': items.sort((a, b) => (b.installed ? 1 : 0) - (a.installed ? 1 : 0)); break;
      default: items.sort((a, b) => (b.acquiredAt || 0) - (a.acquiredAt || 0));
    }

    if (items.length === 0) {
      const emptyMsg = _librarySearchQuery
        ? 'No games match your search.'
        : 'Your library is empty. Visit the store to find games.';
      grid.innerHTML = `
        <div class="empty-state ggs-97294b207c">
          <div class="empty-state-icon">🎮</div>
          <div class="empty-state-title">No Games Found</div>
          <div class="empty-state-text">${emptyMsg}</div>
          ${!_librarySearchQuery ? '<a href="store.html" class="empty-state-btn">Browse Store</a>' : ''}
        </div>`;
      return;
    }

    grid.innerHTML = items.map(game => {
      const installed = game.installed;
      const hours = game.play_time ? (game.play_time / 60).toFixed(1) + 'h played' : 'Not played yet';
      const imgEl = game.image
        ? `<img class="lib-game-img" src="${game.image}" alt="${game.title}" loading="lazy" decoding="async" data-csp-onerror="this.parentElement.innerHTML='<div class=\\'lib-game-img-placeholder\\'>🎮</div>'">`
        : `<div class="lib-game-img-placeholder">🎮</div>`;
      return `
        <div class="lib-game-card">
          ${imgEl}
          <div class="lib-game-body">
            <div class="lib-game-title" title="${escHtml(game.title)}">${escHtml(game.title)}</div>
            <div class="lib-game-meta">${hours}</div>
            <div class="lib-game-actions">
              <button type="button" class="lib-install-btn ${installed ? 'installed' : ''}" data-game-id="${escHtml(String(game.game_id))}" data-csp-onclick="toggleInstall(this.dataset.gameId, this)">
                ${installed ? '⏏ Uninstall' : '⬇ Install'}
              </button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  window.filterLibrary = function (query) {
    _librarySearchQuery = query;
    renderLibrary();
  };

  window.sortLibrary = function (mode) {
    _librarySortMode = mode;
    renderLibrary();
  };

  window.toggleInstall = async function (gameId, btn) {
    const isInstalled = btn.classList.contains('installed');
    try {
      await GG.Library.toggleInstall(gameId, !isInstalled);
      btn.classList.toggle('installed');
      btn.textContent = !isInstalled ? '⬇ Install' : '⏏ Uninstall';
      GG.Toast.info(!isInstalled ? 'Game installed!' : 'Game uninstalled.');
    } catch {
      GG.Toast.error('Action failed.');
    }
  };

  /* ═══════════════════════════════════════
     WISHLIST TAB
  ═══════════════════════════════════════ */
  function refreshWishlistTab() {
    const grid = document.getElementById('wishlist-grid');
    if (!grid) return;
    const items = GG.Wishlist.items;

    if (items.length === 0) {
      grid.innerHTML = `
        <div class="empty-state ggs-97294b207c">
          <div class="empty-state-icon">❤️</div>
          <div class="empty-state-title">Your Wishlist is Empty</div>
          <div class="empty-state-text">Add games from the store and find great deals.</div>
          <a href="store.html" class="empty-state-btn">Explore Store</a>
        </div>`;
      return;
    }

    grid.innerHTML = items.map(game => {
      const hasSale = game.sale_price && game.sale_price < game.price;
      const displayPrice = game.sale_price || game.price;
      const ownedByLib = GG.Library.owns(game.id);
      const imgEl = game.image
        ? `<img class="wish-card-img" src="${game.image}" alt="${game.title}" loading="lazy" decoding="async" data-csp-onerror="this.parentElement.innerHTML='<div class=\\'wish-card-img-placeholder\\'>🎮</div>'">`
        : `<div class="wish-card-img-placeholder">🎮</div>`;
      return `
        <div class="wish-card">
          ${imgEl}
          <div class="wish-card-body">
            <div class="wish-card-title">${escHtml(game.title)}</div>
            <div class="wish-card-price">
              <span class="wish-price-current">${GG.UI.formatPrice(displayPrice)}</span>
              ${hasSale ? `<span class="wish-price-original">${GG.UI.formatPrice(game.price)}</span><span class="wish-sale-badge">SALE</span>` : ''}
            </div>
            <div class="wish-card-actions">
              ${ownedByLib
                ? `<button type="button" class="wish-add-btn ggs-5f05a06068" disabled>Owned</button>`
                : `<button type="button" class="wish-add-btn" data-game-id="${escHtml(String(game.id))}" data-csp-onclick="addWishToCart(this.dataset.gameId, this)">Add to Cart</button>`}
              <button type="button" class="wish-remove-btn" data-game-id="${escHtml(String(game.id))}" data-csp-onclick="removeFromWishlist(this.dataset.gameId)">Remove</button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  window.addWishToCart = async function (gameId, btn) {
    if (!GG.Auth.isLoggedIn) { GG.Toast.warning('Sign in to add games to cart.'); return; }
    try {
      await GG.Cart.add(gameId);
      GG.Toast.success('Added to cart!');
      btn.textContent = 'In Cart ✓';
      btn.disabled = true;
      btn.style.opacity = '.7';
    } catch (err) {
      GG.Toast.warning(err.error || 'Could not add to cart.');
    }
  };

  window.removeFromWishlist = async function (gameId) {
    try {
      await GG.Wishlist.toggle(gameId);
      GG.Toast.info('Removed from wishlist.');
      refreshWishlistTab();
    } catch {
      GG.Toast.error('Failed.');
    }
  };

  /* ═══════════════════════════════════════
     ORDERS TAB
  ═══════════════════════════════════════ */
  function refreshOrdersTab() {
    const list = document.getElementById('orders-list');
    if (!list) return;
    const orders = GG.Orders.items;

    if (!orders || orders.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <div class="empty-state-title">No Orders Yet</div>
          <div class="empty-state-text">Your order history will appear here after your first purchase.</div>
          <a href="store.html" class="empty-state-btn">Start Shopping</a>
        </div>`;
      return;
    }

    list.innerHTML = orders.map(order => {
      const thumbsHtml = (order.items || []).slice(0, 4).map(item => {
        return item.image
          ? `<img class="order-thumb" src="${item.image}" alt="${item.title}" data-csp-onerror="this.outerHTML='<div class=\\'order-thumb-placeholder\\' loading="lazy" decoding="async">🎮</div>'">`
          : `<div class="order-thumb-placeholder">🎮</div>`;
      }).join('');

      const detailItemsHtml = (order.items || []).map(item => {
        const price = item.price_paid || item.price;
        const imgEl = item.image
          ? `<img class="order-detail-thumb" src="${item.image}" alt="${item.title}" data-csp-onerror="this.outerHTML='<div class=\\'order-detail-thumb-placeholder\\' loading="lazy" decoding="async">🎮</div>'">`
          : `<div class="order-detail-thumb-placeholder">🎮</div>`;
        return `
          <div class="order-detail-game">
            ${imgEl}
            <div>
              <div class="order-detail-title">${item.title}</div>
              <div class="order-detail-price">${GG.UI.formatPrice(price)}</div>
            </div>
          </div>`;
      }).join('');

      return `
        <div class="order-card" id="order-${order.id}">
          <div class="order-card-header" data-csp-onclick="toggleOrder('${order.id}')">
            <div>
              <div class="order-id">${order.id}</div>
              <div class="order-date">${GG.UI.formatDate(order.created_at)}</div>
            </div>
            <div class="order-thumbs">${thumbsHtml}</div>
            <div class="order-meta">
              <span class="order-total">${GG.UI.formatPrice(order.total)}</span>
              <span class="order-status-badge completed">completed</span>
              <svg class="order-expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
          <div class="order-details">
            ${detailItemsHtml}
            <div class="order-detail-total">
              <span class="order-detail-total-label">Order Total</span>
              <span class="order-detail-total-value">${GG.UI.formatPrice(order.total)}</span>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  window.toggleOrder = function (orderId) {
    const card = document.getElementById('order-' + orderId);
    if (card) card.classList.toggle('expanded');
  };

  /* ═══════════════════════════════════════
     SETTINGS TAB
  ═══════════════════════════════════════ */
  function refreshSettingsTab() {
    const u = GG.Auth.currentUser;
    if (!u) return;
    const dnInput = document.getElementById('settings-display-name');
    const emailInput = document.getElementById('settings-email');
    if (dnInput) dnInput.value = u.display_name || u.displayName || '';
    if (emailInput) emailInput.value = u.email || '';

    const prefs = u.preferences || {};
    const notifEl = document.getElementById('pref-notifications');
    const newsEl = document.getElementById('pref-newsletter');
    const langEl = document.getElementById('settings-language');
    if (notifEl) notifEl.checked = prefs.notifications !== false;
    if (newsEl) newsEl.checked = !!prefs.newsletter;
    if (langEl) langEl.value = prefs.language || 'en';
  }

  window.saveSettings = async function () {
    const displayName = document.getElementById('settings-display-name').value.trim();
    if (!displayName) { GG.Toast.error('Display name cannot be empty.'); return; }

    try {
      await GG.Auth.updateProfile({ display_name: displayName });
      GG.Toast.success('Settings saved!');
    } catch (err) {
      GG.Toast.error(err.error || 'Failed to save settings.');
    }
  };

  /* ═══════════════════════════════════════
     EDIT PROFILE MODAL
  ═══════════════════════════════════════ */
  function refreshDeleteAccountModal() {
    const u = GG.Auth.currentUser || {};
    const requiresPassword = !u.social_provider;
    const passwordGroup = document.getElementById('delete-password-group');
    const passwordLabel = document.querySelector('label[for="delete-password-input"]');
    const passwordInput = document.getElementById('delete-password-input');

    if (passwordGroup) passwordGroup.style.display = requiresPassword ? '' : 'none';
    if (passwordLabel) {
      passwordLabel.textContent = requiresPassword
        ? 'Current password'
        : `Current password not required for ${u.social_provider} accounts`;
    }
    if (passwordInput) {
      passwordInput.disabled = !requiresPassword;
      passwordInput.required = requiresPassword;
      passwordInput.value = '';
    }
  }

  // Pre-fill edit modal when opened
  const origShowModal = GG.UI.showModal;
  GG.UI.showModal = function (id) {
    if (id === 'edit-profile-modal') {
      const u = GG.Auth.currentUser;
      if (u) document.getElementById('edit-display-name').value = u.display_name || u.displayName || '';
    } else if (id === 'delete-account-modal') {
      refreshDeleteAccountModal();
    }
    origShowModal.call(GG.UI, id);
  };

  window.saveEditProfile = async function () {
    const displayName = document.getElementById('edit-display-name').value.trim();
    if (!displayName) { GG.Toast.error('Display name cannot be empty.'); return; }
    try {
      await GG.Auth.updateProfile({ display_name: displayName });
      GG.Toast.success('Profile updated!');
      GG.UI.hideModal('edit-profile-modal');
    } catch (err) {
      GG.Toast.error(err.error || 'Update failed.');
    }
  };

  /* ═══════════════════════════════════════
     DELETE ACCOUNT
  ═══════════════════════════════════════ */
  window.handleDeleteAccount = async function () {
    const u = GG.Auth.currentUser || {};
    const requiresPassword = !u.social_provider;
    const confirmInput = document.getElementById('delete-confirm-input').value;
    const password     = document.getElementById('delete-password-input').value;
    const errEl        = document.getElementById('delete-account-error');
    const btn          = document.getElementById('delete-account-btn');

    errEl.style.display = 'none';
    errEl.textContent   = '';

    if (confirmInput !== 'DELETE') {
      errEl.textContent   = 'Type DELETE (all caps) to confirm.';
      errEl.style.display = 'block';
      return;
    }
    if (requiresPassword && !password) {
      errEl.textContent   = 'Password is required to confirm deletion.';
      errEl.style.display = 'block';
      return;
    }

    btn.disabled    = true;
    btn.textContent = 'Deleting…';

    try {
      const token = GG.Auth.token || localStorage.getItem('gg_token') || sessionStorage.getItem('gg_token');
      const resp  = await fetch(apiUrl('/auth/account'), {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(requiresPassword ? { password } : {}),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        errEl.textContent   = data.error || 'Deletion failed.';
        errEl.style.display = 'block';
        btn.disabled    = false;
        btn.textContent = 'Delete Account';
        return;
      }
      GG.UI.hideModal('delete-account-modal');
      GG.Auth.logout();
      GG.Toast.warning('Your account has been permanently deleted.');
      setTimeout(() => { window.location.href = '/index.html'; }, 1500);
    } catch {
      errEl.textContent   = 'Network error. Please try again.';
      errEl.style.display = 'block';
      btn.disabled    = false;
      btn.textContent = 'Delete Account';
    }
  };

  /* ═══════════════════════════════════════
     SECURITY TAB
  ═══════════════════════════════════════ */
  async function refreshSecurityTab() {
    // Sync 2FA state from server user data
    const u = GG.Auth.currentUser;
    if (u) {
      _tfaEnabled = !!(u.tfa_enabled);
      // Update 2FA toggle button UI to match actual state
      const icon  = document.getElementById('tfa-icon');
      const title = document.getElementById('tfa-status-title');
      const sub   = document.getElementById('tfa-status-sub');
      const btn   = document.getElementById('tfa-toggle-btn');
      if (icon && _tfaEnabled) {
        icon.className = 'tfa-icon on';
        icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
        if (title) title.textContent = '2FA Enabled';
        if (sub)   sub.textContent   = 'Your account is protected with two-factor authentication';
        if (btn)   { btn.className = 'tfa-btn tfa-disable-btn'; btn.textContent = 'Disable 2FA'; }
      } else if (icon) {
        icon.className = 'tfa-icon off';
        icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        if (title) title.textContent = '2FA Disabled';
        if (sub)   sub.textContent   = 'Protect your account with an authenticator app';
        if (btn)   { btn.className = 'tfa-btn tfa-enable-btn'; btn.textContent = 'Enable 2FA'; }
      }
    }
    refreshSecurityScore();
    refreshDeleteAccountModal();
    await Promise.all([refreshSessionInfo(), renderLoginHistory()]);
  }

  function refreshSecurityScore() {
    const u = GG.Auth.currentUser;
    if (!u) return;

    const hasTFA = _tfaEnabled;
    const score = 40 + (hasTFA ? 40 : 0) + 20; // base + 2FA + email
    const circumference = 314;
    const offset = circumference - (score / 100) * circumference;

    document.getElementById('score-value').textContent = score;
    const circle = document.getElementById('score-circle');
    if (circle) {
      setTimeout(() => { circle.style.strokeDashoffset = offset; }, 100);
    }

    // Update 2FA check
    const sc2fa = document.getElementById('sc-2fa');
    if (sc2fa) {
      sc2fa.querySelector('.score-check-dot').className = 'score-check-dot ' + (hasTFA ? 'ok' : 'bad');
      sc2fa.querySelector('.score-check-dot').textContent = hasTFA ? '✓' : '✕';
    }
  }

  /* ═══════════════════════════════════════
     CHANGE PASSWORD
  ═══════════════════════════════════════ */
  function formatAuthDeviceLabel(device) {
    const raw = String(device || '').trim();
    if (!raw) return 'Unknown device';
    if (/iphone|ipad|ios/i.test(raw)) return 'Safari / iPhone';
    if (/android/i.test(raw)) return 'Android Browser';
    if (/firefox/i.test(raw) && /mac/i.test(raw)) return 'Firefox / macOS';
    if (/firefox/i.test(raw)) return 'Firefox';
    if (/edg/i.test(raw)) return 'Edge';
    if (/chrome/i.test(raw) && /windows/i.test(raw)) return 'Chrome / Windows';
    if (/chrome/i.test(raw) && /mac/i.test(raw)) return 'Chrome / macOS';
    if (/chrome/i.test(raw)) return 'Chrome';
    if (/safari/i.test(raw) && !/chrome|chromium/i.test(raw)) return 'Safari';
    return raw.length > 60 ? raw.slice(0, 57) + '...' : raw;
  }

  function formatAuthStatus(entry) {
    const map = {
      register: { cls: 'login-success', label: 'Account Created' },
      register_social: { cls: 'login-success', label: 'Social Sign-In' },
      login: { cls: 'login-success', label: 'Sign-In Success' },
      login_2fa: { cls: 'login-success', label: '2FA Verified' },
      login_failed: { cls: 'login-fail', label: 'Failed Attempt' },
      change_password: { cls: 'login-success', label: 'Password Changed' },
      password_reset_completed: { cls: 'login-success', label: 'Password Reset' },
    };
    return map[entry.action] || { cls: entry.success ? 'login-success' : 'login-fail', label: entry.success ? 'Success' : 'Failed' };
  }

  async function refreshSessionInfo() {
    const deviceEl = document.getElementById('session-device');
    const metaEl = document.getElementById('session-meta');
    if (!deviceEl || !metaEl) return;

    deviceEl.textContent = 'Checking current session...';
    metaEl.textContent = 'Loading security data...';

    try {
      const result = await GG.Auth.fetchSessions();
      const sessions = Array.isArray(result.sessions) ? result.sessions : [];
      const current = sessions.find((session) => session.current) || sessions[0];

      if (!current) {
        deviceEl.textContent = 'No active sessions';
        metaEl.textContent = 'Current session information is unavailable.';
        return;
      }

      const metaBits = [];
      if (current.ip) metaBits.push(current.ip);
      if (current.created_at) metaBits.push('Signed in ' + GG.UI.formatDate(current.created_at));
      if (current.expires_at) metaBits.push('Expires ' + GG.UI.formatDate(current.expires_at));

      deviceEl.textContent = formatAuthDeviceLabel(current.device);
      metaEl.textContent = metaBits.join(' · ') || 'Current session';
    } catch {
      deviceEl.textContent = formatAuthDeviceLabel(navigator.userAgent);
      metaEl.textContent = 'Current session details could not be loaded.';
    }
  }

  async function renderLoginHistory() {
    const tbody = document.getElementById('login-history-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4">Loading recent activity...</td></tr>';

    try {
      const result = await GG.Auth.fetchLoginHistory();
      const entries = Array.isArray(result.history) ? result.history : [];

      if (!entries.length) {
        tbody.innerHTML = '<tr><td colspan="4">No recent sign-in activity yet.</td></tr>';
        return;
      }

      tbody.innerHTML = entries.map((entry) => {
        const status = formatAuthStatus(entry);
        return `
      <tr>
        <td>${GG.UI.formatDate(entry.created_at)}</td>
        <td>${entry.ip || 'Unknown'}</td>
        <td>${formatAuthDeviceLabel(entry.device || entry.method || '')}</td>
        <td class="${status.cls}">${status.label}</td>
      </tr>`;
      }).join('');
    } catch {
      tbody.innerHTML = '<tr><td colspan="4">Could not load login history right now.</td></tr>';
    }
  }

  window.handleChangePassword = async function (e) {
    e.preventDefault();
    clearError('change-pw-error');
    const curr = document.getElementById('curr-pw').value;
    const next = document.getElementById('new-pw').value;
    const confirm = document.getElementById('confirm-new-pw').value;

    if (!curr) { showError('change-pw-error', 'Enter your current password.'); return; }
    if (!next) { showError('change-pw-error', 'Enter a new password.'); return; }
    if (next !== confirm) { showError('change-pw-error', 'New passwords do not match.'); return; }

    try {
      await GG.Auth.changePassword(curr, next);
      GG.Toast.success('Password changed successfully!');
      document.getElementById('change-pw-form').reset();
      const fill = document.getElementById('sec-pw-fill');
      if (fill) { fill.style.width = '0%'; }
    } catch (err) {
      showError('change-pw-error', err.error || 'Password change failed.');
    }
  };

  /* ═══════════════════════════════════════
     2FA TOGGLE
  ═══════════════════════════════════════ */
  window.toggleTFA = async function () {
    const icon = document.getElementById('tfa-icon');
    const title = document.getElementById('tfa-status-title');
    const sub = document.getElementById('tfa-status-sub');
    const btn = document.getElementById('tfa-toggle-btn');
    const qr = document.getElementById('qr-placeholder');

    if (!_tfaEnabled) {
      // Enable 2FA — get QR code from server
      try {
        const setup = await GG.Auth.setup2FA();
        _tfaSetupSecret = setup.secret;
        // Show QR code
        if (qr) {
          qr.innerHTML = `<div class="tfa-setup">
            <img class="tfa-setup-qr" src="${setup.qr}" alt="Scan this QR code" loading="lazy" decoding="async">
            <p class="tfa-manual-key">Manual key: ${setup.secret}</p>
            <div class="tfa-confirm-row">
              <label for="tfa-confirm-code" class="sr-only">Enter 6-digit 2FA code</label>
              <input type="text" id="tfa-confirm-code" class="tfa-confirm-input" aria-label="6-digit authentication code" placeholder="Enter code from app" maxlength="6">
              <button type="button" class="tfa-confirm-btn" data-csp-onclick="confirmTFASetup()">Confirm</button>
            </div>
          </div>`;
          qr.classList.add('visible');
        }
      } catch (err) {
        GG.Toast.error(err.error || '2FA setup failed.');
      }
    } else {
      // Disable 2FA — need code
      const code = prompt('Enter your current 2FA code to disable:');
      if (!code) return;
      try {
        await GG.Auth.disable2FA(code);
        _tfaEnabled = false;
        icon.className = 'tfa-icon off';
        icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        title.textContent = '2FA Disabled';
        sub.textContent = 'Protect your account with an authenticator app';
        btn.className = 'tfa-btn tfa-enable-btn';
        btn.textContent = 'Enable 2FA';
        if (qr) qr.classList.remove('visible');
        GG.Toast.warning('Two-factor authentication disabled.');
        refreshSecurityScore();
      } catch (err) {
        GG.Toast.error(err.error || 'Invalid code.');
      }
    }
  };

  let _tfaSetupSecret = null;

  window.confirmTFASetup = async function () {
    const code = document.getElementById('tfa-confirm-code').value.trim();
    if (!code || code.length !== 6) { GG.Toast.warning('Enter the 6-digit code from your authenticator app.'); return; }
    try {
      await GG.Auth.confirm2FA(code);
      _tfaEnabled = true;
      const icon = document.getElementById('tfa-icon');
      const title = document.getElementById('tfa-status-title');
      const sub = document.getElementById('tfa-status-sub');
      const btn = document.getElementById('tfa-toggle-btn');
      icon.className = 'tfa-icon on';
      icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
      title.textContent = '2FA Enabled';
      sub.textContent = 'Your account is protected with two-factor authentication';
      btn.className = 'tfa-btn tfa-disable-btn';
      btn.textContent = 'Disable 2FA';
      GG.Toast.success('Two-factor authentication enabled!');
      generateRecoveryCodes();
      refreshSecurityScore();
    } catch (err) {
      GG.Toast.error(err.error || 'Invalid code. Try again.');
    }
  };

  window.generateRecoveryCodes = function () {
    const codesEl = document.getElementById('recovery-codes');
    if (!codesEl) return;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const codes = Array.from({ length: 6 }, () => {
      const part1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      return part1 + '-' + part2;
    });
    codesEl.innerHTML = codes.map(c => `<div class="recovery-code">${c}</div>`).join('');
    if (_tfaEnabled) GG.Toast.info('New recovery codes generated. Save them securely.');
  };

  /* ═══════════════════════════════════════
     SIGN OUT ALL
  ═══════════════════════════════════════ */
  window.signOutAll = async function () {
    try {
      await GG.Auth.logoutAll();
      GG.Toast.info('Signed out from all devices.');
    } catch {
      GG.Auth.logout();
      GG.Toast.info('Signed out.');
    }
  };

  /* ═══════════════════════════════════════
     CHECKOUT SUCCESS
  ═══════════════════════════════════════ */
  function showCheckoutSuccess(order) {
    // Populate modal
    document.getElementById('checkout-order-id').textContent = order.id;
    document.getElementById('checkout-total-value').textContent = GG.UI.formatPrice(order.total);

    const itemsList = document.getElementById('checkout-items-list');
    itemsList.innerHTML = (Array.isArray(order.items) ? order.items : []).map(item => {
      const price = item.price_paid || item.salePrice || item.price;
      const imgEl = item.image
        ? `<img class="checkout-item-img" src="${GG.Security.sanitize(item.image)}" alt="${GG.Security.sanitize(item.title)}" data-csp-onerror="this.style.display='none'" loading="lazy" decoding="async">`
        : '';
      return `
        <div class="checkout-item">
          ${imgEl}
          <div class="checkout-item-title">${GG.Security.sanitize(item.title)}</div>
          <div class="checkout-item-price">${GG.UI.formatPrice(price)}</div>
        </div>`;
    }).join('');

    GG.UI.showModal('checkout-success-modal');
    spawnConfetti();
    switchDashTab('orders');
  }

  function spawnConfetti() {
    const container = document.getElementById('confetti-container');
    if (!container) return;
    container.innerHTML = '';
    const colors = ['#8B5CF6', '#6366F1', '#06B6D4', '#10B981', '#F59E0B', '#F43F5E', '#C084FC'];
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.animationDelay = Math.random() * 1.5 + 's';
      p.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
      p.style.width = (4 + Math.random() * 8) + 'px';
      p.style.height = (4 + Math.random() * 8) + 'px';
      p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      container.appendChild(p);
    }
  }

  /* ═══════════════════════════════════════
     BOOT
  ═══════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
