const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { OAuth2Client } = require('google-auth-library');

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const MAX_CONSECUTIVE_LOGIN_FAILURES = 5;
const ACCOUNT_LOCK_DURATION_MS = 30 * 60 * 1000;
const DUMMY_HASH = '$2b$12$abcdefghijklmnopqrstuOmQInHIHjh5WkGYV0OaD7/g4sJlW/rCa';

const OAUTH_STATE_COOKIE_OPTS = {
  httpOnly: true,
  maxAge: 10 * 60 * 1000,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

function parseCookie(cookieHeader, name) {
  const entry = (cookieHeader || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/[\s\-().]/g, '');
  if (!/^\+?\d{7,15}$/.test(digits)) return null;
  return digits.startsWith('+') ? digits : `+${digits}`;
}

function parseJsonObject(value, fallback = {}) {
  if (!value) return fallback;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch { return fallback; }
}

function extractSteamIdFromClaimedId(claimedId) {
  const raw = String(claimedId || '').trim();
  if (!raw) return null;
  const match = raw.match(/\/(?:openid\/)?id\/(\d+)\/?$/i) || raw.match(/\/profiles\/(\d+)\/?$/i);
  return match ? match[1] : null;
}

function parseAllowedAvatarHosts() {
  return new Set(
    String(process.env.AVATAR_ALLOWED_HOSTS || 'localhost,127.0.0.1,images.unsplash.com,i.imgur.com,cdn.discordapp.com,lh3.googleusercontent.com,avatars.githubusercontent.com,avatars.steamstatic.com')
      .split(',')
      .map(host => host.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isAllowedAvatarHost(hostname, req) {
  const host = String(hostname || '').toLowerCase();
  const allowed = parseAllowedAvatarHosts();
  const requestHost = String(req.get('host') || '').split(':')[0].toLowerCase();
  return host === requestHost || allowed.has(host) || host.endsWith('.googleusercontent.com');
}

function isUserLocked(user) {
  if (!user?.locked_until) return false;
  const expiresAt = Date.parse(String(user.locked_until));
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function getUserLockRetryAfter(user) {
  if (!isUserLocked(user)) return 0;
  return Math.max(1, Math.ceil((Date.parse(String(user.locked_until)) - Date.now()) / 1000));
}

module.exports = function createAuthRouter({
  db, authLimiter, loginLimiter, twoFactorLimiter, passwordResetLimiter, requireAuth, optionalAuth,
  createSession, safe, hashToken, sendEmail, auditLog, baseUrl,
  encrypt2fa, decrypt2fa, verifyEmailDeliverable, jwtSecret,
}) {
  const JWT_SECRET = jwtSecret;

  const PASSWORD_SPECIAL_CHAR_RE = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;
  const PASSWORD_POLICY_ERROR = 'Password must be at least 8 chars with uppercase, lowercase, a number, and a special character.';

  function validatePasswordStrength(password) {
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !PASSWORD_SPECIAL_CHAR_RE.test(password))
      return PASSWORD_POLICY_ERROR;
    return null;
  }

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
  const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
  const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
  const STEAM_API_KEY = process.env.STEAM_API_KEY || '';
  const OAUTH_CALLBACK_BASE = process.env.OAUTH_CALLBACK_BASE || 'http://localhost:3000';

  const googleOAuth = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_CALLBACK_BASE + '/api/auth/google/callback');

  async function clearFailedLoginState(userId) {
    await db.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?").run(userId);
  }

  async function registerFailedLoginAttempt(user) {
    const nextFailedCount = Number(user?.failed_login_count || 0) + 1;
    const shouldLock = nextFailedCount >= MAX_CONSECUTIVE_LOGIN_FAILURES;
    const lockedUntil = shouldLock ? new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS).toISOString() : null;
    await db.prepare("UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = datetime('now') WHERE id = ?")
      .run(shouldLock ? 0 : nextFailedCount, lockedUntil, user.id);
    return { locked: shouldLock, retryAfter: shouldLock ? Math.ceil(ACCOUNT_LOCK_DURATION_MS / 1000) : 0, failedCount: nextFailedCount };
  }

  async function findOrCreateSocialUser(provider, email, displayName, req) {
    const lowerEmail = email.toLowerCase();
    let user = await db.prepare('SELECT * FROM users WHERE email = ?').get(lowerEmail);
    let created = false;

    if (user) {
      if (!user.social_provider || user.social_provider !== provider || !Number(user.is_verified)) {
        await db.prepare("UPDATE users SET social_provider = ?, is_verified = 1, updated_at = datetime('now') WHERE id = ?").run(provider, user.id);
        user = await db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      }
      if (user.tfa_enabled) {
        const tempToken = jwt.sign({ id: user.id, tfa_pending: true }, JWT_SECRET, { expiresIn: '5m' });
        return { tfa_required: true, temp_token: tempToken };
      }
    } else {
      created = true;
      const uname = (email.split('@')[0]).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || 'player_' + Date.now();
      const existingUsername = await db.prepare('SELECT id FROM users WHERE username = ?').get(uname);
      const finalUsername = existingUsername ? uname + '_' + Math.floor(Math.random() * 9999) : uname;
      const newId = uuid();
      const hash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
      await db.prepare('INSERT INTO users (id, username, email, display_name, password_hash, balance, social_provider, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(newId, finalUsername, lowerEmail, displayName || finalUsername, hash, 500.00, provider, 1);
      user = await db.prepare('SELECT * FROM users WHERE id = ?').get(newId);
      await db.prepare('INSERT INTO notifications (id, user_id, type, title, body) VALUES (?, ?, ?, ?, ?)')
        .run(uuid(), newId, 'welcome', 'Welcome to GameGlitz!', `Signed in via ${provider}. You have $500 in demo balance to explore the store.`);
    }

    const token = await createSession(user, req);
    await auditLog(created ? 'register_social' : 'login', {
      userId: user.id, target: `user:${user.id}`,
      meta: { method: provider.toLowerCase(), provider, created, userAgent: (req.headers['user-agent'] || '').slice(0, 120) },
      ip: req.ip,
    });
    return { token, user: safe(user), created };
  }

  // ── Register ──────────────────────────────────────────
  router.post('/register', authLimiter, async (req, res) => {
    try {
      const { username, email, password, displayName, phone, rememberMe } = req.body;
      if (!username || !email || !password) return res.status(400).json({ error: 'Username, email, and password are required.' });
      if (username.length < 3 || username.length > 30) return res.status(400).json({ error: 'Username must be 3–30 characters.' });
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) return res.status(400).json({ error: 'Username can only contain letters, numbers, _ and -.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address.' });

      const zb = await verifyEmailDeliverable(email);
      if (!zb.ok) return res.status(400).json({ error: `Email address appears undeliverable (${zb.status}). Use a different address.` });

      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      const pwError = validatePasswordStrength(password);
      if (pwError) return res.status(400).json({ error: pwError });

      let normalizedPhone = null;
      if (phone) {
        normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) return res.status(400).json({ error: 'Invalid phone number. Use international format, e.g. +1 555 123 4567.' });
      }

      const existing = await db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email.toLowerCase(), username.toLowerCase());
      if (existing) return res.status(409).json({ error: 'Email or username already taken.' });

      if (normalizedPhone) {
        const phoneExists = await db.prepare('SELECT id FROM users WHERE phone = ?').get(normalizedPhone);
        if (phoneExists) return res.status(409).json({ error: 'Phone number already registered.' });
      }

      const id = uuid();
      const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
      await db.prepare('INSERT INTO users (id, username, email, phone, display_name, password_hash, balance) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, username.toLowerCase(), email.toLowerCase(), normalizedPhone, displayName || username, hash, 500.00);

      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      const token = await createSession(user, req, { rememberMe: !!rememberMe });

      await db.prepare('INSERT INTO notifications (id, user_id, type, title, body) VALUES (?, ?, ?, ?, ?)')
        .run(uuid(), id, 'welcome', 'Welcome to GameGlitz!', 'Your account is ready. You have $500 in demo balance to explore the store.');

      const rawVerify = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await db.prepare('INSERT INTO email_verification_tokens (id, user_id, email, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(uuid(), id, user.email, hashToken(rawVerify), expiresAt);
      const verifyUrl = `${baseUrl(req)}/api/auth/verify-email?token=${rawVerify}`;
      await sendEmail({ to: user.email, subject: 'Verify your GameGlitz account', text: `Welcome to GameGlitz!\n\nConfirm your email (valid 24h):\n${verifyUrl}\n\nIf you didn't sign up, ignore this.` });

      await auditLog('register', { userId: id, target: `user:${id}`, meta: { username: user.username, email: user.email, zb_status: zb.status || 'skipped', userAgent: (req.headers['user-agent'] || '').slice(0, 120) }, ip: req.ip });
      res.status(201).json({ token, user: safe(user), email_verification_sent: true });
    } catch (err) {
      if (err.message?.includes('UNIQUE') || err.message?.includes('2627') || err.message?.includes('2601'))
        return res.status(409).json({ error: 'Email, username, or phone already taken.' });
      console.error('Register error:', err);
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  });

  // ── Login ─────────────────────────────────────────────
  router.post('/login', loginLimiter, async (req, res) => {
    try {
      const { login, password, rememberMe } = req.body;
      if (!login || !password) return res.status(400).json({ error: 'Email/username/phone and password are required.' });
      const loginLower = login.toLowerCase().trim();
      const normalizedPhone = normalizePhone(login);
      const user = await db.prepare('SELECT * FROM users WHERE email = ? OR username = ? OR (phone IS NOT NULL AND phone = ?)').get(loginLower, loginLower, normalizedPhone || '');
      const passwordMatch = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);
      if (user && isUserLocked(user)) {
        const retryAfter = getUserLockRetryAfter(user);
        await auditLog('login_locked', { userId: user.id, target: `user:${user.id}`, meta: { method: 'password', retry_after: retryAfter, userAgent: (req.headers['user-agent'] || '').slice(0, 120) }, ip: req.ip });
        return res.status(423).json({ error: 'Your account is temporarily locked after too many failed login attempts.', retry_after: retryAfter });
      }
      if (!user || !passwordMatch) {
        let lockState = null;
        if (user) {
          lockState = await registerFailedLoginAttempt(user);
          await auditLog('login_failed', { userId: user.id, target: `user:${user.id}`, meta: { method: 'password', locked: !!lockState?.locked, failed_count: lockState?.failedCount || Number(user.failed_login_count || 0) + 1, userAgent: (req.headers['user-agent'] || '').slice(0, 120) }, ip: req.ip });
        }
        if (lockState?.locked) return res.status(423).json({ error: 'Your account is temporarily locked after too many failed login attempts.', retry_after: lockState.retryAfter });
        return res.status(401).json({ error: 'Invalid credentials. Check your email/username and password.' });
      }
      if (Number(user.failed_login_count || 0) > 0 || user.locked_until) await clearFailedLoginState(user.id);
      if (user.tfa_enabled) {
        const tempToken = jwt.sign({ id: user.id, tfa_pending: true, rememberMe: !!rememberMe }, JWT_SECRET, { expiresIn: '5m' });
        return res.json({ tfa_required: true, temp_token: tempToken });
      }
      const token = await createSession(user, req, { rememberMe: !!rememberMe });
      await auditLog('login', { userId: user.id, target: `user:${user.id}`, meta: { method: 'password', userAgent: (req.headers['user-agent'] || '').slice(0, 120) }, ip: req.ip });
      res.json({ token, user: safe(user) });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed.' });
    }
  });

  // ── 2FA Verify ────────────────────────────────────────
  router.post('/verify-2fa', twoFactorLimiter, async (req, res) => {
    try {
      const { temp_token, code } = req.body;
      if (!temp_token || !code) return res.status(400).json({ error: 'Token and code are required.' });
      let decoded;
      try { decoded = jwt.verify(temp_token, JWT_SECRET); } catch { return res.status(401).json({ error: 'Expired. Please log in again.' }); }
      if (!decoded.tfa_pending) return res.status(400).json({ error: 'Invalid token.' });
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
      if (!user || !user.tfa_secret) return res.status(400).json({ error: 'User not found.' });
      if (!authenticator.check(code, decrypt2fa(user.tfa_secret))) return res.status(401).json({ error: 'Invalid 2FA code. Please try again.' });
      const token = await createSession(user, req, { rememberMe: !!decoded.rememberMe });
      await auditLog('login_2fa', { userId: user.id, ip: req.ip });
      res.json({ token, user: safe(user) });
    } catch (err) {
      console.error('2FA verify error:', err);
      res.status(500).json({ error: '2FA verification failed.' });
    }
  });

  // ── 2FA Setup / Confirm / Disable ────────────────────
  router.post('/setup-2fa', requireAuth, twoFactorLimiter, async (req, res) => {
    try {
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      if (user.tfa_enabled) return res.status(400).json({ error: '2FA is already enabled.' });
      const secret = authenticator.generateSecret();
      const otpauthUrl = authenticator.keyuri(user.email, 'GameGlitz', secret);
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
      // Overwrite any previously dangling unconfirmed secret
      await db.prepare('UPDATE users SET tfa_secret = ?, tfa_enabled = 0 WHERE id = ?').run(encrypt2fa(secret), req.user.id);
      res.json({ secret, qr: qrDataUrl, otpauth: otpauthUrl });
    } catch (err) {
      console.error('2FA setup error:', err);
      res.status(500).json({ error: '2FA setup failed.' });
    }
  });

  router.post('/confirm-2fa', requireAuth, twoFactorLimiter, async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: 'Verification code is required.' });
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      if (!user.tfa_secret) return res.status(400).json({ error: 'No 2FA setup in progress.' });
      if (!authenticator.check(code, decrypt2fa(user.tfa_secret))) return res.status(401).json({ error: 'Invalid code. Try again.' });
      await db.prepare('UPDATE users SET tfa_enabled = 1 WHERE id = ?').run(req.user.id);
      res.json({ success: true, message: '2FA is now enabled!' });
    } catch (err) {
      res.status(500).json({ error: '2FA confirmation failed.' });
    }
  });

  router.post('/disable-2fa', requireAuth, twoFactorLimiter, async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: 'Verification code is required.' });
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      if (!user.tfa_enabled) return res.status(400).json({ error: '2FA is not enabled.' });
      if (!authenticator.check(code, decrypt2fa(user.tfa_secret))) return res.status(401).json({ error: 'Invalid 2FA code.' });
      await db.prepare('UPDATE users SET tfa_enabled = 0, tfa_secret = NULL WHERE id = ?').run(req.user.id);
      res.json({ success: true, message: '2FA disabled.' });
    } catch (err) {
      console.error('Disable 2FA error:', err);
      res.status(500).json({ error: '2FA disable failed.' });
    }
  });

  // ── Me / Sessions / Login History ────────────────────
  router.get('/me', requireAuth, async (req, res) => {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(401).json({ error: 'Account not found.' });
    res.json({ user: safe(user) });
  });

  router.post('/refresh', requireAuth, authLimiter, async (req, res) => {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(401).json({ error: 'Account not found.' });

    const session = await db.prepare('SELECT expires_at FROM sessions WHERE id = ? AND user_id = ?').get(req.auth.sessionId, user.id);
    if (!session) return res.status(401).json({ error: 'Session expired or revoked. Please log in again.' });

    const expiresAtMs = Date.parse(String(session.expires_at));
    const longLived = Number.isFinite(expiresAtMs) && expiresAtMs - Date.now() > 7 * 24 * 60 * 60 * 1000;
    const expiry = longLived ? '30d' : '7d';
    const expiryMs = longLived ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email, sid: req.auth.sessionId }, JWT_SECRET, { expiresIn: expiry });
    const tokenHash = hashToken(token);
    const nextExpiresAt = new Date(Date.now() + expiryMs).toISOString();

    await db.prepare("UPDATE sessions SET token_hash = ?, expires_at = ? WHERE id = ? AND user_id = ?").run(tokenHash, nextExpiresAt, req.auth.sessionId, user.id);
    res.json({ token, user: safe(user), expires_at: nextExpiresAt });
  });

  router.get('/sessions', requireAuth, async (req, res) => {
    const sessions = await db.prepare("SELECT id, device, ip, created_at, expires_at FROM sessions WHERE user_id = ? AND expires_at > datetime('now') ORDER BY datetime(created_at) DESC").all(req.user.id);
    res.json({ current_session_id: req.auth.sessionId, sessions: sessions.map(s => ({ ...s, current: s.id === req.auth.sessionId })) });
  });

  router.get('/login-history', requireAuth, async (req, res) => {
    const rows = await db.prepare(`SELECT action, ip, meta, created_at FROM audit_log WHERE user_id = ? AND action IN ('register', 'register_social', 'login', 'login_2fa', 'login_failed', 'change_password', 'password_reset_completed') ORDER BY datetime(created_at) DESC LIMIT 25`).all(req.user.id);
    const history = rows.map(row => {
      const meta = parseJsonObject(row.meta, {});
      return { action: row.action, ip: row.ip || null, created_at: row.created_at, method: typeof meta.method === 'string' ? meta.method : null, device: typeof meta.userAgent === 'string' ? meta.userAgent : null, success: row.action !== 'login_failed' };
    });
    res.json({ history });
  });

  // ── OAuth — Google ────────────────────────────────────
  router.get('/google', (req, res) => {
    if (!GOOGLE_CLIENT_ID) return res.redirect('/account.html?error=oauth_not_configured&provider=Google');
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('oauth_state_google', state, OAUTH_STATE_COOKIE_OPTS);
    const url = googleOAuth.generateAuthUrl({ access_type: 'offline', scope: ['openid', 'email', 'profile'], prompt: 'select_account', state });
    res.redirect(url);
  });

  router.get('/google/callback', async (req, res) => {
    try {
      const { code, state } = req.query;
      if (!code) return res.redirect('/account.html?error=google_no_code');
      const cookieState = parseCookie(req.headers.cookie, 'oauth_state_google');
      res.clearCookie('oauth_state_google');
      if (!state || !cookieState || state !== cookieState) return res.redirect('/account.html?error=oauth_state_mismatch');
      const { tokens } = await googleOAuth.getToken(code);
      const ticket = await googleOAuth.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      const result = await findOrCreateSocialUser('Google', payload.email, payload.name || payload.given_name || payload.email.split('@')[0], req);
      if (result.tfa_required) return res.redirect(`/account.html#tfa_required=true&temp_token=${encodeURIComponent(result.temp_token)}&provider=Google`);
      res.redirect(`/account.html#oauth_token=${encodeURIComponent(result.token)}&provider=Google&created=${result.created || false}`);
    } catch (err) {
      console.error('Google OAuth error:', err);
      res.redirect('/account.html?error=google_auth_failed');
    }
  });

  // ── OAuth — Discord ───────────────────────────────────
  router.get('/discord', (req, res) => {
    if (!DISCORD_CLIENT_ID) return res.redirect('/account.html?error=oauth_not_configured&provider=Discord');
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('oauth_state_discord', state, OAUTH_STATE_COOKIE_OPTS);
    const params = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, redirect_uri: OAUTH_CALLBACK_BASE + '/api/auth/discord/callback', response_type: 'code', scope: 'identify email', prompt: 'consent', state });
    res.redirect('https://discord.com/api/oauth2/authorize?' + params.toString());
  });

  router.get('/discord/callback', async (req, res) => {
    try {
      const { code, state } = req.query;
      if (!code) return res.redirect('/account.html?error=discord_no_code');
      const cookieState = parseCookie(req.headers.cookie, 'oauth_state_discord');
      res.clearCookie('oauth_state_discord');
      if (!state || !cookieState || state !== cookieState) return res.redirect('/account.html?error=oauth_state_mismatch');
      const tokenFetch = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: OAUTH_CALLBACK_BASE + '/api/auth/discord/callback' }).toString() });
      const tokenData = await tokenFetch.json();
      const userFetch = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
      const discordUser = await userFetch.json();
      if (!discordUser.email) return res.redirect('/account.html?error=discord_no_email');
      const result = await findOrCreateSocialUser('Discord', discordUser.email, discordUser.global_name || discordUser.username || discordUser.email.split('@')[0], req);
      if (result.tfa_required) return res.redirect(`/account.html#tfa_required=true&temp_token=${encodeURIComponent(result.temp_token)}&provider=Discord`);
      res.redirect(`/account.html#oauth_token=${encodeURIComponent(result.token)}&provider=Discord&created=${result.created || false}`);
    } catch (err) {
      console.error('Discord OAuth error:', err);
      res.redirect('/account.html?error=discord_auth_failed');
    }
  });

  // ── OAuth — Steam ─────────────────────────────────────
  router.get('/steam', (req, res) => {
    if (!STEAM_API_KEY) return res.redirect('/account.html?error=oauth_not_configured&provider=Steam');
    const params = new URLSearchParams({ 'openid.ns': 'http://specs.openid.net/auth/2.0', 'openid.mode': 'checkid_setup', 'openid.return_to': OAUTH_CALLBACK_BASE + '/api/auth/steam/callback', 'openid.realm': OAUTH_CALLBACK_BASE, 'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select', 'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select' });
    res.redirect('https://steamcommunity.com/openid/login?' + params.toString());
  });

  router.get('/steam/callback', async (req, res) => {
    try {
      const params = { ...req.query, 'openid.mode': 'check_authentication' };
      const verifyFetch = await fetch('https://steamcommunity.com/openid/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
      const verifyText = await verifyFetch.text();
      if (!verifyText.includes('is_valid:true')) return res.redirect('/account.html?error=steam_invalid');
      const claimedId = req.query['openid.claimed_id'];
      const steamId = extractSteamIdFromClaimedId(claimedId);
      if (!steamId) return res.redirect('/account.html?error=steam_no_id');
      const profileFetch = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId}`);
      const profileData = await profileFetch.json();
      const player = profileData.response.players[0];
      if (!player) return res.redirect('/account.html?error=steam_no_player');
      const email = `steam_${steamId}@steamuser.gameglitz.local`;
      const result = await findOrCreateSocialUser('Steam', email, player.personaname || `Steam_${steamId}`, req);
      if (result.tfa_required) return res.redirect(`/account.html#tfa_required=true&temp_token=${encodeURIComponent(result.temp_token)}&provider=Steam`);
      res.redirect(`/account.html#oauth_token=${encodeURIComponent(result.token)}&provider=Steam&created=${result.created || false}`);
    } catch (err) {
      console.error('Steam OAuth error:', err);
      res.redirect('/account.html?error=steam_auth_failed');
    }
  });

  // ── Profile / Password ────────────────────────────────
  router.patch('/profile', requireAuth, async (req, res) => {
    try {
      const { display_name, bio, avatar_url } = req.body;
      const sets = [], params = [];
      if (display_name !== undefined) {
        const value = String(display_name).trim();
        if (value.length < 1)  return res.status(400).json({ error: 'display_name cannot be blank.' });
        if (value.length > 50) return res.status(400).json({ error: 'display_name must be 50 characters or fewer.' });
        sets.push('display_name = ?'); params.push(value);
      }
      if (bio !== undefined) {
        const value = String(bio);
        if (value.length > 500) return res.status(400).json({ error: 'bio must be 500 characters or fewer.' });
        sets.push('bio = ?'); params.push(value);
      }
      if (avatar_url !== undefined) {
        if (avatar_url !== '') {
          try {
            const parsed = new URL(avatar_url);
            if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
            if (String(avatar_url).length > 2048 || !isAllowedAvatarHost(parsed.hostname, req)) throw new Error('bad host');
          } catch { return res.status(400).json({ error: 'avatar_url must be a valid http/https URL.' }); }
        }
        sets.push('avatar_url = ?'); params.push(avatar_url);
      }
      if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
      sets.push("updated_at = datetime('now')"); params.push(req.user.id);
      await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      res.json({ user: safe(user) });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Update failed.' }); }
  });

  router.post('/change-password', requireAuth, authLimiter, async (req, res) => {
    try {
      const { current_password, new_password } = req.body;
      if (!current_password || !new_password) return res.status(400).json({ error: 'current_password and new_password are required.' });
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      if (!bcrypt.compareSync(current_password, user.password_hash)) return res.status(401).json({ error: 'Current password is incorrect.' });
      const pwError = validatePasswordStrength(new_password);
      if (pwError) return res.status(400).json({ error: pwError });
      await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, BCRYPT_ROUNDS), req.user.id);
      await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.user.id);
      await auditLog('change_password', { userId: req.user.id, meta: { userAgent: (req.headers['user-agent'] || '').slice(0, 120) }, ip: req.ip });
      const token = await createSession(user, req);
      res.json({ success: true, token, message: 'Password changed.' });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Change failed.' }); }
  });

  // ── Logout ────────────────────────────────────────────
  router.post('/logout', requireAuth, async (req, res) => {
    const h = crypto.createHash('sha256').update(req._rawToken).digest('hex');
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(h);
    await auditLog('logout', { userId: req.user.id, ip: req.ip });
    res.json({ success: true });
  });

  router.post('/logout-all', requireAuth, async (req, res) => {
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.user.id);
    await auditLog('logout_all', { userId: req.user.id, ip: req.ip });
    res.json({ success: true });
  });

  // ── Email Verification ────────────────────────────────
  router.get('/verify-email', async (req, res) => {
    try {
      const raw = String(req.query.token || '');
      if (!raw) return res.status(400).send('Missing token.');
      const h = hashToken(raw);
      const row = await db.prepare("SELECT * FROM email_verification_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')").get(h);
      if (!row) return res.status(400).send('This verification link is invalid or expired.');
      await db.prepare("UPDATE users SET is_verified = 1, updated_at = datetime('now') WHERE id = ?").run(row.user_id);
      await db.prepare("UPDATE email_verification_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);
      await auditLog('email_verified', { userId: row.user_id, target: `user:${row.user_id}`, meta: { email: row.email }, ip: req.ip });
      res.redirect('/account.html?verified=1');
    } catch (err) { console.error('verify-email error:', err); res.status(500).send('Verification failed.'); }
  });

  router.post('/resend-verification', requireAuth, authLimiter, async (req, res) => {
    if (Number(req.user.is_verified) === 1) return res.json({ success: true, already_verified: true });
    await db.prepare("UPDATE email_verification_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").run(req.user.id);
    const raw = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.prepare('INSERT INTO email_verification_tokens (id, user_id, email, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)').run(uuid(), req.user.id, req.user.email, hashToken(raw), expiresAt);
    const verifyUrl = `${baseUrl(req)}/api/auth/verify-email?token=${raw}`;
    await sendEmail({ to: req.user.email, subject: 'Verify your GameGlitz email', text: `Click this link to verify your email (valid 24h):\n${verifyUrl}` });
    await auditLog('verification_resent', { userId: req.user.id, ip: req.ip });
    res.json({ success: true });
  });

  // ── Password Reset ────────────────────────────────────
  router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
    try {
      const email = String((req.body && req.body.email) || '').toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.json({ success: true });
      const user = await db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
      if (user && !String(user.email || '').endsWith('.gameglitz.local')) {
        await db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").run(user.id);
        const raw = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await db.prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').run(uuid(), user.id, hashToken(raw), expiresAt);
        const resetUrl = `${baseUrl(req)}/reset-password.html?token=${raw}`;
        await sendEmail({ to: user.email, subject: 'Reset your GameGlitz password', text: `Click the link below to reset your password (valid 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.` });
        await auditLog('password_reset_requested', { userId: user.id, target: `user:${user.id}`, ip: req.ip });
      }
      res.json({ success: true });
    } catch (err) { console.error('forgot-password error:', err); res.json({ success: true }); }
  });

  router.post('/reset-password', authLimiter, async (req, res) => {
    try {
      const { token, password } = req.body || {};
      if (!token || !password) return res.status(400).json({ error: 'Token and password are required.' });
      const pwError = validatePasswordStrength(password);
      if (pwError) return res.status(400).json({ error: pwError });
      const h = hashToken(String(token));
      const row = await db.prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')").get(h);
      if (!row) return res.status(400).json({ error: 'Reset link is invalid or expired.' });
      const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
      await db.prepare("UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?").run(hash, row.user_id);
      await db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);
      await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
      await auditLog('password_reset_completed', { userId: row.user_id, target: `user:${row.user_id}`, ip: req.ip });
      res.json({ success: true });
    } catch (err) { console.error('reset-password error:', err); res.status(500).json({ error: 'Password reset failed.' }); }
  });

  // ── Account Deletion ──────────────────────────────────
  router.delete('/account', requireAuth, async (req, res) => {
    try {
      const { password } = req.body || {};
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      if (!user) return res.status(404).json({ error: 'Account not found.' });
      if (!user.social_provider) {
        if (!password) return res.status(400).json({ error: 'Password confirmation is required.' });
        if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Incorrect password.' });
      }
      await auditLog('delete_account', { userId: req.user.id, target: `user:${req.user.id}`, ip: req.ip });
      await db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
      res.json({ success: true, message: 'Account deleted.' });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Deletion failed.' }); }
  });

  return router;
};
